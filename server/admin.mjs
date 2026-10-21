// Console d’administration : connexion par mot de passe (secret ADMIN_PASSWORD du serveur) et
// session signée dans un cookie inaccessible aux scripts de la page. Rien de cela n’atteint le navigateur
// des utilisateurs : la vérification se fait ici, à chaque appel d’une adresse /api/admin/*.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const ADMIN_COOKIE = 'mizanga_admin'
export const MIN_ADMIN_PASSWORD_LENGTH = 12
const SESSION_MS = 8 * 60 * 60 * 1000
const LOGIN_ATTEMPTS = { windowMs: 15 * 60 * 1000, maxAttempts: 5 }

const sha256 = (/** @type {string} */ value) => createHash('sha256').update(value).digest()

/** Valeur d’un cookie de la requête. @param {import('node:http').IncomingMessage} req @param {string} name */
function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return undefined
}

/** La requête est-elle arrivée en HTTPS (directement ou derrière le proxy de l’hébergeur) ? @param {import('node:http').IncomingMessage} req */
const isHttps = (req) => String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https' || Boolean(/** @type {any} */ (req.socket).encrypted)

/**
 * @param {{ password?: string, now?: () => number }} [options]
 */
export function createAdminAuth({ password, now = Date.now } = {}) {
  const configured = typeof password === 'string' && password.length >= MIN_ADMIN_PASSWORD_LENGTH
  // Clé de signature dérivée du mot de passe : en changer invalide toutes les sessions ouvertes.
  const signingKey = configured ? createHmac('sha256', 'mizanga-admin-session').update(password).digest() : randomBytes(32)
  const expectedDigest = configured ? sha256(password) : randomBytes(32)
  /** @type {Map<string, number[]>} */
  const attempts = new Map()

  const sign = (/** @type {string} */ payload) => createHmac('sha256', signingKey).update(payload).digest('base64url')

  /** @param {import('node:http').IncomingMessage} req */
  const isAuthenticated = (req) => {
    if (!configured) return false
    const token = readCookie(req, ADMIN_COOKIE)
    if (!token) return false
    const [expiresAt, signature] = token.split('.')
    if (!expiresAt || !signature) return false
    const expected = Buffer.from(sign(expiresAt))
    const received = Buffer.from(signature)
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false
    return Number(expiresAt) > now()
  }

  /**
   * Vérifie le mot de passe. Renvoie `blockedUntil` quand trop d’essais ont échoué récemment.
   * @param {string} client @param {unknown} candidate
   * @returns {{ ok: true, cookie: string } | { ok: false, blockedUntil?: Date }}
   */
  const login = (client, candidate) => {
    const current = now()
    const recent = (attempts.get(client) ?? []).filter((time) => current - time < LOGIN_ATTEMPTS.windowMs)
    if (recent.length >= LOGIN_ATTEMPTS.maxAttempts) {
      attempts.set(client, recent)
      return { ok: false, blockedUntil: new Date(recent[0] + LOGIN_ATTEMPTS.windowMs) }
    }
    // Comparaison à temps constant sur les empreintes : la durée ne révèle rien du mot de passe.
    const valid = configured && typeof candidate === 'string' && timingSafeEqual(sha256(candidate), expectedDigest)
    if (!valid) {
      recent.push(current)
      attempts.set(client, recent)
      return { ok: false }
    }
    attempts.delete(client)
    const expiresAt = String(current + SESSION_MS)
    return { ok: true, cookie: `${expiresAt}.${sign(expiresAt)}` }
  }

  /** En-tête Set-Cookie de la session (ou de sa suppression). @param {import('node:http').IncomingMessage} req @param {string | null} value */
  const cookieHeader = (req, value) => [
    `${ADMIN_COOKIE}=${value ?? ''}`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${value ? SESSION_MS / 1000 : 0}`,
    ...(isHttps(req) ? ['Secure'] : []),
  ].join('; ')

  return { configured, isAuthenticated, login, cookieHeader }
}
