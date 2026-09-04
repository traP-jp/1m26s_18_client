import { useEffect, useState } from "react";
import { beatCenterMs } from "../motion/useMotion";
import { useLiveClock } from "./useLiveClock";
import type { Beat } from "../api/rooms";

/** ビートヒット後にドットを点灯させておく時間 (ms) */
const PULSE_MS = 120;

/**
 * 楽曲のビート列に同期した点滅フラグを返す(ビートドット表示用)。
 * 再生位置は `useLiveClock().getElapsedMs()` で求め、次のビートまでの
 * 残り時間で `setTimeout` を組み直す。未開始・時刻未同期の間は常に false。
 * ビートの基準時刻は判定と同じく中央値 (`(startsAtMs + endsAtMs) / 2`)。
 *
 * `beats` は中央値昇順ソート済みであること(`useRoomSong` が保証)。
 */
export function useLiveBeatPulse(beats: readonly Beat[]): boolean {
  const { getElapsedMs, liveStartTimeUs } = useLiveClock();
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (beats.length === 0) {
      setPulse(false);
      return;
    }
    let beatTimer: number | null = null;
    let offTimer: number | null = null;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      const elapsed = getElapsedMs();
      if (elapsed === null) return;
      const nextIndex = beats.findIndex((beat) => beatCenterMs(beat) > elapsed);
      if (nextIndex === -1) return;
      const delay = beatCenterMs(beats[nextIndex]) - elapsed;
      beatTimer = window.setTimeout(() => {
        if (cancelled) return;
        setPulse(true);
        offTimer = window.setTimeout(() => {
          if (!cancelled) setPulse(false);
        }, PULSE_MS);
        schedule();
      }, Math.max(0, delay));
    };
    schedule();

    return () => {
      cancelled = true;
      if (beatTimer !== null) window.clearTimeout(beatTimer);
      if (offTimer !== null) window.clearTimeout(offTimer);
    };
  }, [beats, getElapsedMs, liveStartTimeUs]);

  return pulse;
}
