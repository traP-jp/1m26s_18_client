# 1m26s_18_client

マジカルミライ プログラミング・コンテスト向けリリックアプリのフロントエンド。詳細な要件は [req.md](./req.md) を参照。

## 構成

```
apps/
  viewer/       PC視聴画面(URL入力 → 待機ロビー → ライブ視聴)
  controller/   スマホ操作画面(待機キャリブレーション → コントローラー)
packages/
  ui/           デザイントークン(CSS変数)・共通コンポーネント
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

毎回クリックで遷移しなくても、URLの `?screen=` クエリで直接その画面を開けます。

```
npm run preview -- viewer url-input
npm run preview -- viewer lobby
npm run preview -- viewer live
npm run preview -- viewer motion-test
npm run preview -- controller calibration
npm run preview -- controller controller
```

(devサーバーが起動済みであることが前提です。手動でURLを開く場合は `http://localhost:5173/?screen=live` のように直接指定しても同じです。)

### モーション単体テスト(`motion-test`)

曲データを使わず、MMDモーション1本とBPMの組み合わせだけを試せる開発用画面です。

```
npm run preview -- viewer motion-test
```

または `http://localhost:5173/?screen=motion-test` を直接開く。プルダウンから
[`apps/viewer/src/motions.ts`](./apps/viewer/src/motions.ts) に登録済みのモーションを選び、
「このモーションの想定BPM(referenceBpm)」と「テストする曲のBPM」を調整しながら実際の
再生速度を確認できます。モーションの追加方法・本番のverse/chorusローテーションの仕組みは
[motions.md](../motions.md) を参照。

## スマホ実機での動作確認(モーションセンサー)

`DeviceMotionEvent` は iOS では HTTPS でないと無効(許可ダイアログも出ない)ため、実機では自己署名 HTTPS で起動します。

```
VITE_HTTPS=1 npm run dev:controller
```

起動ログに出る `https://<PCのLAN IP>:5174` をスマホで開き、初回は証明書の警告を「詳細 → このまま続ける」で許可してください。
キャリブレーション画面の「モーションセンサー → 許可する」でブラウザの許可ダイアログが出ます(iOS で一度「許可しない」を選ぶと、Safari を終了して開き直すか 設定 > Safari > 「モーションと画面の向きのアクセス」を切り替えるまで再プロンプトされません)。
