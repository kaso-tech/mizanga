// Marketplace pour les tests : mêmes fonctions SQL que Supabase, exécutées sur PGlite avec l’identité de
// l’utilisateur (ou en visiteur), et photos gardées en mémoire.
import { LISTING_COLUMNS, SELLER_COLUMNS, alertParams, searchParams, toOwnListing, toSavedAlert, toSavedFavorite, toSellerProfile } from '../../server/marketplace/store.mjs'
import { toBusinessError } from '../../server/business/supabase-store.mjs'
import { asUser } from './database.mjs'

/**
 * @param {import('@electric-sql/pglite').PGlite} db
 * @param {{ photoBaseUrl?: string }} [options]
 * @returns {{ store: import('../../server/marketplace/store.mjs').MarketplaceStore, photos: import('../../server/marketplace/store.mjs').PhotoStore & { files: Map<string, { mimeType: string, bytes: Buffer }> } }}
 */
export function createPgliteMarketplace(db, { photoBaseUrl = '/photos' } = {}) {
  /** @param {string | null} userId @param {string} sql @param {unknown[]} [params] */
  const query = async (userId, sql, params = []) => {
    try {
      return /** @type {any[]} */ ((await asUser(db, userId, () => db.query(sql, params))).rows)
    } catch (error) {
      throw toBusinessError(400, /** @type {{ code?: string, message?: string }} */ (error))
    }
  }
  /** @param {string} name @param {Record<string, unknown>} params @param {string | null} [userId] */
  const rpc = async (name, params, userId = null) => {
    const keys = Object.keys(params)
    const rows = await query(userId, `select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(', ')}) as result`, keys.map((key) => params[key]))
    return rows[0]?.result
  }
  const listingColumns = LISTING_COLUMNS.split(',').join(', ')
  const files = new Map()

  return {
    store: {
      search: (filters) => rpc('marketplace_search', searchParams(filters)),
      listing: (listingId) => rpc('marketplace_listing', { p_listing_id: listingId }),
      seller: (businessId) => rpc('marketplace_seller', { p_business_id: businessId }),
      async report(session, listingId, reason, details) {
        await rpc('report_listing', { p_listing_id: listingId, p_reason: reason, p_details: details }, session?.userId ?? null)
      },
      async getSellerProfile({ userId }, businessId) {
        const rows = await query(userId, `select ${SELLER_COLUMNS.split(',').join(', ')} from public.seller_profiles where business_id = $1`, [businessId])
        return rows[0] ? toSellerProfile(rows[0]) : null
      },
      async saveSellerProfile({ userId }, businessId, input) {
        const [row] = await query(userId, 'select * from public.upsert_seller_profile($1, $2, $3, $4, $5, $6, $7, $8)', [businessId, input.displayName, input.city, input.whatsapp, input.phone, input.deliversEverywhere, input.deliveryCities, input.description])
        return toSellerProfile(row)
      },
      async listOwnListings({ userId }, businessId) {
        return (await query(userId, `select ${listingColumns} from public.listings where business_id = $1 order by updated_at desc`, [businessId])).map(toOwnListing)
      },
      async submitListing({ userId }, businessId, input) {
        const [row] = await query(userId, 'select * from public.submit_listing($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)', [businessId, input.productId, input.title, input.description, input.category, input.subcategory, input.condition, JSON.stringify(input.attributes), input.photos])
        return toOwnListing(row)
      },
      async withdrawListing({ userId }, businessId, listingId) {
        return toOwnListing((await query(userId, 'select * from public.withdraw_listing($1, $2)', [businessId, listingId]))[0])
      },
      async moderate(key, listingId, revision, status, reasons, by) {
        return toOwnListing((await query(null, 'select * from public.moderate_listing($1, $2, $3, $4, $5, $6)', [key, listingId, revision, status, reasons, by]))[0])
      },
      queue: (key, status) => rpc('moderation_queue', { p_key: key, p_status: status }),
      async setSellerVerified(key, businessId, verified) {
        await rpc('set_seller_verified', { p_key: key, p_business_id: businessId, p_verified: verified })
      },
      async listSaved({ userId }) {
        const favorites = await query(userId, 'select listing_id, snapshot, created_at from public.marketplace_favorites order by created_at desc')
        const alerts = await query(userId, 'select id, label, filters, seen_at, notify, created_at from public.marketplace_alerts order by created_at')
        return { favorites: favorites.map(toSavedFavorite), alerts: alerts.map(toSavedAlert) }
      },
      async saveFavorite({ userId }, listingId, snapshot) {
        await rpc('save_marketplace_favorite', { p_listing_id: listingId, p_snapshot: JSON.stringify(snapshot) }, userId)
      },
      async deleteFavorite({ userId }, listingId) {
        await query(userId, 'delete from public.marketplace_favorites where listing_id = $1', [listingId])
      },
      async saveAlert({ userId }, alert) {
        const params = alertParams(alert)
        await rpc('save_marketplace_alert', { ...params, p_filters: JSON.stringify(params.p_filters), p_criteria: JSON.stringify(params.p_criteria) }, userId)
      },
      async deleteAlert({ userId }, alertId) {
        await query(userId, 'delete from public.marketplace_alerts where id = $1', [alertId])
      },
      async savePushSubscription({ userId }, subscription) {
        await rpc('save_push_subscription', { p_endpoint: subscription.endpoint, p_p256dh: subscription.p256dh, p_auth: subscription.auth }, userId)
      },
      async deletePushSubscription({ userId }, endpoint) {
        await query(userId, 'delete from public.push_subscriptions where endpoint = $1', [endpoint])
      },
      alertNotifications: (key, listingId) => rpc('alert_notifications_for_listing', { p_key: key, p_listing_id: listingId }),
      async forgetPushSubscription(key, endpoint) {
        await rpc('forget_push_subscription', { p_key: key, p_endpoint: endpoint })
      },
      pushKeys: (key, keys) => rpc('push_keys', { p_key: key, p_public_key: keys?.publicKey ?? null, p_private_key: keys?.privateKey ?? null }),
    },
    photos: {
      files,
      async put({ userId }, path, photo) {
        // Même règle que Supabase Storage : dossier d’un commerce dont on est propriétaire.
        await query(userId, "insert into storage.objects (bucket_id, name) values ('listing-photos', $1)", [path])
        files.set(path, photo)
      },
      url: (path) => `${photoBaseUrl}/${path}`,
    },
  }
}
