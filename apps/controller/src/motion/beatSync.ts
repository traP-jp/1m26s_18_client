/**
 * ビート同期判定。振りの開始時刻が「最も近いビート」からどれだけズレているかで判定する。
 *
 * ビートの基準時刻は `startsAtMs` と `endsAtMs` の中央値を使う。
 * ビート列は API (`GET /rooms/{room_id}`) から取得した楽曲情報の `beats` を
 * 取得時に中央値昇順へソートしたもの(`useRoomSong`)を使うこと。
 * 時刻はライブ開始からの経過時間 (ms) で、`useLiveClock().getElapsedMs()` の
 * 返す値と同じ基準で比較すること。
 */

export type BeatJudgement = "perfect" | "good" | "miss";

export interface BeatTiming {
  judgement: BeatJudgement;
  /** 最も近いビートからのズレ (ms)。負なら早い、正なら遅い */
  offsetMs: number;
  /** 最も近いビートの index (`beats` 配列上の位置) */
  beatIndex: number;
}

/** この範囲内なら PERFECT (ms) */
export const PERFECT_WINDOW_MS = 90;
/** この範囲内なら GOOD (ms)。これを超えると MISS */
export const GOOD_WINDOW_MS = 170;

/** ビートの基準時刻。`startsAtMs` と `endsAtMs` の中央値 (ms) */
export function beatCenterMs(beat: { startsAtMs: number; endsAtMs: number }): number {
  return (beat.startsAtMs + beat.endsAtMs) / 2;
}

/**
 * ライブ開始からの経過時刻に最も近いビートを探して判定する。
 * `beats` は中央値昇順ソート済みであること。
 */
export function judgeBeatByElapsed(
  elapsedMs: number,
  beats: readonly { startsAtMs: number; endsAtMs: number }[],
): BeatTiming {
  const beatIndex = nearestBeatIndex(elapsedMs, beats);
  const offsetMs = elapsedMs - beatCenterMs(beats[beatIndex]);
  const abs = Math.abs(offsetMs);

  const judgement: BeatJudgement =
    abs <= PERFECT_WINDOW_MS ? "perfect" : abs <= GOOD_WINDOW_MS ? "good" : "miss";
  return { judgement, offsetMs, beatIndex };
}

/** 中央値が `elapsedMs` に最も近いビートの index を二分探索で求める */
function nearestBeatIndex(
  elapsedMs: number,
  beats: readonly { startsAtMs: number; endsAtMs: number }[],
): number {
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beatCenterMs(beats[mid]) < elapsedMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  // lo は elapsedMs 以上の最初のビート(または末尾)。前後で近い方を選ぶ
  if (
    lo > 0 &&
    Math.abs(beatCenterMs(beats[lo - 1]) - elapsedMs) <=
      Math.abs(beatCenterMs(beats[lo]) - elapsedMs)
  ) {
    return lo - 1;
  }
  return lo;
}
