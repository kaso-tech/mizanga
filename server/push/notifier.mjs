// Notifications du téléphone (Web Push) pour les alertes de recherche : quand une annonce est publiée,
// la base donne les alertes qu’elle satisfait (une seule fois par annonce) et les appareils abonnés ;
// le serveur leur envoie une notification chiffrée (protocole Web Push, clés VAPID).
//
// Clés VAPID : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY si elles sont définies ; sinon le serveur en génère
// une paire à la première utilisation et la garde dans la base (schéma privé, clé de modération requise).
import webpush from 'web-push'

const DAY_SECONDS = 86_400

/** « 48 000 F CFA » (espaces ordinaires, pour toutes les notifications). @param {number} amount @param {string} currency */
const price = (amount, currency) => new Intl.NumberFormat('fr', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount).replace(/[\u202f\u00a0]/g, ' ')

/**
 * @param {{
 *   store: import('../marketplace/store.mjs').MarketplaceStore,
 *   moderationKey: string,
 *   vapid?: { publicKey?: string, privateKey?: string, subject?: string },
 *   send?: (subscription: { endpoint: string, keys: { p256dh: string, auth: string } }, payload: string, options: object) => Promise<unknown>,
 *   generateKeys?: () => { publicKey: string, privateKey: string },
 * }} deps
 */
export function createPushNotifier({ store, moderationKey, vapid = {}, send = webpush.sendNotification, generateKeys = webpush.generateVAPIDKeys }) {
  const subject = vapid.subject || 'https://gilli.manus.space'
  /** @type {Promise<{ publicKey: string, privateKey: string } | null> | null} */
  let keysPromise = null
  const loadKeys = async () => {
    if (vapid.publicKey && vapid.privateKey) return { publicKey: vapid.publicKey, privateKey: vapid.privateKey }
    const stored = await store.pushKeys(moderationKey)
    if (stored) return stored
    // Première utilisation : la base garde la première paire enregistrée (plusieurs serveurs possibles).
    return store.pushKeys(moderationKey, generateKeys())
  }
  const keys = () => {
    keysPromise ??= loadKeys().catch((error) => {
      keysPromise = null
      throw error
    })
    return keysPromise
  }

  return {
    /** Clé publique à donner au navigateur pour s’abonner ; null si indisponible. */
    async publicKey() {
      try {
        return (await keys())?.publicKey ?? null
      } catch (error) {
        console.warn('[gilli] Notifications indisponibles :', /** @type {Error} */ (error).message)
        return null
      }
    },

    /**
     * Notifie les alertes satisfaites par une annonce qui vient d’être publiée ; renvoie le nombre de
     * notifications envoyées. Un appareil qui n’existe plus (404, 410) est oublié.
     * @param {string} listingId
     */
    async notifyListing(listingId) {
      const vapidKeys = await keys()
      if (!vapidKeys) return 0
      const { listing, alerts } = await store.alertNotifications(moderationKey, listingId)
      if (!listing) return 0
      let sent = 0
      for (const alert of alerts) {
        const payload = JSON.stringify({
          title: `Nouvelle annonce : ${alert.label}`.slice(0, 120),
          body: `${listing.title} — ${price(listing.price, listing.currency)} à ${listing.city}`.slice(0, 200),
          url: `/marketplace/annonce/${listing.id}`,
          tag: `alerte-${alert.alertId}`,
        })
        for (const subscription of alert.subscriptions ?? []) {
          try {
            await send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
              vapidDetails: { subject, publicKey: vapidKeys.publicKey, privateKey: vapidKeys.privateKey },
              TTL: DAY_SECONDS,
              urgency: 'normal',
              timeout: 10_000,
            })
            sent += 1
          } catch (error) {
            const status = /** @type {{ statusCode?: number }} */ (error).statusCode
            if (status === 404 || status === 410) await store.forgetPushSubscription(moderationKey, subscription.endpoint).catch(() => undefined)
            else console.warn('[gilli] Notification non envoyée :', status ?? /** @type {Error} */ (error).message)
          }
        }
      }
      return sent
    },
  }
}
