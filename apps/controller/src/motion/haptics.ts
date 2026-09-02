/**
 * Vibration API の薄いラッパー。
 *
 * 対応状況:
 * - Android Chrome / Firefox: 対応。ただしページ内で一度もタップしていない(ユーザーアクティベーションが無い)と
 *   vibrate() は false を返して何も起きない。コントローラー画面には「ライブへ進む」タップを経て来るので通常は問題ない。
 * - iOS Safari: 非対応(navigator.vibrate が存在しない)。呼んでも何も起きないだけで例外は出ない。
 */

import { playFeedbackTone, type FeedbackKind } from "./soundFeedback";

export type HapticPattern = number | number[];

/** ビートにぴったり合った振り */
export const HAPTIC_PERFECT: HapticPattern = 40;
/** 少しズレたがセーフな振り */
export const HAPTIC_GOOD: HapticPattern = 18;
/** コンボの節目(10, 20, ...)で追加の祝福パターン */
export const HAPTIC_COMBO_MILESTONE: HapticPattern = [40, 60, 40, 60, 80];

export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** 振動を鳴らす。非対応環境では false を返すだけで何もしない */
export function vibrate(pattern: HapticPattern): boolean {
  if (!canVibrate()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function stopVibration() {
  if (canVibrate()) navigator.vibrate(0);
}

// ---- 統合フィードバック ----

const VIBRATION_PATTERN: Record<FeedbackKind, HapticPattern> = {
  perfect: HAPTIC_PERFECT,
  good: HAPTIC_GOOD,
  milestone: HAPTIC_COMBO_MILESTONE,
};

export type FeedbackChannel = "vibration" | "sound" | "none";

/**
 * 判定フィードバックの入口。振動が使える環境(Android)は振動、
 * 使えない環境(iOS Safari 等)は Web Audio のクリック音で代替する。
 */
export function playFeedback(kind: FeedbackKind): FeedbackChannel {
  if (canVibrate()) {
    vibrate(VIBRATION_PATTERN[kind]);
    return "vibration";
  }
  return playFeedbackTone(kind) ? "sound" : "none";
}
