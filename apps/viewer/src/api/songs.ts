import { API_BASE } from "./config";

export interface Beat {
  startsAtMs: number;
  endsAtMs: number;
}

export interface Segment {
  startsAtMs: number;
  endsAtMs: number;
  isChorus: boolean;
}

export interface Phrase {
  text: string;
  startsAtMs: number;
  endsAtMs: number;
}

export type SongData =
  | {
      type: "complete";
      artist: string;
      title: string;
      durationMs: number;
      beats: Beat[];
      phrases: Phrase[];
      segments: Segment[];
    }
  | {
      type: "incomplete";
      durationMs: number;
      beats: Beat[];
      segments: Segment[];
    };

export async function fetchSongData(songUrl: string): Promise<SongData> {
  const endpoint = `${API_BASE}/songs?url=${encodeURIComponent(songUrl)}`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`楽曲情報の取得に失敗しました (status ${res.status})`);
  }
  return res.json() as Promise<SongData>;
}

// とりあえず曲全体の平均BPM
export function estimateBpm(beats: Beat[]): number | null {
  if (beats.length === 0) return null;
  const avgBeatMs = beats.reduce((sum, b) => sum + (b.endsAtMs - b.startsAtMs), 0) / beats.length;
  if (avgBeatMs <= 0) return null;
  return 60000 / avgBeatMs;
}
