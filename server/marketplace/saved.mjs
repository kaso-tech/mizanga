// Marketplace sur le compte (connexion requise) :
// * /api/saved : favoris et alertes de recherche, copiés depuis l’appareil puis tenus à jour ;
// * /api/push : abonnement du téléphone aux notifications des alertes (Web Push).
import { BusinessError, isUuid } from '../business/validate.mjs'
import { validateSearch } from './validate.mjs'

const invalid = (/** @type {string} */ message) => new BusinessError(422, message)
const isText = (/** @type {unknown} */ value, max = 200) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const isDate = (/** @type {unknown} */ value) => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value))

/** Fiche gardée avec un favori (affichée même si l’annonce est retirée). @param {unknown} body */
export function validateFavorite(body) {
  const raw = /** @type {Record<string, unknown> | null} */ (body && typeof body === 'object' ? body : null)
  if (!raw || !isText(raw.title, 200) || typeof raw.price !== 'number' || !Number.isFinite(raw.price) || raw.price < 0) throw invalid('Favori invalide.')
  const photo = typeof raw.photo === 'string' && raw.photo.length <= 500 && (raw.photo.startsWith('/') || raw.photo.startsWith('https://')) ? raw.photo : null
  return {
    title: /** @type {string} */ (raw.title).trim(),
    price: Math.round(raw.price),
    currency: isText(raw.currency, 3) ? raw.currency : 'XOF',
    photo,
    city: isText(raw.city, 60) ? raw.city : '',
    sellerName: isText(raw.sellerName, 120) ? raw.sellerName : '',
    sellerVerified: raw.sellerVerified === true,
    condition: isText(raw.condition, 20) ? raw.condition : 'new',
    savedAt: isDate(raw.savedAt) ? new Date(/** @type {string} */ (raw.savedAt)).toISOString() : new Date().toISOString(),
  }
}

const FILTER_TEXT = ['q', 'category', 'subcategory', 'city', 'condition', 'verified']
const FILTER_NUMBERS = ['minPrice', 'maxPrice']

/**
 * Alerte : nom, filtres (tels que l’application les connaît) et critères de recherche calculés par le
 * serveur avec les mêmes contrôles que la recherche (catégorie, caractéristiques…).
 * @param {string} id @param {unknown} body @returns {import('./store.mjs').AlertInput}
 */
export function validateAlert(id, body) {
  if (!isUuid(id)) throw new BusinessError(404, 'Alerte introuvable.')
  const raw = /** @type {Record<string, unknown> | null} */ (body && typeof body === 'object' ? body : null)
  if (!raw || !isText(raw.label, 200)) throw invalid('Nom de l’alerte invalide.')
  const input = /** @type {Record<string, unknown>} */ (raw.filters && typeof raw.filters === 'object' ? raw.filters : {})
  /** @type {Record<string, unknown>} */
  const filters = {}
  const params = new URLSearchParams()
  for (const key of FILTER_TEXT) {
    if (isText(input[key], 100)) {
      filters[key] = input[key]
      params.set(key, /** @type {string} */ (input[key]))
    }
  }
  for (const key of FILTER_NUMBERS) {
    const value = input[key]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      filters[key] = value
      params.set(key, String(value))
    }
  }
  if (input.attributes && typeof input.attributes === 'object') {
    /** @type {Record<string, string>} */
    const attributes = {}
    for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (input.attributes))) {
      if (/^[a-z_]{1,40}$/.test(key) && isText(value, 60)) {
        attributes[key] = /** @type {string} */ (value)
        params.set(`a_${key}`, /** @type {string} */ (value))
      }
    }
    if (Object.keys(attributes).length) filters.attributes = attributes
  }
  const search = validateSearch(params)
  return {
    id,
    label: /** @type {string} */ (raw.label).trim(),
    filters,
    criteria: {
      query: search.query,
      category: search.category,
      subcategory: search.subcategory,
      condition: search.condition,
      min_price: search.minPrice,
      max_price: search.maxPrice,
      verified_only: search.verifiedOnly,
      attributes: search.attributes,
    },
    seenAt: isDate(raw.seenAt) ? new Date(/** @type {string} */ (raw.seenAt)).toISOString() : new Date().toISOString(),
    notify: raw.notify !== false,
  }
}

/** Abonnement Web Push envoyé par le navigateur (PushSubscription.toJSON()). @param {unknown} body */
export function validatePushSubscription(body) {
  const raw = /** @type {any} */ (body)
  const endpoint = raw?.endpoint
  if (typeof endpoint !== 'string' || !/^https:\/\/[^\s]{8,990}$/.test(endpoint)) throw invalid('Abonnement invalide.')
  const p256dh = raw?.keys?.p256dh
  const auth = raw?.keys?.auth
  if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || typeof auth !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) throw invalid('Abonnement invalide.')
  return { endpoint, p256dh, auth }
}

/**
 * @param {{
 *   store: import('./store.mjs').MarketplaceStore,
 *   verify: (token: string) => Promise<import('../auth/supabase-auth.mjs').AuthUser | null>,
 *   bearerToken: (req: import('node:http').IncomingMessage) => string,
 *   readJson: import('../business/routes.mjs').ReadJson,
 *   sendJson: import('../business/routes.mjs').SendJson,
 *   push: { publicKey: () => Promise<string | null> } | null,
 * }} deps
 */
export function createSavedRoutes({ store, verify, bearerToken, readJson, sendJson, push }) {
  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} path */
  return async (req, res, path) => {
    try {
      const method = req.method ?? 'GET'
      // Clé publique des notifications : publique, sans compte.
      if (path === '/api/push/key' && method === 'GET') {
        const publicKey = push ? await push.publicKey() : null
        return sendJson(res, 200, { publicKey })
      }
      const token = bearerToken(req)
      const user = await verify(token).catch(() => {
        throw new BusinessError(503, 'Supabase est injoignable.')
      })
      if (!user) throw new BusinessError(401, 'Connexion requise.')
      const session = { token, userId: user.id }
      const [, , collection, itemId] = path.split('/').slice(1) // ['api', 'saved' | 'push', collection, id]

      if (path === '/api/saved' && method === 'GET') return sendJson(res, 200, await store.listSaved(session))
      if (path.startsWith('/api/saved/') && collection === 'favorites' && itemId) {
        if (!isUuid(itemId)) throw new BusinessError(404, 'Annonce introuvable.')
        if (method === 'PUT') {
          await store.saveFavorite(session, itemId, validateFavorite(await readJson(req)))
          return sendJson(res, 200, { saved: true })
        }
        if (method === 'DELETE') {
          await store.deleteFavorite(session, itemId)
          return sendJson(res, 200, { deleted: true })
        }
      }
      if (path.startsWith('/api/saved/') && collection === 'alerts' && itemId) {
        if (method === 'PUT') {
          await store.saveAlert(session, validateAlert(itemId, await readJson(req)))
          return sendJson(res, 200, { saved: true })
        }
        if (method === 'DELETE') {
          if (!isUuid(itemId)) throw new BusinessError(404, 'Alerte introuvable.')
          await store.deleteAlert(session, itemId)
          return sendJson(res, 200, { deleted: true })
        }
      }
      if (path === '/api/push/subscriptions' && method === 'POST') {
        if (!push) throw new BusinessError(503, 'Les notifications ne sont pas configurées sur ce serveur.')
        await store.savePushSubscription(session, validatePushSubscription(await readJson(req)))
        return sendJson(res, 201, { subscribed: true })
      }
      if (path === '/api/push/subscriptions' && method === 'DELETE') {
        const body = /** @type {any} */ (await readJson(req))
        if (typeof body?.endpoint !== 'string' || body.endpoint.length > 1000) throw invalid('Abonnement invalide.')
        await store.deletePushSubscription(session, body.endpoint)
        return sendJson(res, 200, { unsubscribed: true })
      }
      throw new BusinessError(404, 'Introuvable.')
    } catch (error) {
      if (error instanceof BusinessError) return sendJson(res, error.status, { error: error.message })
      const { status, message } = /** @type {{ status?: number, message?: string }} */ (error)
      if (status === 400 || status === 413) return sendJson(res, status, { error: message ?? 'Requête invalide.' })
      console.error('[gilli] Erreur favoris et alertes :', error)
      return sendJson(res, 500, { error: 'Erreur inattendue. Réessayez.' })
    }
  }
}
