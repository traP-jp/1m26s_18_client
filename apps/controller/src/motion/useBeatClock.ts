import { useEffect, useRef, useState } from "react";
import { beatIntervalMs, msUntilNextBeat, type BeatClock } from "./beatSync";

export interface BeatClockState {
  /** 判定に使う時計。WebSocket 実装後はサーバー時刻から作ったものに置き換える */
  clock: BeatClock;
  /** ビート直後の短い間だけ true(ビートドットの点滅用) */
  pulse: boolean;
}

/**
 * 画面を開いた時刻を原点にしたローカルのビート時計を作り、ビートに同期した点滅フラグを返す。
 * setInterval のドリフトを避けるため、毎回「次のビートまでの残り時間」を時計から計算して setTimeout する。
 */
export function useBeatClock(bpm: number): BeatClockState {
  const [clock] = useState<BeatClock>(() => ({ bpm, originMs: performance.now() }));
  const [pulse, setPulse] = useState(false);
  const clockRef = useRef(clock);
  clockRef.current = { ...clock, bpm };

  useEffect(() => {
    let beatTimer: number | null = null;
    let offTimer: number | null = null;

    const schedule = () => {
      const now = performance.now();
      beatTimer = window.setTimeout(() => {
        setPulse(true);
        offTimer = window.setTimeout(
          () => setPulse(false),
          beatIntervalMs(clockRef.current) * 0.3,
        );
        schedule();
      }, msUntilNextBeat(now, clockRef.current));
    };
    schedule();

    return () => {
      if (beatTimer !== null) window.clearTimeout(beatTimer);
      if (offTimer !== null) window.clearTimeout(offTimer);
    };
  }, [bpm]);

  return { clock: clockRef.current, pulse };
}
