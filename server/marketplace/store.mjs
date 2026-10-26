// Accès aux données de la marketplace dans Supabase (API REST PostgREST et Storage).
// * Lecture publique : clé publique seulement (fonctions marketplace_*, annonces publiées).
// * Vendeur : jeton de l’utilisateur (règles RLS et fonctions contrôlées).
// * Modération : clé de modération, vérifiée par la base (le serveur n’a pas de clé secrète Supabase).
import { toBusinessError } from '../business/supabase-store.mjs'
import { BusinessError } from '../business/validate.mjs'

/**
 * @typedef {{ token: string, userId: string }} Session
 * @typedef {{ businessId: string, displayName: string, city: string, whatsapp: string | null, phone: string | null, deliversEverywhere: boolean, deliveryCities: string[], description: string | null, verified: boolean }} SellerProfile
 * @typedef {{ id: string, productId: string, title: string, description: string, category: string, subcategory: string | null, condition: string, attributes: Record<string, unknown>, photos: string[], status: string, revision: number, reasons: string[], moderatedBy: string | null, updatedAt: string }} OwnListing
 * @typedef {{ query?: string | null, category?: string | null, subcategory?: string | null, city?: string | null, minPrice?: number | null, maxPrice?: number | null, condition?: string | null, sort?: string, verifiedOnly?: boolean, attributes?: Record<string, unknown> | null, publishedAfter?: string | null, limit?: number, offset?: number }} SearchFilters
 * @typedef {{ title: string, description: string, category: string, subcategory: string | null, condition: string, attributes: Record<string, unknown>, photos: string[], productId: string }} ListingSubmission
 *
 * @typedef {object} MarketplaceStore
 * @property {(filters: SearchFilters) => Promise<{ total: number, items: any[] }>} search
 * @property {(listingId: string) => Promise<any | null>} listing
 * @property {(businessId: string) => Promise<any | null>} seller
 * @property {(session: Session | null, listingId: string, reason: string, details: string | null) => Promise<void>} report
 * @property {(session: Session, businessId: string) => Promise<SellerProfile | null>} getSellerProfile
 * @property {(session: Session, businessId: string, input: Omit<SellerProfile, 'businessId' | 'verified'>) => Promise<SellerProfile>} saveSellerProfile
 * @property {(session: Session, businessId: string) => Promise<OwnListing[]>} listOwnListings
 * @property {(session: Session, businessId: string, input: ListingSubmission) => Promise<OwnListing>} submitListing
 * @property {(session: Session, businessId: string, listingId: string) => Promise<OwnListing>} withdrawListing
 * @property {(key: string, listingId: string, revision: number, status: string, reasons: string[], by: 'auto' | 'admin') => Promise<OwnListing>} moderate
 * @property {(key: string, status: string) => Promise<any[]>} queue
 * @property {(key: string, businessId: string, verified: boolean) => Promise<void>} setSellerVerified
 *
 * @typedef {object} PhotoStore
 * @property {(session: Session, path: string, photo: { mimeType: string, bytes: Buffer }) => Promise<void>} put
 * @property {(path: string) => string} url Adresse publique d’une photo.
 */

/** @param {any} row @returns {SellerProfile} */
export const toSellerProfile = (row) => ({
  businessId: row.business_id,
  displayName: row.display_name,
  city: row.city,
  whatsapp: row.whatsapp ?? null,
  phone: row.phone ?? null,
  deliversEverywhere: Boolean(row.delivers_everywhere),
  deliveryCities: row.delivery_cities ?? [],
  description: row.description ?? null,
  verified: Boolean(row.verified),
})

/** @param {any} row @returns {OwnListing} */
export const toOwnListing = (row) => ({
  id: row.id,
  productId: row.product_id,
  title: row.title,
  description: row.description ?? '',
  category: row.category,
  subcategory: row.subcategory ?? null,
  condition: row.condition,
  attributes: row.attributes ?? {},
  photos: row.photos ?? [],
  status: row.status,
  revision: Number(row.revision),
  reasons: row.moderation_reasons ?? [],
  moderatedBy: row.moderated_by ?? null,
  updatedAt: new Date(row.updated_at).toISOString(),
})

export const LISTING_COLUMNS = 'id,product_id,title,description,category,subcategory,condition,attributes,photos,status,revision,moderation_reasons,moderated_by,updated_at'
export const SELLER_COLUMNS = 'business_id,display_name,city,whatsapp,phone,delivers_everywhere,delivery_cities,description,verified'

/** Paramètres de recherche au format des fonctions SQL. @param {SearchFilters} filters */
export const searchParams = (filters) => ({
  p_query: filters.query ?? null,
  p_category: filters.category ?? null,
  p_subcategory: filters.subcategory ?? null,
  p_city: filters.city ?? null,
  p_min_price: filters.minPrice ?? null,
  p_max_price: filters.maxPrice ?? null,
  p_condition: filters.condition ?? null,
  p_limit: filters.limit ?? 24,
  p_offset: filters.offset ?? 0,
  p_sort: filters.sort ?? 'relevance',
  p_verified_only: filters.verifiedOnly ?? false,
  p_attributes: filters.attributes ?? null,
  p_published_after: filters.publishedAfter ?? null,
})

/**
 * @param {{ supabaseUrl: string, publishableKey: string }} config
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {{ store: MarketplaceStore, photos: PhotoStore }}
 */
export function createSupabaseMarketplace({ supabaseUrl, publishableKey }, { fetchImpl = fetch } = {}) {
  /** @param {string} method @param {string} path @param {unknown} [body] @param {string | null} [token] @param {boolean} [representation] */
  const request = async (method, path, body, token = null, representation = false) => {
    let response
    try {
      response = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: publishableKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
          ...(representation ? { Prefer: 'return=representation' } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new BusinessError(503, 'La base de données est injoignable. Réessayez.')
    }
    const text = await response.text()
    /** @type {any} */
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    if (!response.ok) throw toBusinessError(response.status, data)
    return data
  }
  const id = (/** @type {string} */ value) => encodeURIComponent(value)

  /** @type {MarketplaceStore} */
  const store = {
    search: (filters) => request('POST', 'rpc/marketplace_search', searchParams(filters)),
    listing: (listingId) => request('POST', 'rpc/marketplace_listing', { p_listing_id: listingId }),
    seller: (businessId) => request('POST', 'rpc/marketplace_seller', { p_business_id: businessId }),
    async report(session, listingId, reason, details) {
      await request('POST', 'rpc/report_listing', { p_listing_id: listingId, p_reason: reason, p_details: details }, session?.token ?? null)
    },
    async getSellerProfile(session, businessId) {
      const rows = await request('GET', `seller_profiles?select=${SELLER_COLUMNS}&business_id=eq.${id(businessId)}`, undefined, session.token)
      return rows?.[0] ? toSellerProfile(rows[0]) : null
    },
    async saveSellerProfile(session, businessId, input) {
      return toSellerProfile(await request('POST', 'rpc/upsert_seller_profile', {
        p_business_id: businessId, p_display_name: input.displayName, p_city: input.city, p_whatsapp: input.whatsapp, p_phone: input.phone,
        p_delivers_everywhere: input.deliversEverywhere, p_delivery_cities: input.deliveryCities, p_description: input.description,
      }, session.token))
    },
    async listOwnListings(session, businessId) {
      const rows = await request('GET', `listings?select=${LISTING_COLUMNS}&business_id=eq.${id(businessId)}&order=updated_at.desc`, undefined, session.token)
      return rows.map(toOwnListing)
    },
    async submitListing(session, businessId, input) {
      return toOwnListing(await request('POST', 'rpc/submit_listing', {
        p_business_id: businessId, p_product_id: input.productId, p_title: input.title, p_description: input.description, p_category: input.category,
        p_subcategory: input.subcategory, p_condition: input.condition, p_attributes: input.attributes, p_photos: input.photos,
      }, session.token))
    },
    async withdrawListing(session, businessId, listingId) {
      return toOwnListing(await request('POST', 'rpc/withdraw_listing', { p_business_id: businessId, p_listing_id: listingId }, session.token))
    },
    async moderate(key, listingId, revision, status, reasons, by) {
      return toOwnListing(await request('POST', 'rpc/moderate_listing', { p_key: key, p_listing_id: listingId, p_revision: revision, p_status: status, p_reasons: reasons, p_by: by }))
    },
    queue: (key, status) => request('POST', 'rpc/moderation_queue', { p_key: key, p_status: status }),
    async setSellerVerified(key, businessId, verified) {
      await request('POST', 'rpc/set_seller_verified', { p_key: key, p_business_id: businessId, p_verified: verified })
    },
  }

  /** @type {PhotoStore} */
  const photos = {
    async put(session, path, photo) {
      let response
      try {
        response = await fetchImpl(`${supabaseUrl}/storage/v1/object/listing-photos/${path}`, {
          method: 'POST',
          headers: { apikey: publishableKey, Authorization: `Bearer ${session.token}`, 'Content-Type': photo.mimeType, 'x-upsert': 'false' },
          body: new Uint8Array(photo.bytes),
          signal: AbortSignal.timeout(20_000),
        })
      } catch {
        throw new BusinessError(503, 'Les photos n’ont pas pu être envoyées. Réessayez.')
      }
      if (!response.ok) throw new BusinessError(response.status === 403 || response.status === 400 ? 403 : 502, 'Les photos n’ont pas pu être enregistrées.')
    },
    url: (path) => `${supabaseUrl}/storage/v1/object/public/listing-photos/${path}`,
  }

  return { store, photos }
}
