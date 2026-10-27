// Adresses de la marketplace :
// * publiques (/api/marketplace/*) : catégories, recherche, annonce, vitrine d’un vendeur, signalement ;
// * vendeur (/api/business/:id/seller et /listings, compte requis) : vitrine et annonces, avec contrôle
//   automatique à chaque publication ou modification ;
// * administration (/api/admin/moderation…, console protégée) : file de vérification et décisions.
import { randomUUID } from 'node:crypto'
import { BusinessError, isUuid } from '../business/validate.mjs'
import { CATEGORIES, CONDITIONS } from './categories.mjs'
import { validatePaymentRequest, validatePricing } from './payments.mjs'
import { checkReviewRules, validateReview } from './reviews.mjs'
import { PHOTO_TYPES, REPORT_REASONS, validateListingInput, validateReport, validateSearch, validateSellerProfile } from './validate.mjs'

/**
 * @typedef {(res: import('node:http').ServerResponse, status: number, body: unknown) => void} SendJson
 * @typedef {(req: import('node:http').IncomingMessage) => Promise<unknown>} ReadJson
 */

/**
 * @param {{
 *   store: import('./store.mjs').MarketplaceStore,
 *   photos: import('./store.mjs').PhotoStore,
 *   moderate: (listing: import('./moderation.mjs').ListingContent, images: Array<{ mimeType: string, data: string }>) => Promise<import('./moderation.mjs').ModerationDecision>,
 *   moderationKey?: string | null,
 *   onPublished?: (listingId: string) => void,
 *   readJson: ReadJson,
 *   sendJson: SendJson,
 * }} deps
 */
export function createMarketplaceRoutes({ store, photos, moderate, moderationKey = null, onPublished = () => {}, readJson, sendJson }) {
  const photoUrl = (/** @type {string | null | undefined} */ path) => (path ? photos.url(path) : null)
  /** @param {any} card */
  const withPhoto = (card) => ({ ...card, photo: photoUrl(card.photo) })
  /** @param {import('./store.mjs').OwnListing} listing */
  const ownListing = (listing) => ({ ...listing, photos: listing.photos.map((path) => ({ path, url: photos.url(path) })) })

  /** @param {import('node:http').ServerResponse} res @param {unknown} error */
  const fail = (res, error) => {
    if (error instanceof BusinessError) return sendJson(res, error.status, { error: error.message })
    const { status, message } = /** @type {{ status?: number, message?: string }} */ (error)
    if (status === 400 || status === 413) return sendJson(res, status, { error: message ?? 'Requête invalide.' })
    console.error('[gilli] Erreur marketplace :', error)
    return sendJson(res, 500, { error: 'Erreur inattendue. Réessayez.' })
  }

  /**
   * Contrôle automatique d’une annonce soumise, puis décision enregistrée (publication ou vérification).
   * Sans clé de modération, l’annonce reste en attente d’une décision de l’administration.
   * @param {import('./store.mjs').OwnListing} listing @param {Array<{ mimeType: string, data: string }>} images
   */
  const autoModerate = async (listing, images) => {
    if (!moderationKey) return listing
    const decision = await moderate(listing, images)
    try {
      const moderated = await store.moderate(moderationKey, listing.id, listing.revision, decision.status, decision.reasons, 'auto')
      if (moderated.status === 'published') onPublished(moderated.id)
      return moderated
    } catch (error) {
      // Annonce modifiée entre-temps : la nouvelle version a son propre contrôle.
      if (error instanceof BusinessError && error.status === 409) return listing
      throw error
    }
  }

  /**
   * Contrôle automatique d’un avis soumis : publié, ou envoyé en vérification humaine. Sans clé de
   * modération, il reste en attente (invisible) jusqu’à une décision de l’administration.
   * @param {import('./store.mjs').Review} review
   */
  const autoModerateReview = async (review) => {
    if (!moderationKey) return review
    const { suspicious, reasons } = checkReviewRules(review.comment)
    try {
      return await store.moderateReview(moderationKey, review.id, review.revision, suspicious ? 'review' : 'published', reasons, 'auto')
    } catch (error) {
      if (error instanceof BusinessError && error.status === 409) return review
      throw error
    }
  }

  return {
    /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} path @param {import('./store.mjs').Session | null} session */
    async handlePublic(req, res, path, session) {
      try {
        const [, , , resource, itemId, action] = path.split('/') // ['', 'api', 'marketplace', resource, id, action]
        const method = req.method ?? 'GET'
        if (resource === 'categories' && method === 'GET') return sendJson(res, 200, { categories: CATEGORIES, conditions: CONDITIONS, reportReasons: REPORT_REASONS })
        if (resource === 'search' && method === 'GET') {
          const result = await store.search(validateSearch(new URL(req.url ?? '/', 'http://localhost').searchParams))
          return sendJson(res, 200, { total: result.total, items: result.items.map(withPhoto), sponsored: (result.sponsored ?? []).map(withPhoto) })
        }
        if (itemId !== undefined && !isUuid(itemId)) throw new BusinessError(404, 'Introuvable.')
        if (resource === 'listings' && itemId && !action && method === 'GET') {
          const listing = await store.listing(itemId)
          if (!listing) throw new BusinessError(404, 'Cette annonce n’est pas (ou plus) disponible.')
          return sendJson(res, 200, { listing: { ...listing, photos: listing.photos.map(photoUrl) } })
        }
        if (resource === 'listings' && itemId && action === 'report' && method === 'POST') {
          const { reason, details } = validateReport(await readJson(req))
          await store.report(session, itemId, reason, details)
          return sendJson(res, 201, { reported: true })
        }
        // Avis du compte connecté sur un vendeur : lire, donner ou modifier, supprimer.
        if (resource === 'sellers' && itemId && action === 'review') {
          if (!session) throw new BusinessError(401, 'Connectez-vous pour donner votre avis.')
          if (method === 'GET') return sendJson(res, 200, { review: await store.myReview(session, itemId) })
          if (method === 'PUT') {
            const { rating, comment } = validateReview(await readJson(req))
            const review = await autoModerateReview(await store.saveReview(session, itemId, rating, comment))
            return sendJson(res, 200, { review })
          }
          if (method === 'DELETE') {
            await store.deleteReview(session, itemId)
            return sendJson(res, 200, { deleted: true })
          }
        }
        if (resource === 'sellers' && itemId && !action && method === 'GET') {
          const page = await store.seller(itemId)
          if (!page) throw new BusinessError(404, 'Vendeur introuvable.')
          return sendJson(res, 200, { seller: page.seller, listings: page.listings.map(withPhoto), reviews: page.reviews ?? [] })
        }
        throw new BusinessError(404, 'Introuvable.')
      } catch (error) {
        return fail(res, error)
      }
    },

    /**
     * Vitrine et annonces du commerce (les erreurs sont traitées par les adresses Business).
     * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
     * @param {import('./store.mjs').Session} session @param {{ id: string, countryCode: string }} business
     * @param {string} collection @param {string | undefined} itemId @param {string | undefined} action
     */
    async handleSeller(req, res, session, business, collection, itemId, action) {
      const method = req.method ?? 'GET'
      if (collection === 'seller' && !itemId) {
        if (method === 'GET') return sendJson(res, 200, { profile: await store.getSellerProfile(session, business.id) })
        if (method === 'PUT') return sendJson(res, 200, { profile: await store.saveSellerProfile(session, business.id, validateSellerProfile(await readJson(req), business.countryCode)) })
      }
      if (collection === 'listings' && !itemId && method === 'GET') {
        return sendJson(res, 200, { listings: (await store.listOwnListings(session, business.id)).map(ownListing) })
      }
      if (collection === 'listings' && !itemId && method === 'POST') {
        const input = validateListingInput(await readJson(req), business.id)
        /** @type {string[]} */
        const added = []
        for (const photo of input.newPhotos) {
          const path = `${business.id}/${randomUUID()}.${PHOTO_TYPES[photo.mimeType]}`
          await photos.put(session, path, { mimeType: photo.mimeType, bytes: photo.bytes })
          added.push(path)
        }
        const submitted = await store.submitListing(session, business.id, {
          productId: input.productId, title: input.title, description: input.description, category: input.category, subcategory: input.subcategory,
          condition: input.condition, attributes: input.attributes, photos: [...input.keepPhotos, ...added],
        })
        const moderated = await autoModerate(submitted, input.newPhotos.map(({ mimeType, data }) => ({ mimeType, data })))
        return sendJson(res, 201, { listing: ownListing(moderated), moderation: moderationKey ? 'done' : 'unavailable' })
      }
      // Formule Pro ou sponsorisation : le commerçant déclare son paiement Mobile Money.
      if (collection === 'payments' && !itemId && method === 'POST') {
        return sendJson(res, 201, { payment: await store.requestPayment(session, business.id, validatePaymentRequest(await readJson(req), business.countryCode)) })
      }
      if (collection === 'listings' && itemId && action === 'withdraw' && method === 'POST') {
        if (!isUuid(itemId)) throw new BusinessError(404, 'Annonce introuvable.')
        return sendJson(res, 200, { listing: ownListing(await store.withdrawListing(session, business.id, itemId)) })
      }
      throw new BusinessError(404, 'Introuvable.')
    },

    /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} path */
    async handleAdmin(req, res, path) {
      try {
        if (!moderationKey) throw new BusinessError(503, 'La modération n’est pas configurée : définissez MODERATION_KEY sur le serveur et dans la base.')
        const [, , , resource, itemId, action] = path.split('/') // ['', 'api', 'admin', resource, id, action]
        const method = req.method ?? 'GET'
        if (resource === 'moderation' && !itemId && method === 'GET') {
          const status = new URL(req.url ?? '/', 'http://localhost').searchParams.get('status') ?? 'review'
          if (!['pending', 'review', 'published', 'rejected', 'hidden'].includes(status)) throw new BusinessError(422, 'Statut invalide.')
          const queue = await store.queue(moderationKey, status)
          return sendJson(res, 200, { listings: queue.map((item) => ({ ...item, photos: item.photos.map(photoUrl) })) })
        }
        if (resource === 'moderation' && itemId && isUuid(itemId) && method === 'POST') {
          const body = /** @type {any} */ (await readJson(req))
          if (!['published', 'rejected', 'hidden', 'review'].includes(body?.status) || !Number.isInteger(body?.revision)) throw new BusinessError(422, 'Décision invalide.')
          const reason = typeof body.reason === 'string' && body.reason.trim() ? [`Administration : ${body.reason.trim().slice(0, 300)}`] : []
          const moderated = await store.moderate(moderationKey, itemId, body.revision, body.status, reason, 'admin')
          if (moderated.status === 'published') onPublished(moderated.id)
          return sendJson(res, 200, { listing: moderated })
        }
        if (resource === 'payments' && !itemId && method === 'GET') {
          const status = new URL(req.url ?? '/', 'http://localhost').searchParams.get('status') ?? 'pending'
          if (!['pending', 'confirmed', 'rejected'].includes(status)) throw new BusinessError(422, 'Statut invalide.')
          return sendJson(res, 200, { payments: await store.paymentQueue(moderationKey, status) })
        }
        if (resource === 'payments' && itemId && isUuid(itemId) && method === 'POST') {
          const body = /** @type {any} */ (await readJson(req))
          if (!['confirmed', 'rejected'].includes(body?.status)) throw new BusinessError(422, 'Décision invalide.')
          const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null
          return sendJson(res, 200, { payment: await store.decidePayment(moderationKey, itemId, body.status, note) })
        }
        if (resource === 'pricing' && !itemId && method === 'GET') return sendJson(res, 200, { pricing: await store.pricing(moderationKey) })
        if (resource === 'pricing' && !itemId && method === 'PUT') return sendJson(res, 200, { pricing: await store.savePricing(moderationKey, validatePricing(await readJson(req))) })
        if (resource === 'reviews' && !itemId && method === 'GET') {
          const status = new URL(req.url ?? '/', 'http://localhost').searchParams.get('status') ?? 'review'
          if (!['pending', 'review', 'published', 'hidden'].includes(status)) throw new BusinessError(422, 'Statut invalide.')
          return sendJson(res, 200, { reviews: await store.reviewQueue(moderationKey, status) })
        }
        if (resource === 'reviews' && itemId && isUuid(itemId) && method === 'POST') {
          const body = /** @type {any} */ (await readJson(req))
          if (!['published', 'hidden', 'review'].includes(body?.status) || !Number.isInteger(body?.revision)) throw new BusinessError(422, 'Décision invalide.')
          return sendJson(res, 200, { review: await store.moderateReview(moderationKey, itemId, body.revision, body.status, [], 'admin') })
        }
        if (resource === 'sellers' && itemId && isUuid(itemId) && action === 'verified' && method === 'POST') {
          const body = /** @type {any} */ (await readJson(req))
          await store.setSellerVerified(moderationKey, itemId, body?.verified === true)
          return sendJson(res, 200, { verified: body?.verified === true })
        }
        throw new BusinessError(404, 'Introuvable.')
      } catch (error) {
        return fail(res, error)
      }
    },
  }
}
