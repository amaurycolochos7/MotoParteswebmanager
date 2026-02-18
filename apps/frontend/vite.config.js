import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Hybrid mode: Frontend local → Backend en VPS (Dokploy)
// Usamos IP:puerto directo porque el dominio tiene stripPath que causa 404
const VPS_API = process.env.VPS_API || 'http://187.77.11.79:3010'
const VPS_BOT = process.env.VPS_BOT || 'http://187.77.11.79:3002'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: [
      '.loca.lt',
      'localhost'
    ],
    proxy: {
      '/api/whatsapp-bot': {
        target: VPS_BOT,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/whatsapp-bot/, '/api'),
      },
      '/api': {
        target: VPS_API,
        changeOrigin: true,
      }
    }
  }
})


