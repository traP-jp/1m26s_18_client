export const EventId = {
  Join: 0x01,
  TimeSyncRequest: 0x02,
  Heartbeat: 0x03,
  Ready: 0x05,
  Stamp: 0x06,
  LiveStart: 0x07,
  ColorChange: 0x08,
  Shake: 0x09,
  Joined: 0x81,
  Error: 0x82,
  TimeSyncResponse: 0x83,
  ParticipantJoined: 0x84,
  ParticipantReady: 0x85,
  ParticipantStamp: 0x86,
  LiveStarted: 0x87,
  ParticipantColorChange: 0x88,
  SyncRate: 0x89,
  ParticipantLeft: 0x8a,
} as const;

export type ClientMessage =
  | { type: "join" }
  | { type: "timeSyncRequest" }
  | { type: "heartbeat" }
  | { type: "ready" }
  | { type: "stamp"; stampId: number }
  | { type: "liveStart"; startTime: number }
  | { type: "colorChange"; colorId: number }
  | { type: "shake"; detectedAt: number };

export type ServerMessage =
  | { type: "joined"; participantId: string }
  | { type: "timeSyncResponse"; t1: number; t2: number }
  | { type: "error"; message: string }
  | { type: "participantJoined"; participantId: string }
  | { type: "participantLeft"; participantId: string }
  | { type: "participantReady"; participantId: string }
  | { type: "participantStamp"; participantId: string; stampId: number }
  | { type: "participantColorChange"; participantId: string; colorId: number }
  | { type: "liveStarted"; startTime: number }
  | { type: "syncRate"; rate: number };

export class WireFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WireFormatError";
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ByteWriter {
  readonly #bytes: number[] = [];

  u8(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new WireFormatError(`u8 out of range: ${value}`);
    }
    this.#bytes.push(value);
  }

  u16(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new WireFormatError(`u16 out of range: ${value}`);
    }
    this.#bytes.push((value >> 8) & 0xff, value & 0xff);
  }

  u64(value: number): void {
    const big = BigInt(Math.round(value));
    if (big < 0n || big > 0xffff_ffff_ffff_ffffn) {
      throw new WireFormatError(`u64 out of range: ${value}`);
    }
    for (let shift = 56n; shift >= 0n; shift -= 8n) {
      this.#bytes.push(Number((big >> shift) & 0xffn));
    }
  }

  uuid(value: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new WireFormatError(`invalid UUID: ${value}`);
    }
    for (const byte of uuidToBytes(value)) {
      this.#bytes.push(byte);
    }
  }

  string(value: string): void {
    const encoded = textEncoder.encode(value);
    this.u16(encoded.byteLength);
    for (const byte of encoded) {
      this.#bytes.push(byte);
    }
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.#bytes);
  }
}

class ByteReader {
  readonly #view: DataView;
  #offset = 0;

  constructor(bytes: Uint8Array) {
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get atEnd(): boolean {
    return this.#offset === this.#view.byteLength;
  }

  u8(): number {
    if (this.#offset + 1 > this.#view.byteLength) {
      throw new WireFormatError("unexpected end of input");
    }
    const value = this.#view.getUint8(this.#offset);
    this.#offset += 1;
    return value;
  }

  u16(): number {
    if (this.#offset + 2 > this.#view.byteLength) {
      throw new WireFormatError("unexpected end of input");
    }
    const value = this.#view.getUint16(this.#offset);
    this.#offset += 2;
    return value;
  }

  u64(): number {
    if (this.#offset + 8 > this.#view.byteLength) {
      throw new WireFormatError("unexpected end of input");
    }
    const value = Number(this.#view.getBigUint64(this.#offset));
    this.#offset += 8;
    return value;
  }

  uuid(): string {
    const bytes: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      bytes.push(this.u8());
    }
    return bytesToUuid(bytes);
  }

  string(): string {
    const length = this.u16();
    const bytes: number[] = [];
    for (let i = 0; i < length; i += 1) {
      bytes.push(this.u8());
    }
    return textDecoder.decode(Uint8Array.from(bytes));
  }
}

function uuidToBytes(uuid: string): number[] {
  const hex = uuid.replaceAll("-", "");
  const bytes: number[] = [];
  for (let i = 0; i < 16; i += 1) {
    bytes.push(Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  }
  return bytes;
}

function bytesToUuid(bytes: readonly number[]): string {
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function encodeClientMessage(message: ClientMessage): Uint8Array {
  const writer = new ByteWriter();
  switch (message.type) {
    case "join":
      writer.u8(EventId.Join);
      break;
    case "timeSyncRequest":
      writer.u8(EventId.TimeSyncRequest);
      break;
    case "heartbeat":
      writer.u8(EventId.Heartbeat);
      break;
    case "ready":
      writer.u8(EventId.Ready);
      break;
    case "stamp":
      writer.u8(EventId.Stamp);
      writer.u8(message.stampId);
      break;
    case "liveStart":
      writer.u8(EventId.LiveStart);
      writer.u64(message.startTime);
      break;
    case "colorChange":
      writer.u8(EventId.ColorChange);
      writer.u8(message.colorId);
      break;
    case "shake":
      writer.u8(EventId.Shake);
      writer.u64(message.detectedAt);
      break;
  }
  return writer.toUint8Array();
}

export function decodeServerMessage(bytes: Uint8Array): ServerMessage {
  const reader = new ByteReader(bytes);
  const id = reader.u8();
  let message: ServerMessage;
  switch (id) {
    case EventId.Joined:
      message = { type: "joined", participantId: reader.uuid() };
      break;
    case EventId.Error:
      message = { type: "error", message: reader.string() };
      break;
    case EventId.TimeSyncResponse: {
      const t1 = reader.u64();
      const t2 = reader.u64();
      message = { type: "timeSyncResponse", t1, t2 };
      break;
    }
    case EventId.ParticipantJoined:
      message = { type: "participantJoined", participantId: reader.uuid() };
      break;
    case EventId.ParticipantLeft:
      message = { type: "participantLeft", participantId: reader.uuid() };
      break;
    case EventId.ParticipantReady:
      message = { type: "participantReady", participantId: reader.uuid() };
      break;
    case EventId.ParticipantStamp: {
      const participantId = reader.uuid();
      const stampId = reader.u8();
      message = { type: "participantStamp", participantId, stampId };
      break;
    }
    case EventId.LiveStarted:
      message = { type: "liveStarted", startTime: reader.u64() };
      break;
    case EventId.ParticipantColorChange: {
      const participantId = reader.uuid();
      const colorId = reader.u8();
      message = { type: "participantColorChange", participantId, colorId };
      break;
    }
    case EventId.SyncRate:
      message = { type: "syncRate", rate: reader.u8() };
      break;
    default:
      throw new WireFormatError(`unknown server event id: 0x${id.toString(16).padStart(2, "0")}`);
  }
  if (!reader.atEnd) {
    throw new WireFormatError("trailing bytes after server message");
  }
  return message;
}
