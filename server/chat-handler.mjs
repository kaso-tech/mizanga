import { streamGeminiReply, UpstreamError } from './gemini.mjs'

// Garde-fous : le point d’accès est public, la clé d’API (et son quota) ne doit pas être épuisable à volonté.
const MAX_BODY_BYTES = 512 * 1024
const MAX_MESSAGES = 60
const MAX_MESSAGE_CHARS = 32_000
const RATE_LIMIT = { windowMs: 60_000, maxRequests: 20 }
const RESPONSE_LANGUAGES = new Set(['auto', 'moore-standard', 'moore-informal', 'french', 'english'])
const WRITING_MODES = new Set(['standard', 'informal'])

/** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} body */
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

/** @param {import('node:http').IncomingMessage} req */
async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Requête trop volumineuse.'), { status: 413 })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('Requête invalide.'), { status: 400 })
  }
}

/**
 * Vérifie la forme de la demande ; le texte est transmis tel quel, sans normalisation.
 * @param {any} body
 */
export function validateChatRequest(body) {
  const messages = body?.messages
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null
  for (const message of messages) {
    if ((message?.role !== 'user' && message?.role !== 'assistant') || typeof message.content !== 'string' || message.content.length > MAX_MESSAGE_CHARS) return null
  }
  if (messages.at(-1).role !== 'user') return null
  const preferences = body.preferences ?? {}
  return {
    messages: messages.map(({ role, content }) => ({ role, content })),
    preferences: {
      responseLanguage: RESPONSE_LANGUAGES.has(preferences.responseLanguage) ? preferences.responseLanguage : 'auto',
      userWritingMode: WRITING_MODES.has(preferences.userWritingMode) ? preferences.userWritingMode : 'standard',
    },
  }
}

function createRateLimiter({ windowMs, maxRequests } = RATE_LIMIT, now = () => Date.now()) {
  /** @type {Map<string, number[]>} */
  const hits = new Map()
  return (/** @type {string} */ key) => {
    const current = now()
    const recent = (hits.get(key) ?? []).filter((time) => current - time < windowMs)
    if (recent.length >= maxRequests) {
      hits.set(key, recent)
      return false
    }
    recent.push(current)
    hits.set(key, recent)
    if (hits.size > 10_000) hits.clear()
    return true
  }
}

/**
 * Gestionnaire Node pour `/api/health` et `/api/chat`, partagé par le serveur de développement Vite
 * et le serveur de production. Réponse de `/api/chat` : NDJSON, une ligne `{"text": …}` par fragment,
 * ou `{"error": …}` si le moteur échoue en cours de route.
 * @param {{ apiKey?: string, model?: string, apiBase?: string, rateLimit?: { windowMs: number, maxRequests: number } }} config
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next?: () => void) => Promise<void>}
 */
export function createApiHandler({ apiKey, model = 'gemini-flash-latest', apiBase, rateLimit } = {}) {
  const allow = createRateLimiter(rateLimit)

  return async (req, res, next) => {
    const path = (req.url ?? '').split('?')[0]

    if (path === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { engine: apiKey ? 'gemini' : 'demo', model: apiKey ? model : null })
    }
    if (path !== '/api/chat') {
      if (next) return next()
      return sendJson(res, 404, { error: 'Introuvable.' })
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
    if (!apiKey) return sendJson(res, 503, { error: 'Aucun moteur d’IA n’est configuré sur ce serveur.' })

    const client = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || 'inconnu'
    if (!allow(client)) return sendJson(res, 429, { error: 'Trop de demandes en peu de temps. Patientez une minute.' })

    let request
    try {
      request = validateChatRequest(await readJson(req))
    } catch (error) {
      const { status = 400, message = 'Requête invalide.' } = /** @type {{ status?: number, message?: string }} */ (error)
      return sendJson(res, status, { error: message })
    }
    if (!request) return sendJson(res, 400, { error: 'Requête invalide.' })

    // Si le navigateur annule (bouton « Arrêter »), l’appel au moteur est interrompu lui aussi.
    const controller = new AbortController()
    res.on('close', () => controller.abort())

    let started = false
    try {
      for await (const text of streamGeminiReply({ apiKey, model, apiBase, ...request, signal: controller.signal })) {
        if (!started) {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
          started = true
        }
        res.write(`${JSON.stringify({ text })}\n`)
      }
      if (!started) res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end()
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof UpstreamError ? error.message : 'Le moteur est momentanément indisponible. Réessayez plus tard.'
      if (!(error instanceof UpstreamError)) console.error('[mizanga] Erreur du moteur :', error)
      if (started) {
        res.end(`${JSON.stringify({ error: message })}\n`)
      } else {
        sendJson(res, error instanceof UpstreamError ? error.status : 502, { error: message })
      }
    }
  }
}
