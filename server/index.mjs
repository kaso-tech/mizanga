// Serveur de production : sert le site compilé (dist/) et l’API /api/*.
// Usage : `pnpm build && pnpm start` (variables : PORT, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, AI_PROVIDER, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_LITE_MODEL, ADMIN_PASSWORD).
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib'
import { MIN_ADMIN_PASSWORD_LENGTH } from './admin.mjs'
import { readAuthConfig } from './auth/supabase-auth.mjs'
import { readBuildInfo } from './build-info.mjs'
import { readPricing } from './ai/pricing.mjs'
import { createApiHandler } from './chat-handler.mjs'

const distDir = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const port = Number(process.env.PORT ?? 3000)

/** @type {Record<string, string>} */
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
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

const compressBrotli = promisify(brotliCompress)
const compressGzip = promisify(gzip)
const compressibleTypes = /^(text\/|application\/(json|manifest\+json)|image\/svg\+xml)/

/** Versions compressées des fichiers du site, calculées une fois (ils ne changent pas pendant l’exécution). */
/** @type {Map<string, Promise<Buffer>>} */
const compressedCache = new Map()

/** @param {string} filePath @param {'br' | 'gzip'} encoding */
function compressedFile(filePath, encoding) {
  const key = `${encoding}:${filePath}`
  let cached = compressedCache.get(key)
  if (!cached) {
    cached = readFile(filePath).then((content) => (encoding === 'br'
      ? compressBrotli(content, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } })
      : compressGzip(content, { level: 9 })))
    compressedCache.set(key, cached)
  }
  return cached
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
  const contentType = contentTypes[extname(filePath)] ?? 'application/octet-stream'
  // Texte compressé (Brotli, sinon gzip) : environ 4 fois moins de données sur réseau mobile.
  const accepted = String(req.headers['accept-encoding'] ?? '')
  const encoding = !compressibleTypes.test(contentType) ? null : /\bbr\b/.test(accepted) ? 'br' : /\bgzip\b/.test(accepted) ? 'gzip' : null
  const headers = {
    ...securityHeaders,
    'Content-Type': contentType,
    // Les fichiers de dist/assets portent une empreinte dans leur nom : ils peuvent être gardés en cache.
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
    // La console d’administration ne doit pas apparaître dans les moteurs de recherche.
    ...(/^\/admin(\/|$)/.test(pathname) ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
  }
  if (encoding) {
    const body = await compressedFile(filePath, encoding)
    res.writeHead(200, { ...headers, 'Content-Encoding': encoding, 'Content-Length': body.length })
    res.end(req.method === 'HEAD' ? undefined : body)
    return
  }
  res.writeHead(200, headers)
  if (req.method === 'HEAD') return res.end()
  createReadStream(filePath).pipe(res)
}

const api = createApiHandler({
  aiProvider: process.env.AI_PROVIDER || undefined,
  apiKey: process.env.GEMINI_API_KEY,
  aiPricing: readPricing(process.env.AI_PRICE_USD_PER_MILLION),
  moderationKey: process.env.MODERATION_KEY || undefined,
  model: process.env.GEMINI_MODEL || undefined,
  liteModel: process.env.GEMINI_LITE_MODEL || undefined,
  adminPassword: process.env.ADMIN_PASSWORD || undefined,
  apiBase: process.env.GEMINI_API_BASE || undefined,
  version: readBuildInfo(distDir) ?? undefined,
  // Configuration invalide (clé secrète, adresse incorrecte) : le serveur refuse de démarrer.
  auth: readAuthConfig(process.env),
})

createServer((req, res) => {
  if ((req.url ?? '').startsWith('/api/')) return void api(req, res)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }
  serveStatic(req, res).catch((error) => {
    console.error('[gilli] Erreur de service des fichiers :', error)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
}).listen(port, () => {
  console.log(`[gilli] http://localhost:${port} — moteur : ${process.env.GEMINI_API_KEY ? `Gemini (${process.env.GEMINI_MODEL || 'gemini-flash-latest'})` : 'démonstration (GEMINI_API_KEY absente)'}`)
  const adminPassword = process.env.ADMIN_PASSWORD ?? ''
  if (!adminPassword) console.log('[gilli] Console d’administration fermée (ADMIN_PASSWORD absent).')
  else if (adminPassword.length < MIN_ADMIN_PASSWORD_LENGTH) console.warn(`[gilli] ADMIN_PASSWORD trop court (${MIN_ADMIN_PASSWORD_LENGTH} caractères au moins) : console fermée.`)
})
