import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { computeBuildInfo } from './server/build-info.mjs'
import { createApiHandler } from './server/chat-handler.mjs'

// Version de cette compilation : affichée dans « À propos » et écrite dans dist/version.json pour le serveur.
const buildInfo = computeBuildInfo(fileURLToPath(new URL('.', import.meta.url)))

/**
 * Monte l’API (/api/health, /api/chat) dans les serveurs Vite de développement et de prévisualisation.
 * La clé est lue côté serveur (variables d’environnement ou .env.local) et n’est jamais exposée au navigateur.
 */
function gilliApi(): Plugin {
  const handlerFor = (mode: string, root: string) => {
    const env = { ...loadEnv(mode, root, ''), ...process.env }
    return createApiHandler({ aiProvider: env.AI_PROVIDER || undefined, apiKey: env.GEMINI_API_KEY || undefined, model: env.GEMINI_MODEL || undefined, liteModel: env.GEMINI_LITE_MODEL || undefined, adminPassword: env.ADMIN_PASSWORD || undefined, apiBase: env.GEMINI_API_BASE || undefined, version: buildInfo })
  }
  return {
    name: 'gilli-api',
    configureServer(server) {
      const handler = handlerFor(server.config.mode, server.config.root)
      server.middlewares.use((req, res, next) => void handler(req, res, next))
    },
    configurePreviewServer(server) {
      const handler = handlerFor(server.config.mode, server.config.root)
      server.middlewares.use((req, res, next) => void handler(req, res, next))
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify(buildInfo)}\n` })
    },
  }
}

export default defineConfig({
  plugins: [react(), gilliApi()],
  define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
})
