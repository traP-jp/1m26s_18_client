# 残イシュー（フロント）

以下優先度順

### 1. ライブ画面で曲の音声を鳴らす
`apps/viewer/src/api/songs.ts` の `fetchSongData()` はバックエンド経由でTextAliveの**メタデータ(JSON)のみ**取得しており、音声そのものは持っていない。実際に音を鳴らすには `textalive-app-api` をフロントエンドに直接組み込み、`Player.createFromSongUrl()` をブラウザ内で実行する必要がある。方針は合意済み(検証用トークンでまず実装 → 後でenv変数化して本番トークンに差し替え)だが未着手。
- 関連: `apps/viewer/src/components/MikuModel3D.tsx`(現状は推定BPMによる速度スケールのみで、実再生とは同期していない)
- 関連: `apps/viewer/src/screens/LiveScreen.tsx`

### 2. WebSocketによるリアルタイム同期が未実装
viewer(PC)とcontroller(スマホ)は完全に独立して動作しており、controllerでの操作(ペンライト色・振る動作・スタンプなど)がviewerに一切反映されない。`req.md` 6章で定義された通信仕様(`join_session` / `state_update` / `sync_playback` 等)はまだ影も形もない。バックエンド側のWebSocketサーバー実装状況に依存。

### 3. 歌詞表示が実データに未接続
バックエンドは `phrases[]`(歌詞テキスト+タイミング)を既に返しているが、フロントで一切使っていない。`apps/viewer/src/screens/LiveScreen.tsx` は今も `mockLyricLine` という固定文字列を `BackScreen` に渡しているだけ。取得済みの `song.phrases` と実再生時刻(#1が前提)を突き合わせて表示に切り替える必要がある。

---

## 中優先度

### 4. 実センサー(DeviceMotionEvent)未実装
controllerの「振る」動作は `onPointerDown`(タップ/押下)で代替中。iOS 13+ で必要な `DeviceMotionEvent.requestPermission()` の許可ダイアログフローも含めて未着手。
- 関連: `apps/controller/src/components/ShakeTestArea.tsx`(現状は擬似加速度スパイクのランダム生成)

### 5. Vibration API未実装
シンクロ成功時の振動フィードバック(`req.md` 4.1)が未実装。

### 6. ビート/曲区間に応じた演出の自動切り替えが未実装
`PenlightGrid` の振り付けモード(`idle`/`fourFloor`/`buildup`)は手動デモボタンでの切り替えのみ。実際の曲のビート・サビ区間に応じて自動で切り替わるようにする必要がある(#1のPlayer実装後、`onTimeUpdate`等から駆動するのが自然)。
- 関連: `apps/viewer/src/screens/LiveScreen.tsx` の `WAVE_MODE_LABELS` 手動ボタン部分

### 7. three.js/PixiJSでのステージ本実装
`StagePlaceholder` は照明トラス・スポットライト等をCSS/SVGで再現したプレースホルダー。3Dエンジンでの本実装は未着手(MMDモデル自体は three.js 導入済みなので、ステージ全体を同じシーンに統合するのが選択肢の一つ)。

### 8. セッション管理・ルームコードの実発行
Lobby画面のルームコード・参加URLは `mockRoomCode` / `mockJoinUrl` の固定ダミー値。セッション発行・参加者管理はバックエンド側の範囲だが、フロント側もWebSocket接続確立後の実データ切り替えが必要。
- 関連: `apps/viewer/src/mockData.ts`

### 9. リアクション(スタンプ・風船)のcontroller→viewer連携
controllerのスタンプ/風船ボタンはローカルのフィードバック表示のみ。viewer側の `ReactionOverlay` は独立したデモタイマーでランダム生成しているだけで、両者は繋がっていない(#2のWebSocket実装が前提)。

### 10. 参加者数・ゲージ類の実データ化
視聴人数・準備完了度・熱量シンクロ度は全て固定のモック値。WebSocketの`state_update`等から算出する必要がある(#2が前提)。

---

## 個別バグ・技術的負債

### 11. VMDダンス再生中に黄色い線のレンダリングアーティファクトが出る
原因未調査。読み込んでいる `Helltaker-like_dance/` フォルダに同梱されている `Balloon/`(吹き出し風の小物、`Balloon.pmx`+`Balloon_shake.vmd`)を実際にはロードしていないが、そのボーン参照が何らかの形で干渉している可能性が高いと推測している段階。

### 12. `REFERENCE_BPM = 120` は実測値ではなく仮値
`apps/viewer/src/components/MikuModel3D.tsx` のダンス再生速度スケーリングは、読み込んでいるVMDモーションの元曲テンポが不明なため `120` という暫定値を基準にしている。体感で調整するか、何らかの方法で実測する必要がある。

### 13. TextAliveトークンが検証用の一時トークンのまま・env変数化未実施
現在動作確認に使っているトークンは本番登録前の一時利用のもの。`developer.textalive.jp` でこのアプリ用に正式登録し、`.env` 経由で差し替え可能な形にする必要がある(#1の実装と合わせて対応予定)。

### 14. `fetchSongData` のレスポンスに実行時バリデーションがない
`apps/viewer/src/api/songs.ts` の `res.json() as Promise<SongData>` は型アサーションのみで、バックエンドのレスポンス形が変わってもコンパイルは通ってしまい、実行時に静かにデータがズレる。zodなどでのスキーマ検証を検討の余地あり。

### 15. プライベート楽曲登録(`POST /songs`)用のUIがフロントに存在しない
バックエンドには非公開楽曲のメタデータ・歌詞を登録する `POST /songs`(`CreateSongRequest`: `songUrl`/`title`/`artist`/`lyrics`/`lyricsJsonUrl`)が実装済みだが、フロントのURL入力画面は`GET`しか呼んでいない。未登録・非公開楽曲(`incomplete`)を実際に使う運用にするなら、この登録フォームが別途必要。

### 16. viewerのビルドバンドルが1MB超でコード分割されていない
`npm run build -w apps/viewer` で `chunks are larger than 500 kB` の警告が出続けている(three.js本体 + MMD用wasmが主因)。動的importでの分割は未対応。

### 17. 自動テストが一切ない
ユニットテスト・E2Eテストとも未整備。動作確認は都度手動 or Playwrightでのその場限りの検証のみに依存している。
