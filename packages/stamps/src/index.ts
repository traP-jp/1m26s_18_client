import { STAMPS } from "./manifest";
import type { Stamp } from "./types";

export type { Stamp } from "./types";
export { STAMPS };

/** ビューアで風船(浮遊アニメーション)として表示するスタンプの名前 */
export const BALLOON_STAMP_NAME = "balloon";

/** 風船として表示するスタンプかどうか */
export function isBalloonStamp(stamp: Stamp): boolean {
  return stamp.name === BALLOON_STAMP_NAME;
}

/** ワイヤ上の stamp id (u8) に対応するスタンプ。未知の id なら undefined */
export function stampById(id: number): Stamp | undefined {
  if (!Number.isInteger(id) || id < 0 || id >= STAMPS.length) {
    return undefined;
  }
  return STAMPS[id];
}
