export interface CreateRoomResult {
  roomId: string;
  hostToken: string;
}

export interface CertificateHash {
  /** SHA-256ダイジェスト(小文字hex、64文字) */
  certificateHash: string;
  /** WebTransportサーバーが待ち受けるUDPポート */
  port: number;
}

export async function createRoom(apiBase: string, songUrl: string): Promise<CreateRoomResult> {
  const res = await fetch(`${apiBase}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ songUrl }),
  });
  if (!res.ok) {
    throw await parseError(res, "部屋の作成に失敗しました");
  }
  return (await res.json()) as CreateRoomResult;
}

export async function getCertificateHash(apiBase: string): Promise<CertificateHash> {
  const res = await fetch(`${apiBase}/webtransport/certificate-hash`);
  if (!res.ok) {
    throw await parseError(res, "証明書ハッシュの取得に失敗しました");
  }
  return (await res.json()) as CertificateHash;
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new Error(`invalid hex string: ${hex}`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function buildRoomUrl(options: {
  host: string;
  port: number;
  roomId: string;
  hostToken?: string;
}): string {
  const url = new URL(
    `https://${options.host}:${options.port}/rooms/${encodeURIComponent(options.roomId)}`,
  );
  if (options.hostToken) {
    url.searchParams.set("hostToken", options.hostToken);
  }
  return url.toString();
}

async function parseError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) {
      return new Error(body.error);
    }
  } catch {
    // ボディがJSONでない場合はフォールバックメッセージを使う
  }
  return new Error(`${fallback} (status ${res.status})`);
}
