import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Hybrid mode: Frontend local → Backend en producción (via dominio)
// Los puertos directos del VPS están bloqueados por firewall,
// usamos el dominio que pasa por Traefik/Dokploy
const PROD_API = 'https://motopartes.cloud'

// Id de esta compilación: la app compara contra /version.json para recargarse sola cuando sale una versión nueva.
const BUILD_ID = Date.now().toString(36)
const versionFile = () => ({
  name: 'version-file',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) }) },
})

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), versionFile()],
  server: {
    host: true,
    port: 5174,
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
