# 1m26s_18_client

マジカルミライ プログラミング・コンテスト向けリリックアプリのフロントエンド。詳細な要件は [req.md](./req.md) を参照。

## 構成

```
apps/
  viewer/       PC視聴画面(URL入力 → 待機ロビー → ライブ視聴)
  controller/   スマホ操作画面(待機キャリブレーション → コントローラー)
packages/
  ui/           デザイントークン(CSS変数)・共通コンポーネント
  protocol/     サーバーとのワイヤ形式・WebTransport 接続
  stamps/       traQ から取得したスタンプ画像と id 対応表(生成物)
```

現段階は 静的実装(WebSocket・バックエンド接続なし、ダミーデータのみ)。

## セットアップ

```
npm install
npm run dev            # viewer(5173) と controller(5174) を同時起動
npm run dev:viewer     # viewer のみ
npm run dev:controller # controller のみ
```

- viewer: http://localhost:5173
- controller: http://localhost:5174

## 画面ごとのプレビュー

毎回クリックで遷移しなくても、パスで直接その画面を開けます。

- viewer: `/`(トップ) / `/select`(曲選択) / `/room/<コード>/lobby`(待機ロビー) / `/room/<コード>/live`(ライブ視聴) / `/motion-test`
- controller: `/`(参加コード入力) / `/room/<4桁のコード>`(キャリブレーション。QR参加もここに着地) / `/room/<4桁のコード>/controller`

```
npm run preview -- viewer url-input
npm run preview -- viewer lobby
npm run preview -- viewer live
npm run preview -- viewer motion-test
npm run preview -- controller calibration
npm run preview -- controller controller
```

(devサーバーが起動済みであることが前提です。手動でURLを開く場合は `http://localhost:5173/motion-test` のように直接指定しても同じです。)

注: viewer の lobby / live は部屋作成後に発行される `/room/<コード>/...` で開く必要があります(直接開くと曲選択に戻ります)。controller の calibration / controller は実際に作成した部屋のコードで開く必要があります。

### モーション単体テスト(`motion-test`)

曲データを使わず、MMDモーション1本とBPMの組み合わせだけを試せる開発用画面です。

```
npm run preview -- viewer motion-test
```

または `http://localhost:5173/motion-test` を直接開く。プルダウンから
[`apps/viewer/src/motions.ts`](./apps/viewer/src/motions.ts) に登録済みのモーションを選び、
「このモーションの想定BPM(referenceBpm)」と「テストする曲のBPM」を調整しながら実際の
再生速度を確認できます。モーションの追加方法・本番のverse/chorusローテーションの仕組みは
[motions.md](../motions.md) を参照。

## スタンプ画像の取得(traQ)

コントローラーから送れるスタンプの画像は traQ の API(`GET /api/v3/stamps/{stampId}/image`)から取得して
`packages/stamps/assets/` に配置します。取得にはログインが必要なので、リポジトリ直下に `.env` を作って
認証情報を設定してください(`.env.example` 参照。`TRAQ_TOKEN` か `TRAQ_USERNAME` / `TRAQ_PASSWORD` のどちらか)。

```
cp .env.example .env                 # 認証情報を記入
npm run stamps -- search miku        # traQ 上のスタンプを名前で探す
npm run stamps -- add mikuehehe      # 名前(または UUID)で追加して画像を取得
npm run stamps -- remove mikuehehe   # 設定から外す
npm run stamps -- list               # 設定済みのスタンプと stamp id
npm run stamps:fetch                 # 設定どおりに取得し直す
```

設定は [`packages/stamps/stamps.config.json`](./packages/stamps/stamps.config.json) の `stamps` に
traQ のスタンプ名(または UUID)で列挙されており、`add` / `remove` はこのファイルを書き換えます。
配列の順番がそのままワイヤ上の stamp id(u8、0 始まり、最大 256 個)になり、
`packages/stamps/src/manifest.ts` が生成されます。`remove` や並び替えで後続の id が詰まるため、
controller と viewer は必ず同じ manifest でビルドしてください。取得した画像と manifest はコミットして
構いません(未取得だとコントローラーにスタンプが表示されません)。

## 部屋参加QRコード

ロビー画面には controller の参加 URL(`<controller のベースURL>/room/<ルームコード>`)をエンコードした QR コードを表示します。
QR の URL は `VITE_CONTROLLER_BASE_URL`(`apps/viewer/.env.example` 参照)で上書きできます。未設定時は viewer と同じホストのポート 5174 を自動導出します。
スマホ実機でスキャンする場合は、PC の LAN IP を指定した HTTPS URL(例: `https://192.168.1.5:5174`)を設定してください(末尾スラッシュ付きでも正規化されます)。
実機の controller から API サーバに届かないと部屋画面でエラー表示になります。`VITE_API_BASE` / `VITE_WEBTRANSPORT_HOST` が `localhost` の場合は開いているページのホスト名に自動置換されますが、API サーバ自体が LAN から到達可能(バインド・FW・CORS)である必要があります。controller を `https` で開く場合、API 側も到達可能な `https`(または同一スキーム)にしてください(`http` のままだと mixed-content で遮断されます)。

## スマホ実機での動作確認(モーションセンサー)

`DeviceMotionEvent` は iOS では HTTPS でないと無効(許可ダイアログも出ない)ため、実機では自己署名 HTTPS で起動します。

```
VITE_HTTPS=1 npm run dev:controller
```

起動ログに出る `https://<PCのLAN IP>:5174` をスマホで開き、初回は証明書の警告を「詳細 → このまま続ける」で許可してください。
キャリブレーション画面の「モーションセンサー → 許可する」でブラウザの許可ダイアログが出ます(iOS で一度「許可しない」を選ぶと、Safari を終了して開き直すか 設定 > Safari > 「モーションと画面の向きのアクセス」を切り替えるまで再プロンプトされません)。

## 画面の自動ロック抑止(Wake Lock)

controller はキャリブレーション画面の「許可ステータス > 画面ロック抑止 > 許可する」をタップすると、以降ずっと画面の自動ロックを抑止します(`apps/controller/src/wakeLock/`)。
ブラウザの許可ダイアログは無く、アプリ内の同意ですが、iOS では動画の再生をタップの中でしか始められないので、このタップが開始トリガーを兼ねています。

許可後は 2 段構えです。

1. [Screen Wake Lock API](https://developer.mozilla.org/ja/docs/Web/API/Screen_Wake_Lock_API): Android Chrome と iOS 16.4 以降の Safari で有効。HTTPS が必要(モーションセンサーと同じ条件)。
   iOS はホーム画面に追加した Web アプリだと iOS 18.4 まで効かない、LINE などのアプリ内ブラウザでは API が無い、低電力モードでは拒否される、といった穴があります。
2. 無音動画のインライン再生(NoSleep.js 方式): iOS では 1 の結果に関わらず常に併用し、その他の環境では 1 が使えない時だけ使います。
   音声トラック付きの動画なので、端末で再生中だった音楽は止まり、再生中はロック画面のメディア操作に「画面ロック抑止」として出ます。

状態は同じ行に出ます。iOS で「許可済み(動画)」になっていればロックされません。
タブを切り替えた・裏に回した・フォーカスが外れた時は、Wake Lock API は OS が解放し、動画はこちらで要素ごと破棄してメディア操作からも消します。
表に戻した後、次のタップで自動的に取り直します(ステータスは「タップで再開」になります)。
