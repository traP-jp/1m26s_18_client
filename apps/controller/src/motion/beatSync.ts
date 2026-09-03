/**
 * ビート同期判定。振りの開始時刻が「最も近いビート」からどれだけズレているかで判定する。
 *
 * BeatClock は「原点時刻 originMs から bpm で等間隔にビートが並んでいる」というモデルで、
 * 現状はコントローラー画面を開いた時刻を原点にしたローカル時計。
 * WebSocket 実装後は、サーバーから届く再生位置と楽曲の BPM から originMs を算出して差し替える想定。
 * 時刻は全て performance.now() ベース(ShakeEvent.timestamp と同じ基準)。
 */

export interface BeatClock {
  bpm: number;
  /** ビートが乗る基準時刻 (performance.now() 基準, ms) */
  originMs: number;
}

export type BeatJudgement = "perfect" | "good" | "miss";

export interface BeatTiming {
  judgement: BeatJudgement;
  /** 最も近いビートからのズレ (ms)。負なら早い、正なら遅い */
  offsetMs: number;
  /** 最も近いビートの通し番号(原点を 0 とする) */
  beatIndex: number;
}

/** この範囲内なら PERFECT (ms) */
export const PERFECT_WINDOW_MS = 90;
/** この範囲内なら GOOD (ms)。これを超えると MISS */
export const GOOD_WINDOW_MS = 170;

export function beatIntervalMs(clock: BeatClock): number {
  return 60_000 / clock.bpm;
}

export function judgeBeatTiming(timestampMs: number, clock: BeatClock): BeatTiming {
  const interval = beatIntervalMs(clock);
  const elapsed = timestampMs - clock.originMs;
  const beatIndex = Math.round(elapsed / interval);
  const offsetMs = elapsed - beatIndex * interval;
  const abs = Math.abs(offsetMs);

  const judgement: BeatJudgement =
    abs <= PERFECT_WINDOW_MS ? "perfect" : abs <= GOOD_WINDOW_MS ? "good" : "miss";
  return { judgement, offsetMs, beatIndex };
}

/** now から次のビートまでの待ち時間 (ms)。ビート表示のタイマーを時計に同期させるために使う */
export function msUntilNextBeat(nowMs: number, clock: BeatClock): number {
  const interval = beatIntervalMs(clock);
  const elapsed = nowMs - clock.originMs;
  const phase = ((elapsed % interval) + interval) % interval;
  return interval - phase;
}
