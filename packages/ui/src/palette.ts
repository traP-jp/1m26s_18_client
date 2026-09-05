export const PENLIGHT_PALETTE = [
  "#00e5ff",
  "#fff01f",
  "#ff8c00",
  "#ff00d9",
  "#2979ff",
  "#ff1744",
];

/**
 * サーバーの `color_id (u8)` と `PENLIGHT_PALETTE` の対応。
 * `colorId = PENLIGHT_PALETTE` の添字で固定する。サーバーは id を解釈せず
 * 素通しするため、色を増やすときは末尾追加のみとし既存の id をずらさないこと。
 */
export const DEFAULT_PENLIGHT_COLOR_ID = 0;

export function colorIdToHex(colorId: number): string {
  if (!Number.isInteger(colorId) || colorId < 0 || colorId >= PENLIGHT_PALETTE.length) {
    console.warn(`ignoring unknown penlight color id: ${colorId}`);
    return PENLIGHT_PALETTE[DEFAULT_PENLIGHT_COLOR_ID];
  }
  return PENLIGHT_PALETTE[colorId];
}

export function hexToColorId(hex: string): number {
  const index = PENLIGHT_PALETTE.indexOf(hex);
  return index >= 0 ? index : DEFAULT_PENLIGHT_COLOR_ID;
}
