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

毎回クリックで遷移しなくても、パスで直接その画面を開けます。

- viewer: `/`(URL入力) / `/lobby` / `/live` / `/motion-test`
- controller: `/`(参加コード入力) / `/room/<4桁のコード>`(キャリブレーション。QR参加もここに着地) / `/room/<4桁のコード>/controller`

```
npm run preview -- viewer url-input
npm run preview -- viewer lobby
npm run preview -- viewer live
npm run preview -- viewer motion-test
npm run preview -- controller calibration
npm run preview -- controller controller
```

(devサーバーが起動済みであることが前提です。手動でURLを開く場合は `http://localhost:5173/live` のように直接指定しても同じです。)

注: controller の calibration / controller は参加接続が失敗すると自動で `/` に戻るため、実際に作成した部屋のコードで開く必要があります。

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
