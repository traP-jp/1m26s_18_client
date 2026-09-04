import { decodeServerMessage, encodeClientMessage, WireFormatError } from "./wire";
import type { ClientMessage, ServerMessage } from "./wire";

export interface ServerCertificateHash {
  algorithm: "sha-256";
  value: BufferSource;
}

export interface RoomConnectOptions {
  url: string;
  serverCertificateHashes?: ServerCertificateHash[];
}

/**
 * 単調時計(performance.now())由来の unix エポック時刻 (ms)。
 * Date.now() と異なりページ表示中のシステム時計のジャンプの影響を受けない。
 */
export function epochNowMs(): number {
  return performance.timeOrigin + performance.now();
}

/** 送受信時刻付きの `request()` 結果。時刻同期などで t0/t3 の正確な記録が必要な場合に使う */
export interface TimedResponse {
  /** サーバーからの応答。接続が閉じられていた場合は null */
  response: ServerMessage | null;
  /** リクエスト書き込み直前のローカル時刻 (unix エポック ms) */
  sentAtMs: number;
  /** 応答受信直後のローカル時刻 (unix エポック ms)。sentAtMs と同じ基準 */
  receivedAtMs: number;
}

export class RoomConnection {
  readonly #transport: WebTransport;
  readonly #datagramWriter: WritableStreamDefaultWriter<Uint8Array>;
  readonly #serverMessageListeners = new Set<(message: ServerMessage) => void>();
  #open = true;

  onClose: (() => void) | null = null;

  private constructor(
    transport: WebTransport,
    datagramWriter: WritableStreamDefaultWriter<Uint8Array>,
  ) {
    this.#transport = transport;
    this.#datagramWriter = datagramWriter;
  }

  static async connect(options: RoomConnectOptions): Promise<RoomConnection> {
    if (typeof WebTransport === "undefined") {
      throw new Error("WebTransportが利用できません(HTTPSが有効な環境で起動してください)");
    }
    const transport = new WebTransport(options.url, {
      serverCertificateHashes: options.serverCertificateHashes,
    });
    await transport.ready;
    const datagramWriter = transport.datagrams.writable.getWriter();
    const connection = new RoomConnection(transport, datagramWriter);
    connection.#startReceiving();
    return connection;
  }

  async join(): Promise<string> {
    const response = await this.request({ type: "join" });
    if (response === null) {
      throw new WireFormatError("connection closed before a Joined response");
    }
    if (response.type === "error") {
      throw new Error(response.message);
    }
    if (response.type !== "joined") {
      throw new WireFormatError(`unexpected response: ${response.type}`);
    }
    return response.participantId;
  }

  async request(message: ClientMessage): Promise<ServerMessage | null> {
    const { response } = await this.requestTimed(message);
    return response;
  }

  async requestTimed(message: ClientMessage): Promise<TimedResponse> {
    const stream = await this.#transport.createBidirectionalStream();
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    try {
      const sentAtMs = epochNowMs();
      await writer.write(encodeClientMessage(message));
      await writer.close();
      const chunks = await readAll(reader);
      const receivedAtMs = epochNowMs();
      if (chunks.length === 0) {
        return { response: null, sentAtMs, receivedAtMs };
      }
      return {
        response: decodeServerMessage(concatChunks(chunks)),
        sentAtMs,
        receivedAtMs,
      };
    } finally {
      reader.releaseLock();
      writer.releaseLock();
    }
  }

  async sendDatagram(message: ClientMessage): Promise<void> {
    await this.#datagramWriter.write(encodeClientMessage(message));
  }

  /**
   * サーバーからのプッシュメッセージを購読する。複数登録可能。
   * 戻り値の関数を呼ぶと購読を解除できる。
   */
  subscribeServerMessage(listener: (message: ServerMessage) => void): () => void {
    this.#serverMessageListeners.add(listener);
    return () => {
      this.#serverMessageListeners.delete(listener);
    };
  }

  close(): void {
    if (!this.#open) {
      return;
    }
    this.#open = false;
    this.#datagramWriter.close().catch(() => undefined);
    this.#transport.close({ closeCode: 0, reason: "" });
    this.onClose?.();
  }

  #startReceiving(): void {
    void this.#receiveStreams();
    void this.#receiveDatagrams();
    void this.#transport.closed.then(
      () => this.#handleClose(),
      () => this.#handleClose(),
    );
  }

  async #receiveStreams(): Promise<void> {
    const reader = this.#transport.incomingBidirectionalStreams.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          return;
        }
        if (value) {
          void this.#receiveStream(value as WebTransportBidirectionalStream);
        }
      }
    } catch {
      this.#handleClose();
    } finally {
      reader.releaseLock();
    }
  }

  async #receiveStream(stream: WebTransportBidirectionalStream): Promise<void> {
    const reader = stream.readable.getReader();
    try {
      const chunks = await readAll(reader);
      if (chunks.length === 0) {
        return;
      }
      this.#emitServerMessage(decodeServerMessage(concatChunks(chunks)));
    } catch (error) {
      console.warn("ignoring undecodable server stream", error);
    } finally {
      reader.releaseLock();
    }
  }

  async #receiveDatagrams(): Promise<void> {
    const reader = this.#transport.datagrams.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          return;
        }
        if (value) {
          try {
            this.#emitServerMessage(decodeServerMessage(toUint8Array(value)));
          } catch (error) {
            console.warn("ignoring undecodable datagram", error);
          }
        }
      }
    } catch {
      this.#handleClose();
    } finally {
      reader.releaseLock();
    }
  }

  #emitServerMessage(message: ServerMessage): void {
    for (const listener of [...this.#serverMessageListeners]) {
      try {
        listener(message);
      } catch (error) {
        console.warn("ignoring server message listener error", error);
      }
    }
  }

  #handleClose(): void {
    if (!this.#open) {
      return;
    }
    this.#open = false;
    this.onClose?.();
  }
}

function toUint8Array(data: BufferSource): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

async function readAll(reader: ReadableStreamDefaultReader): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      return chunks;
    }
    if (value) {
      chunks.push(toUint8Array(value));
    }
  }
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0];
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
