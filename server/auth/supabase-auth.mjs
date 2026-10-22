// Comptes utilisateurs (Supabase Auth). Le navigateur se connecte directement à Supabase avec la clé
// publique ; le serveur de Gilli vérifie ensuite chaque jeton auprès de Supabase avant d’accéder aux
// données d’un compte. Aucune clé secrète n’est utilisée ni transmise ici.
import { createHash } from 'node:crypto'

/**
 * @typedef {{ supabaseUrl: string, publishableKey: string }} AuthConfig
 * @typedef {{ id: string, email: string | null }} AuthUser
 */

/**
 * Une clé « secrète » (service_role) contourne toute la sécurité de la base : elle ne doit jamais être
 * envoyée au navigateur. On la reconnaît à son préfixe ou, pour l’ancien format JWT, à son rôle.
 * @param {string} key
 */
export function isSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.role === 'service_role'
  } catch {
    return false
  }
}

/**
 * Lit la configuration (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY). Renvoie null si elle est absente ;
 * lève une erreur si elle est invalide ou si la clé fournie est secrète, pour ne pas démarrer ainsi.
 * @param {Record<string, string | undefined>} env
 * @returns {AuthConfig | null}
 */
export function readAuthConfig(env) {
  const supabaseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, '')
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!supabaseUrl && !publishableKey) return null
  if (!supabaseUrl || !publishableKey) throw new Error('Configuration Supabase incomplète : SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY vont ensemble.')
  let url
  try {
    url = new URL(supabaseUrl)
  } catch {
    throw new Error('SUPABASE_URL n’est pas une adresse valide.')
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error('SUPABASE_URL doit commencer par https://.')
  if (isSecretKey(publishableKey)) throw new Error('SUPABASE_PUBLISHABLE_KEY contient une clé secrète (service_role) : utilisez la clé publique (« publishable » ou « anon »).')
  return { supabaseUrl, publishableKey }
}

/**
 * Vérifie un jeton d’accès auprès de Supabase (GET /auth/v1/user). Les réponses sont gardées une minute
 * pour ne pas solliciter Supabase à chaque requête ; un jeton refusé n’est jamais gardé.
 * @param {AuthConfig} config
 * @param {{ fetchImpl?: typeof fetch, cacheMs?: number, now?: () => number }} [options]
 * @returns {(token: string) => Promise<AuthUser | null>}
 */
export function createTokenVerifier({ supabaseUrl, publishableKey }, { fetchImpl = fetch, cacheMs = 60_000, now = Date.now } = {}) {
  /** @type {Map<string, { user: AuthUser, until: number }>} */
  const cache = new Map()
  return async (token) => {
    if (!token || token.length > 4096) return null
    const key = createHash('sha256').update(token).digest('base64url')
    const cached = cache.get(key)
    if (cached && cached.until > now()) return cached.user
    cache.delete(key)
    let response
    try {
      response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) })
    } catch {
      throw new Error('Supabase est injoignable.')
    }
    if (response.status === 401 || response.status === 403) return null
    if (!response.ok) throw new Error('Supabase est momentanément indisponible.')
    const body = /** @type {{ id?: unknown, email?: unknown }} */ (await response.json())
    if (typeof body.id !== 'string') return null
    const user = { id: body.id, email: typeof body.email === 'string' ? body.email : null }
    if (cache.size > 1000) cache.clear()
    cache.set(key, { user, until: now() + cacheMs })
    return user
  }
}

/** Jeton porté par l’en-tête « Authorization: Bearer … ». @param {import('node:http').IncomingMessage} req */
export function bearerToken(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''))
  return match ? match[1] : ''
}
