import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
//
// WebTransport API はセキュアコンテキスト(HTTPS)でのみ利用可能。
// ローカルサーバーに host として接続して試す場合は以下で起動する:
//   VITE_HTTPS=1 npm run dev:viewer
// (初回はブラウザ側で証明書の警告を許可する)
const useHttps = process.env.VITE_HTTPS === '1'

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
})
