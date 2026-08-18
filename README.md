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
npm run preview -- controller calibration
npm run preview -- controller controller
```

(devサーバーが起動済みであることが前提です。手動でURLを開く場合は `http://localhost:5173/?screen=live` のように直接指定しても同じです。) 