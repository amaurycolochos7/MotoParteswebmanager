import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Hybrid mode: Frontend local → Backend en producción (via dominio)
// Los puertos directos del VPS están bloqueados por firewall,
// usamos el dominio que pasa por Traefik/Dokploy
const PROD_API = 'https://motopartes.cloud'

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
        target: PROD_API,
        changeOrigin: true,
        secure: true,
      },
      '/api': {
        target: PROD_API,
        changeOrigin: true,
        secure: true,
      }
    }
  }
})
