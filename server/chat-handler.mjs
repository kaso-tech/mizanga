import { createHash } from 'node:crypto'
import { createAdminAuth } from './admin.mjs'
import { UpstreamError } from './ai/errors.mjs'
import { createAiProvider } from './ai/provider.mjs'
import { bearerToken, createTokenVerifier } from './auth/supabase-auth.mjs'
import { createAssistant } from './business/assistant.mjs'
import { createBusinessRoutes } from './business/routes.mjs'
import { createConversationRoutes } from './conversations/routes.mjs'
import { createSupabaseBusinessStore } from './business/supabase-store.mjs'
import { createListingModerator } from './marketplace/moderation.mjs'
import { createMarketplaceRoutes } from './marketplace/routes.mjs'
import { createSupabaseMarketplace } from './marketplace/store.mjs'
import { buildReferenceText, createReferenceLoader, MAX_REFERENCE_CHARS } from './moore-reference.mjs'

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
    modelTier: body.modelTier === 'lite' ? /** @type {const} */ ('lite') : /** @type {const} */ ('standard'),
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
/**
 * Corps d’erreur JSON ; `code: 'quota'` signale le quota du moteur épuisé, que le modèle économe
 * (quota distinct) peut contourner.
 * @param {string} message @param {Date | undefined} [retryAt] @param {'quota'} [code]
 */
const errorBody = (message, retryAt, code) => ({ error: message, ...(retryAt ? { retryAt: retryAt.toISOString() } : {}), ...(code ? { code } : {}) })

/** @param {unknown} error */
const quotaCode = (error) => (error instanceof UpstreamError && error.status === 429 ? /** @type {const} */ ('quota') : undefined)

/**
 * Identifiant du visiteur pour les limites (demandes, essais de connexion) : l’adresse de la connexion.
 * Ne pas utiliser X-Forwarded-For ici : un client public peut le forger. Un proxy de confiance
 * devra appliquer sa propre limite ou transmettre une identité vérifiée.
 * @param {import('node:http').IncomingMessage} req
 */
const clientOf = (req) => req.socket.remoteAddress || 'inconnu'

/**
 * Enveloppe un fournisseur pour signaler ses refus (avec leur détail technique) sans changer son comportement.
 * @param {import('./ai/provider.mjs').AiProvider} ai @param {(error: unknown, feature: string) => void} onError
 * @returns {import('./ai/provider.mjs').AiProvider}
 */
function monitorProvider(ai, onError) {
  return {
    ...ai,
    async *streamReply(request) {
      try {
        yield* ai.streamReply(request)
      } catch (error) {
        onError(error, request.instructions ? 'assistant Business' : `chat (${request.tier === 'lite' ? 'modèle économe' : 'modèle standard'})`)
        throw error
      }
    },
    async generateTitle(request) {
      try {
        return await ai.generateTitle(request)
      } catch (error) {
        onError(error, 'titre')
        throw error
      }
    },
    ...(ai.generateJson ? {
      async generateJson(/** @type {Parameters<NonNullable<typeof ai.generateJson>>[0]} */ request) {
        try {
          return await /** @type {NonNullable<typeof ai.generateJson>} */ (ai.generateJson)(request)
        } catch (error) {
          onError(error, 'modération')
          throw error
        }
      },
    } : {}),
  }
}

/**
 * Gestionnaire Node pour `/api/health` et `/api/chat`, partagé par le serveur de développement Vite
 * et le serveur de production. Réponse de `/api/chat` : NDJSON, une ligne `{"text": …}` par fragment,
 * ou `{"error": …}` si le moteur échoue en cours de route.
 * Le modèle est appelé uniquement à travers `provider` (server/ai/provider.mjs). À défaut, un fournisseur
 * est créé à partir de `aiProvider` (défaut « gemini »), `apiKey`, `model`, `liteModel` (modèle économe,
 * proposé au choix et utilisé pour les titres) et `apiBase`.
 * `referenceDir` : dossier de la référence du mooré (par défaut server/knowledge/moore).
 * `adminPassword` : mot de passe de la console d’administration (/admin) ; absent, la console est fermée.
 * `version` : version déployée (server/build-info.mjs), annoncée par /api/health.
 * `auth` : configuration publique de Supabase Auth (server/auth/supabase-auth.mjs) ; absente, pas de comptes.
 * `businessStore` : accès aux données Business (par défaut Supabase, avec le jeton de l’utilisateur).
 * `aiPricing` : prix du moteur pour le coût estimé de l’assistant Business (server/ai/pricing.mjs), 0 par défaut.
 * `marketplace` : données et photos de la marketplace (par défaut Supabase) ; `moderationKey` : clé de
 * modération (MODERATION_KEY), sans laquelle les annonces attendent une décision de l’administration.
 * @param {{ provider?: import('./ai/provider.mjs').AiProvider, aiProvider?: string, apiKey?: string, model?: string, liteModel?: string, apiBase?: string, referenceDir?: string, adminPassword?: string, version?: import('./build-info.mjs').BuildInfo, auth?: import('./auth/supabase-auth.mjs').AuthConfig | null, verifyToken?: (token: string) => Promise<import('./auth/supabase-auth.mjs').AuthUser | null>, businessStore?: import('./business/supabase-store.mjs').BusinessStore, rateLimit?: { windowMs: number, maxRequests: number }, aiPricing?: import('./ai/pricing.mjs').AiPricing, marketplace?: { store: import('./marketplace/store.mjs').MarketplaceStore, photos: import('./marketplace/store.mjs').PhotoStore }, moderationKey?: string }} config
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next?: () => void) => Promise<void>}
 */
export function createApiHandler({ provider, aiProvider, apiKey, model, liteModel, apiBase, referenceDir, adminPassword, version, auth, verifyToken, businessStore, rateLimit, aiPricing, marketplace, moderationKey } = {}) {
  const verify = verifyToken ?? (auth ? createTokenVerifier(auth) : null)
  const store = businessStore ?? (auth ? createSupabaseBusinessStore(auth) : null)
  /** Derniers refus du moteur (quota, clé…), pour la console d’administration ; jamais montrés aux utilisateurs. */
  /** @type {Array<import('./ai/errors.mjs').EngineDiagnostic & { at: string, feature: string }>} */
  const engineErrors = []
  /** @param {unknown} error @param {string} feature */
  const recordEngineError = (error, feature) => {
    if (!(error instanceof UpstreamError) || !error.diagnostic) return
    const entry = { at: new Date().toISOString(), feature, ...error.diagnostic }
    engineErrors.unshift(entry)
    engineErrors.length = Math.min(engineErrors.length, 10)
    console.warn('[gilli] Refus du moteur :', JSON.stringify(entry))
  }
  const ai = monitorProvider(provider ?? createAiProvider({ provider: aiProvider, apiKey, model, liteModel, apiBase }), recordEngineError)
  const limit = createRateLimiter(rateLimit)
  const loadReference = createReferenceLoader(referenceDir)
  const assistant = store ? createAssistant({ store, ai, loadReference, pricing: aiPricing }) : null
  const market = marketplace ?? (auth ? createSupabaseMarketplace(auth) : null)
  const marketRoutes = market ? createMarketplaceRoutes({ ...market, moderate: createListingModerator({ ai }), moderationKey: moderationKey || null, readJson, sendJson }) : null
  const handleBusiness = verify && store ? createBusinessRoutes({ store, verify, bearerToken, readJson, sendJson, assistant, marketplace: marketRoutes }) : null
  const handleConversations = verify && store ? createConversationRoutes({ store, verify, bearerToken, readJson, sendJson }) : null
  // Marketplace publique : lecture large (une adresse IP peut regrouper de nombreux abonnés mobiles),
  // signalements limités (10 par heure et par adresse).
  const marketLimit = createRateLimiter({ windowMs: 60_000, maxRequests: 300 })
  const reportLimit = createRateLimiter({ windowMs: 3_600_000, maxRequests: 10 })
  // Espace Business : limite par compte (jeton de connexion), car les opérateurs mobiles font souvent
  // partager une même adresse IP à de nombreux abonnés ; une limite large par adresse reste en garde-fou.
  const businessLimit = createRateLimiter({ windowMs: 60_000, maxRequests: 120 })
  const businessAddressLimit = createRateLimiter({ windowMs: 60_000, maxRequests: 1200 })
  /** Clé de limite d’une demande Business : empreinte du jeton, sinon l’adresse. @param {import('node:http').IncomingMessage} req */
  const businessClient = (req) => {
    const token = bearerToken(req)
    return token ? `compte:${createHash('sha256').update(token).digest('hex').slice(0, 32)}` : `adresse:${clientOf(req)}`
  }
  const admin = createAdminAuth({ password: adminPassword })

  /**
   * Console d’administration : session, connexion, déconnexion et vue d’ensemble (réservée).
   * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} path
   */
  const handleAdmin = async (req, res, path) => {
    if (path === '/api/admin/session' && req.method === 'GET') {
      return sendJson(res, 200, { configured: admin.configured, authenticated: admin.isAuthenticated(req) })
    }
    if (path === '/api/admin/login' && req.method === 'POST') {
      if (!admin.configured) return sendJson(res, 503, { error: 'La console n’est pas configurée : définissez le secret ADMIN_PASSWORD sur le serveur.' })
      let body
      try {
        body = await readJson(req)
      } catch {
        return sendJson(res, 400, { error: 'Requête invalide.' })
      }
      const result = admin.login(clientOf(req), body?.password)
      if (result.ok) {
        res.setHeader('Set-Cookie', admin.cookieHeader(req, result.cookie))
        return sendJson(res, 200, { authenticated: true })
      }
      if (result.blockedUntil) return sendJson(res, 429, errorBody('Trop d’essais incorrects.', result.blockedUntil))
      return sendJson(res, 401, { error: 'Mot de passe incorrect.' })
    }
    if (path === '/api/admin/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', admin.cookieHeader(req, null))
      return sendJson(res, 200, { authenticated: false })
    }
    if (!admin.isAuthenticated(req)) return sendJson(res, 401, { error: 'Connexion administrateur requise.' })
    if (path.startsWith('/api/admin/moderation') || path.startsWith('/api/admin/sellers/')) {
      if (!marketRoutes) return sendJson(res, 503, { error: 'La marketplace n’est pas configurée sur ce serveur.' })
      return marketRoutes.handleAdmin(req, res, path)
    }
    if (path === '/api/admin/overview' && req.method === 'GET') {
      const { reference } = loadReference()
      const sent = buildReferenceText(reference)
      return sendJson(res, 200, {
        version: version ?? null,
        engine: { provider: ai.name, configured: ai.configured, model: ai.models.standard, liteModel: ai.models.lite },
        engineErrors,
        reference: {
          sheetChars: reference.sheet.length,
          examples: reference.examples.length,
          entries: reference.entries.length,
          counts: reference.counts,
          problems: reference.problems,
          sentChars: sent.text.length,
          maxChars: MAX_REFERENCE_CHARS,
          omittedExamples: sent.omittedExamples,
          omittedEntries: sent.omittedEntries,
        },
      })
    }
    return sendJson(res, 404, { error: 'Introuvable.' })
  }

  return async (req, res, next) => {
    const path = (req.url ?? '').split('?')[0]

    if (path === '/api/health' && req.method === 'GET') {
      // Public : seulement ce dont l’interface a besoin. Les noms des modèles et l’état de la
      // référence du mooré sont réservés à la console d’administration.
      return sendJson(res, 200, {
        engine: ai.configured ? ai.name : 'demo',
        liteModel: Boolean(ai.configured && ai.models.lite),
        ...(version ? { version } : {}),
        // Adresse et clé publique de Supabase : faites pour le navigateur (la sécurité repose sur la RLS).
        ...(auth ? { auth: { supabaseUrl: auth.supabaseUrl, publishableKey: auth.publishableKey } } : {}),
      })
    }
    if (path === '/api/business' || path.startsWith('/api/business/')) {
      if (!handleBusiness) return sendJson(res, 503, { error: 'L’espace Business n’est pas configuré sur ce serveur.' })
      const blocked = businessAddressLimit(clientOf(req)) ?? businessLimit(businessClient(req))
      if (blocked) return sendJson(res, 429, errorBody('Trop de demandes en peu de temps.', blocked))
      return handleBusiness(req, res, path)
    }
    // Conversations enregistrées sur le compte : même limite par compte que l’Espace Business.
    if (path === '/api/conversations' || path.startsWith('/api/conversations/')) {
      if (!handleConversations) return sendJson(res, 503, { error: 'Les comptes ne sont pas configurés sur ce serveur.' })
      const blocked = businessAddressLimit(clientOf(req)) ?? businessLimit(businessClient(req))
      if (blocked) return sendJson(res, 429, errorBody('Trop de demandes en peu de temps.', blocked))
      return handleConversations(req, res, path)
    }
    if (path.startsWith('/api/marketplace/')) {
      if (!marketRoutes) return sendJson(res, 503, { error: 'La marketplace n’est pas configurée sur ce serveur.' })
      const isReport = req.method === 'POST' && path.endsWith('/report')
      const blocked = (isReport ? reportLimit : marketLimit)(clientOf(req))
      if (blocked) return sendJson(res, 429, errorBody(isReport ? 'Trop de signalements envoyés : réessayez plus tard.' : 'Trop de demandes en peu de temps.', blocked))
      // Connexion facultative : un signalement garde l’auteur quand il est connecté.
      const token = bearerToken(req)
      const user = token && verify ? await verify(token).catch(() => null) : null
      return marketRoutes.handlePublic(req, res, path, user ? { token, userId: user.id } : null)
    }
    if (path === '/api/me' && req.method === 'GET') {
      // Compte de l’utilisateur, vérifié auprès de Supabase : base de toutes les futures adresses Business.
      if (!verify) return sendJson(res, 503, { error: 'Les comptes ne sont pas configurés sur ce serveur.' })
      try {
        const user = await verify(bearerToken(req))
        return user ? sendJson(res, 200, { user }) : sendJson(res, 401, { error: 'Connexion requise.' })
      } catch (error) {
        return sendJson(res, 503, { error: /** @type {Error} */ (error).message })
      }
    }
    if (path.startsWith('/api/admin/')) return handleAdmin(req, res, path)
    if (path !== '/api/chat' && path !== '/api/title') {
      if (next) return next()
      return sendJson(res, 404, { error: 'Introuvable.' })
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' })
    if (!ai.configured) return sendJson(res, 503, { error: 'Aucun moteur d’IA n’est configuré sur ce serveur.' })

    // Les administrateurs (outil d’évaluation) ne sont pas soumis à la limite par visiteur.
    const blockedUntil = admin.isAuthenticated(req) ? null : limit(clientOf(req))
    if (blockedUntil) return sendJson(res, 429, errorBody('Trop de demandes en peu de temps.', blockedUntil))

    if (path === '/api/title') {
      try {
        const body = await readJson(req)
        if (typeof body?.text !== 'string' || !body.text.trim() || body.text.length > MAX_MESSAGE_CHARS) return sendJson(res, 400, { error: 'Requête invalide.' })
        const title = await ai.generateTitle({ text: body.text })
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
      const { modelTier, ...reply } = request
      for await (const event of ai.streamReply({ ...reply, tier: modelTier, reference: loadReference().text, signal: controller.signal })) {
        if (!started) {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
          started = true
        }
        // Les jetons consommés servent au suivi des coûts côté serveur : le navigateur ne les reçoit pas.
        if ('usage' in event || 'functionCall' in event) continue
        res.write(`${JSON.stringify(event)}\n`)
      }
      if (!started) res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end()
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof UpstreamError ? error.message : 'Le moteur est momentanément indisponible. Réessayez plus tard.'
      if (!(error instanceof UpstreamError)) console.error('[gilli] Erreur du moteur :', error)
      const retryAt = error instanceof UpstreamError ? error.retryAt : undefined
      if (started) {
        res.end(`${JSON.stringify(errorBody(message, retryAt, quotaCode(error)))}\n`)
      } else {
        sendJson(res, error instanceof UpstreamError ? error.status : 502, errorBody(message, retryAt, quotaCode(error)))
      }
    }
  }
}
