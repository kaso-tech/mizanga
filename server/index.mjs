// Serveur de production : sert le site compilé (dist/) et l’API /api/*.
// Usage : `pnpm build && pnpm start` (variables : PORT, GEMINI_API_KEY, GEMINI_MODEL).
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiHandler } from './chat-handler.mjs'

const distDir = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const port = Number(process.env.PORT ?? 3000)

/** @type {Record<string, string>} */
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

/**
 * Renvoie le fichier demandé dans dist/, ou index.html pour les routes de l’application (SPA).
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function serveStatic(req, res) {
  const pathname = decodeURIComponent((req.url ?? '/').split('?')[0])
  const candidate = normalize(join(distDir, pathname))
  const isInside = candidate === distDir || candidate.startsWith(distDir + sep)
  let filePath = join(distDir, 'index.html')
  if (isInside) {
    const info = await stat(candidate).catch(() => null)
    if (info?.isFile()) filePath = candidate
  }
  const isHashedAsset = filePath.startsWith(join(distDir, 'assets') + sep)
  res.writeHead(200, {
    ...securityHeaders,
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    // Les fichiers de dist/assets portent une empreinte dans leur nom : ils peuvent être gardés en cache.
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(filePath).pipe(res)
}

const api = createApiHandler({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || undefined,
  apiBase: process.env.GEMINI_API_BASE || undefined,
})

createServer((req, res) => {
  if ((req.url ?? '').startsWith('/api/')) return void api(req, res)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }
  serveStatic(req, res).catch((error) => {
    console.error('[mizanga] Erreur de service des fichiers :', error)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
}).listen(port, () => {
  console.log(`[mizanga] http://localhost:${port} — moteur : ${process.env.GEMINI_API_KEY ? `Gemini (${process.env.GEMINI_MODEL || 'gemini-flash-latest'})` : 'démonstration (GEMINI_API_KEY absente)'}`)
})
