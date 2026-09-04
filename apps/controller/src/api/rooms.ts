import { buildRoomUrl, getCertificateHash, hexToBytes } from "protocol";
import type { RoomConnectOptions } from "protocol";
import { API_BASE, WEBTRANSPORT_HOST } from "./config";

/** 楽曲のビート1拍分。基準時刻は `startsAtMs` と `endsAtMs` の中央値を使う */
export interface Beat {
  startsAtMs: number;
  endsAtMs: number;
}

export interface CompleteSongData {
  title: string;
  artist: string;
  durationMs: number;
  beats: Beat[];
}

interface GetRoomResponse {
  song: CompleteSongData;
}

export async function getRoomConnectOptions(roomId: string): Promise<RoomConnectOptions> {
  const { certificateHash, port } = await getCertificateHash(API_BASE);
  return {
    url: buildRoomUrl({
      host: WEBTRANSPORT_HOST,
      port,
      roomId,
    }),
    serverCertificateHashes: [{ algorithm: "sha-256", value: hexToBytes(certificateHash) }],
  };
}

/** 部屋の楽曲情報を取得する。`GET /rooms/{room_id}` */
export async function getRoomSong(roomId: string, signal?: AbortSignal): Promise<CompleteSongData> {
  const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomId)}`, { signal });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("部屋が存在しません。コードを確認してください。");
    }
    throw new Error(`楽曲情報の取得に失敗しました (status ${res.status})`);
  }
  const body = (await res.json()) as GetRoomResponse;
  return body.song;
}
