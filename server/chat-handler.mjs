import { generateGeminiTitle, streamGeminiReply, UpstreamError } from './gemini.mjs'

// Garde-fous : le point d’accès est public, la clé d’API (et son quota) ne doit pas être épuisable à volonté.
// Fichiers joints compris (8 Mo au plus, encodés en base64, soit environ 11 Mo de texte).
const MAX_BODY_BYTES = 12 * 1024 * 1024
const MAX_ATTACHMENTS_PER_MESSAGE = 4
const MAX_ATTACHMENT_BASE64_CHARS = Math.ceil((8 * 1024 * 1024 * 4) / 3)
const ATTACHMENT_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
  'audio/wav', 'audio/mp3', 'audio/aac', 'audio/ogg', 'audio/flac',
])
const MAX_MESSAGES = 60
const MAX_MESSAGE_CHARS = 32_000
const RATE_LIMIT = { windowMs: 60_000, maxRequests: 20 }
const RESPONSE_LANGUAGES = new Set(['auto', 'moore-standard', 'moore-informal', 'french', 'english'])
const WRITING_MODES = new Set(['standard', 'informal'])
export const MAX_CUSTOM_INSTRUCTIONS_CHARS = 1500

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
  let attachmentChars = 0
  for (const message of messages) {
    if ((message?.role !== 'user' && message?.role !== 'assistant') || typeof message.content !== 'string' || message.content.length > MAX_MESSAGE_CHARS) return null
    if (message.attachments === undefined) continue
    if (message.role !== 'user' || !Array.isArray(message.attachments) || message.attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) return null
    for (const attachment of message.attachments) {
      if (typeof attachment?.name !== 'string' || !ATTACHMENT_TYPES.has(attachment.mimeType) || typeof attachment.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(attachment.data)) return null
      attachmentChars += attachment.data.length
    }
  }
  if (attachmentChars > MAX_ATTACHMENT_BASE64_CHARS) return null
  const last = messages.at(-1)
  if (last.role !== 'user' || (!last.content.trim() && !last.attachments?.length)) return null
  const preferences = body.preferences ?? {}
  return {
    webSearch: body.webSearch === true,
    messages: messages.map(({ role, content, attachments }) => ({
      role,
      content,
      ...(attachments?.length ? { attachments: attachments.map((/** @type {any} */ { name, mimeType, data }) => ({ name, mimeType, data })) } : {}),
    })),
    preferences: {
      responseLanguage: RESPONSE_LANGUAGES.has(preferences.responseLanguage) ? preferences.responseLanguage : 'auto',
      userWritingMode: WRITING_MODES.has(preferences.userWritingMode) ? preferences.userWritingMode : 'standard',
      customInstructions: typeof preferences.customInstructions === 'string' ? preferences.customInstructions.trim().slice(0, MAX_CUSTOM_INSTRUCTIONS_CHARS) : '',
    },
  }
}

/**
 * Limiteur par visiteur. Renvoie `null` si la demande est acceptée, sinon le moment où elle le sera.
 * @returns {(key: string) => Date | null}
 */
function createRateLimiter({ windowMs, maxRequests } = RATE_LIMIT, now = () => Date.now()) {
  /** @type {Map<string, number[]>} */
  const hits = new Map()
  return (key) => {
    const current = now()
    const recent = (hits.get(key) ?? []).filter((time) => current - time < windowMs)
    if (recent.length >= maxRequests) {
      hits.set(key, recent)
      return new Date(recent[0] + windowMs)
    }
    recent.push(current)
    hits.set(key, recent)
    if (hits.size > 10_000) hits.clear()
    return null
  }
}

/** Corps d’erreur JSON, avec l’heure de réinitialisation quand elle est connue. */
const errorBody = (/** @type {string} */ message, /** @type {Date | undefined} */ retryAt) => (retryAt ? { error: message, retryAt: retryAt.toISOString() } : { error: message })

/**
 * Gestionnaire Node pour `/api/health` et `/api/chat`, partagé par le serveur de développement Vite
 * et le serveur de production. Réponse de `/api/chat` : NDJSON, une ligne `{"text": …}` par fragment,
 * ou `{"error": …}` si le moteur échoue en cours de route.
 * @param {{ apiKey?: string, model?: string, apiBase?: string, rateLimit?: { windowMs: number, maxRequests: number } }} config
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next?: () => void) => Promise<void>}
 */
export function createApiHandler({ apiKey, model = 'gemini-flash-latest', apiBase, rateLimit } = {}) {
  const limit = createRateLimiter(rateLimit)

  return async (req, res, next) => {
    const path = (req.url ?? '').split('?')[0]

    if (path === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { engine: apiKey ? 'gemini' : 'demo', model: apiKey ? model : null })
    }
    if (path !== '/api/chat' && path !== '/api/title') {
      if (next) return next()
      return sendJson(res, 404, { error: 'Introuvable.' })
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
    if (!apiKey) return sendJson(res, 503, { error: 'Aucun moteur d’IA n’est configuré sur ce serveur.' })

    const client = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || 'inconnu'
    const blockedUntil = limit(client)
    if (blockedUntil) return sendJson(res, 429, errorBody('Trop de demandes en peu de temps.', blockedUntil))

    if (path === '/api/title') {
      try {
        const body = await readJson(req)
        if (typeof body?.text !== 'string' || !body.text.trim() || body.text.length > MAX_MESSAGE_CHARS) return sendJson(res, 400, { error: 'Requête invalide.' })
        const title = await generateGeminiTitle({ apiKey, model, apiBase, text: body.text })
        return sendJson(res, 200, { title })
      } catch (error) {
        const { status = 502, message = 'Titre indisponible.', retryAt } = /** @type {{ status?: number, message?: string, retryAt?: Date }} */ (error)
        return sendJson(res, status, errorBody(message, retryAt))
      }
    }

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
      for await (const event of streamGeminiReply({ apiKey, model, apiBase, ...request, signal: controller.signal })) {
        if (!started) {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
          started = true
        }
        res.write(`${JSON.stringify(event)}\n`)
      }
      if (!started) res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end()
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof UpstreamError ? error.message : 'Le moteur est momentanément indisponible. Réessayez plus tard.'
      if (!(error instanceof UpstreamError)) console.error('[mizanga] Erreur du moteur :', error)
      const retryAt = error instanceof UpstreamError ? error.retryAt : undefined
      if (started) {
        res.end(`${JSON.stringify(errorBody(message, retryAt))}\n`)
      } else {
        sendJson(res, error instanceof UpstreamError ? error.status : 502, errorBody(message, retryAt))
      }
    }
  }
}
