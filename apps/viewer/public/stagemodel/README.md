# ステージ3Dモデル

| ファイル | 内容 | 出典 | ライセンス |
|---|---|---|---|
| `truss.glb` | トラス(鉄格子)のみ | `stagemodel-src/bar.lead+screen.blend1` の `Square Truss125.003/.004/.005` を書き出し・最適化 | **未確認 — 公開前に要確認** |

スポットライト・スピーカーは実モデルを使わず`MikuModel3D.tsx`内でプロシージャルに生成している
(見た目を1種類に統一し、画面幅・Mikuの身長に応じて自動調整するため)。

`truss.glb`の生成元(`../stagemodel-src/bar.lead+screen.blend1`、136MB)はテクスチャのファイルパスに
出所不明のフォルダ(`STAAAN`, `compu city`のデスクトップ等)を含んでおり、CC0/CC-BYであることを
確認できていない。配布・公開前に元アセットのライセンスを確認し、必要ならクレジット表記をここに追記すること。

`truss.glb`は[glTF-Transform](https://gltf-transform.dev/)で最適化済み(Meshopt圧縮)。読み込みは
`MikuModel3D.tsx`の`attachStageDecor()`を参照。
