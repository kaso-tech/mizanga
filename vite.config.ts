import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { createApiHandler } from './server/chat-handler.mjs'

/**
 * Monte l’API (/api/health, /api/chat) dans les serveurs Vite de développement et de prévisualisation.
 * La clé est lue côté serveur (variables d’environnement ou .env.local) et n’est jamais exposée au navigateur.
 */
function mizangaApi(): Plugin {
  const handlerFor = (mode: string, root: string) => {
    const env = { ...loadEnv(mode, root, ''), ...process.env }
    return createApiHandler({ apiKey: env.GEMINI_API_KEY || undefined, model: env.GEMINI_MODEL || undefined, liteModel: env.GEMINI_LITE_MODEL || undefined, adminPassword: env.ADMIN_PASSWORD || undefined, apiBase: env.GEMINI_API_BASE || undefined })
  }
  return {
    name: 'mizanga-api',
    configureServer(server) {
      const handler = handlerFor(server.config.mode, server.config.root)
      server.middlewares.use((req, res, next) => void handler(req, res, next))
    },
    configurePreviewServer(server) {
      const handler = handlerFor(server.config.mode, server.config.root)
      server.middlewares.use((req, res, next) => void handler(req, res, next))
    },
  }
}

export default defineConfig({
  plugins: [react(), mizangaApi()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
})
