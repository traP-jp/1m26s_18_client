/** コントローラー・ビューアで共有するスタンプ1件の情報 */
export interface Stamp {
  /** ワイヤ上の stamp id (u8)。`STAMPS` 配列の添字と一致する */
  id: number;
  /** traQ 上のスタンプ名 */
  name: string;
  /** traQ 上のスタンプ UUID */
  traqId: string;
  /** バンドルされた画像の URL */
  src: string;
}
