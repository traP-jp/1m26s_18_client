# 画面構成・実装状況

現時点(静的実装フェーズ)での全5画面の構成と、今後実装が必要な機能をまとめたもの。詳細な要件は [req.md](./req.md) を参照。

各画面は `npm run preview -- <app> <screen>` で直接開いて確認できる([README.md](./README.md) 参照)。

## 画面一覧

| # | 画面 | デバイス | アプリ / route | ファイル |
|---|---|---|---|---|
| 1 | URL入力画面 | PC | viewer / `url-input` | `apps/viewer/src/screens/UrlInputScreen.tsx` |
| 2 | 待機・ロビー画面 | PC | viewer / `lobby` | `apps/viewer/src/screens/LobbyScreen.tsx` |
| 3 | ライブ視聴画面 | PC | viewer / `live` | `apps/viewer/src/screens/LiveScreen.tsx` |
| 4 | 待機・キャリブレーション画面 | スマホ | controller / `calibration` | `apps/controller/src/screens/CalibrationScreen.tsx` |
| 5 | コントローラー画面 | スマホ | controller / `controller` | `apps/controller/src/screens/ControllerScreen.tsx` |

画面遷移は各アプリの `App.tsx` がローカル `useState` で管理(react-router 等は未導入)。

---

## 1. URL入力画面(viewer)

- 楽曲URL入力フォーム(送信内容は現状無視してダミーの曲情報を表示するだけ)
- 曲情報カード(曲名・アーティスト名 — `mockSong`)
- 「ロビーへ進む」ボタン

**未実装**: TextAlive App APIへの実URL送信・実データ取得(下記「実装してほしい機能」参照)。

## 2. 待機・ロビー画面(viewer)

- 中央ヒーロー: ルームコード + QR(`RoomJoinCard`、ダミーコード)— このロビーの主目的なので最も大きく表示
- 右カラム縦積み: 参加人数(`ParticipantCounter`)、準備完了度ゲージ(`Gauge`)、曲の進行プレビュー(`ProgressBar`、サビ区間色分け)
- 「ライブ開始」ボタン

**未実装**: 実際のセッション作成・QRコード生成、他参加者のキャリブレーション進捗のリアルタイム反映。

## 3. ライブ視聴画面(viewer)

- **ステージ演出**(`StagePlaceholder`): 照明トラス・3方向スポットライト(光条+粒子ノイズ+ビネット付き)・ヘイズ・床反射のCSS/SVG演出(three.js/PixiJS実装予定のプレースホルダー)
- **バックスクリーン**(`BackScreen`): ミク背後のジャンボトロン風パネル。簡易ビジュアライザー(イコライザーバー)+歌詞ティッカー
- **初音ミク3Dモデル**(`MikuModel3D`): 実際のMMD(PMX)モデルを three.js + `@yohawing/three-mmd-loader` で表示。静止ポーズ、緩やかな左右スウェイのみ
- **観客ペンライト**(`PenlightGrid`): 深度3列+超近景ボケ列(計4層)のグロースティック演出。振り付けモード(`idle` / `fourFloor` / `buildup`)切り替えデモボタン付き(ヘッダー右上、本来はビート/曲区間に応じて自動切り替えする想定)
- **リアクション**(`ReactionOverlay`): `apps/viewer/src/assets/stamp/` 配下の画像を自動収集し、一定間隔でランダムに画面上へ流す(スタンプ・風船とも画像のみ、絵文字フォールバックなし)
- HUD: 視聴人数・熱量シンクロ度ゲージ・「ライブ終了」ボタン、下部にサビ区間色分け進行バー

**未実装**: 実データに基づく再生位置同期、ビートに応じた演出の自動切り替え、コントローラー側操作のリアルタイム反映。

## 4. 待機・キャリブレーション画面(controller)

- 参加人数表示
- マイク/モーションセンサーの許可ステータス(ダミー状態、ボタンで `granted` に切り替わるのみ)
- ペンライト色選択(`ColorPicker`、共有パレット、中央寄せ)
- 試し振りテスト(`ShakeTestArea`): タップでランダムな疑似加速度スパイクを生成し、メーター+しきい値ラインで表示。しきい値を超えると成功カウントが加算される(実センサー未接続時の代替UI)
- 準備完了トグル+「ライブへ進む」ボタン

**未実装**: 実際の `DeviceMotionEvent`/マイク許可フロー、準備完了状態のサーバー同期。

## 5. コントローラー画面(controller)

- ビートドット+コンボ数(`mockBpm` に基づくローカル点滅、コンボ数は固定値)
- 発光パネル(`GlowPanel`): 押している間だけ明るくなる(実センサーの代替)
- ペンライト色選択(共有パレット)
- スタンプ/風船ボタン(ローカルトースト表示のみ、viewer側には未連携)
- 「歌う」ボタン(`VoiceMeter`): **実装済み** — `getUserMedia` + Web Audio API `AnalyserNode` で実際のマイク音量をRMS計算し、リアルタイムメーター表示

**未実装**: スタンプ/風船・ペンライト操作のviewerへのリアルタイム送信。

---

## 共有パッケージ(`packages/ui`)

- `tokens.css`: 色・spacing・glow等のCSS変数
- `palette.ts`: `PENLIGHT_PALETTE`(ペンライト共通6色。トラス照明・観客・コントローラーの色選択すべてがこれを参照)
- 共有コンポーネント: `Button` `Panel` `ProgressBar` `Gauge` `ParticipantCounter` `RoomJoinCard` `PenlightGrid` `ColorPicker` `ReactionOverlay` `IconToggleButton`

---

## 実装してほしい機能(未実装・要対応)

優先度の高そうな順。

### 1. TextAlive App API連携
現状、曲名・アーティスト・サビ区間・歌詞はすべて `mockData.ts` のハードコード値。`textalive-app-api` パッケージで実データ取得に置き換える(開発者トークン・テスト用実在楽曲URLが必要 — 別途確認中)。**サムネイルはAPIから取得できない**ため、別途プレースホルダー/代替画像方針が必要。

### 2. WebSocketによるリアルタイム同期
req.md 6章で定義した通信仕様(`join_session` / `state_update` / `sync_playback` 等)が未実装。現状は各アプリが完全に独立して動作しており、controller の操作は viewer に一切反映されない。バックエンド側の実装状況に依存。

### 3. 実センサー(DeviceMotionEvent)
ペンライトを振る動作は現状 `onPointerDown`(タップ/押下)で代替。iOS 13+ の許可ダイアログ実装も含め未着手。

### 4. Vibration API
シンクロ成功時の振動フィードバック(req.md 4.1)は未実装。

### 5. ビート同期判定ロジック
観客の振り付けモード(`idle`/`fourFloor`/`buildup`)は手動デモボタンでの切り替えのみ。実際の曲のビート・Aメロ/Bメロ/サビ区間に応じた自動切り替えは未実装(区間データ自体もTextAlive連携後、サビ以外は手動タグ付けが必要 — req.md 7章)。

### 6. MMDモーション(VMD)
ミクは静止ポーズ+スウェイのみ。ダンスモーションの適用は未着手(モーション入手元は別途相談済み)。

### 7. three.js/PixiJSでのステージ本実装
現在のステージ演出はCSS/SVGのプレースホルダー。3D/2Dエンジンへの置き換えは未着手。

### 8. セッション管理
ルームコード・QRは全てダミー値。セッションの発行・参加者管理・Redis等のストアは未実装(バックエンド側の範囲)。

### 9. リアクション(スタンプ・風船)の実連携
controller のボタン押下→viewer への反映が未接続。現状 viewer 側は独立したデモタイマーで自動生成しているのみ。

### 10. 参加者数・ゲージ類の実データ化
参加人数・準備完了度・熱量シンクロ度は全て固定のモック値。WebSocket連携後、`state_update` 等から算出する必要がある。
