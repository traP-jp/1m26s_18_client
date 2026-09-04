import { useCallback, useEffect, useState } from "react";
import { getRoomSong, type Beat } from "../api/rooms";
import { beatCenterMs } from "../motion/useMotion";

export type RoomSongStatus = "loading" | "ready" | "error";

export interface RoomSongState {
  status: RoomSongStatus;
  /** 楽曲のビート列。中央値 (`(startsAtMs + endsAtMs) / 2`) 昇順ソート済み。取得前・失敗時は空配列 */
  beats: Beat[];
  errorMessage: string | null;
  retry: () => void;
}

/**
 * 部屋の楽曲情報(`GET /rooms/{room_id}`)を取得し、ビート列を返す。
 * `roomId` が null の間は取得しない。取得完了前は `beats` が空。
 */
export function useRoomSong(roomId: string | null): RoomSongState {
  const [status, setStatus] = useState<RoomSongStatus>("loading");
  const [beats, setBeats] = useState<Beat[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!roomId) {
      setStatus("loading");
      setBeats([]);
      setErrorMessage(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setStatus("loading");
    setErrorMessage(null);
    void getRoomSong(roomId, controller.signal)
      .then((song) => {
        if (cancelled) return;
        // 判定・ドット表示は中央値を基準にするため、ここで中央値順に並べ替える
        setBeats(
          [...song.beats].sort((a, b) => beatCenterMs(a) - beatCenterMs(b)),
        );
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return;
        setBeats([]);
        setErrorMessage(
          error instanceof Error ? error.message : "楽曲情報の取得に失敗しました",
        );
        setStatus("error");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [roomId, attempt]);

  return { status, beats, errorMessage, retry };
}
