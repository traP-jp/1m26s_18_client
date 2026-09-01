import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
//
// スマホ実機で DeviceMotionEvent を試す場合は HTTPS が必要(iOS は http だとセンサーが無効)。
//   VITE_HTTPS=1 npm run dev:controller
// で自己署名証明書付きの https://<PCのLAN IP>:5174 が立ち上がる(初回は端末側で証明書の警告を許可する)。
const useHttps = process.env.VITE_HTTPS === '1'

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    port: 5174,
    host: true,
  },
})
