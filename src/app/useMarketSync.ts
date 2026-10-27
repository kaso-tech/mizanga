import { useEffect } from 'react'
import type { RemoteAlert, RemoteFavorite, SavedApi } from '../services/savedApi'
import { alertsStore, favoritesStore, isUuid, MAX_ALERTS, MAX_FAVORITES, newId, readFilters, type MarketAlert, type SavedListing } from './marketSaved'
import { reattachPush } from './pushNotifications'

const filtersKey = (alert: Pick<MarketAlert, 'filters'>) => JSON.stringify(readFilters({ ...alert.filters, sort: undefined }))
const later = (a: string, b: string) => (Date.parse(a) >= Date.parse(b) ? a : b)

/** Favori du compte → fiche de l’appareil (null si la fiche enregistrée est abîmée). */
function fromRemoteFavorite(favorite: RemoteFavorite): SavedListing | null {
  const snapshot = favorite.snapshot as Partial<SavedListing>
  if (typeof snapshot.title !== 'string' || typeof snapshot.price !== 'number') return null
  return {
    id: favorite.listingId,
    title: snapshot.title,
    price: snapshot.price,
    currency: typeof snapshot.currency === 'string' ? snapshot.currency : 'XOF',
    photo: typeof snapshot.photo === 'string' && (snapshot.photo.startsWith('/') || snapshot.photo.startsWith('https://')) ? snapshot.photo : null,
    city: typeof snapshot.city === 'string' ? snapshot.city : '',
    sellerName: typeof snapshot.sellerName === 'string' ? snapshot.sellerName : '',
    sellerVerified: snapshot.sellerVerified === true,
    condition: typeof snapshot.condition === 'string' ? snapshot.condition : 'new',
    savedAt: typeof snapshot.savedAt === 'string' ? snapshot.savedAt : favorite.createdAt,
  }
}

const fromRemoteAlert = (alert: RemoteAlert): MarketAlert => ({
  id: alert.id, label: alert.label, filters: readFilters(alert.filters), createdAt: alert.createdAt, seenAt: alert.seenAt, checkedAt: null, newCount: 0, notify: alert.notify,
})

/**
 * Réunit les favoris et les alertes de l’appareil et ceux du compte, à la connexion : rien n’est perdu
 * (union), une même recherche n’est suivie qu’une fois, et la consultation la plus récente l’emporte.
 * Renvoie aussi ce que le compte doit recevoir.
 */
export function mergeSaved(local: { favorites: SavedListing[]; alerts: MarketAlert[] }, remote: { favorites: RemoteFavorite[]; alerts: RemoteAlert[] }) {
  const remoteFavorites = remote.favorites.map(fromRemoteFavorite).filter((item): item is SavedListing => item !== null)
  const remoteIds = new Set(remoteFavorites.map((item) => item.id))
  const favorites = [...local.favorites, ...remoteFavorites.filter((item) => !local.favorites.some((known) => known.id === item.id))].slice(0, MAX_FAVORITES)
  const uploadFavorites = favorites.filter((item) => !remoteIds.has(item.id))

  const alerts: MarketAlert[] = remote.alerts.map(fromRemoteAlert)
  const uploadAlerts: MarketAlert[] = []
  for (const mine of local.alerts) {
    const index = alerts.findIndex((alert) => alert.id === mine.id || filtersKey(alert) === filtersKey(mine))
    if (index >= 0) {
      const theirs = alerts[index]
      const merged = { ...theirs, seenAt: later(mine.seenAt, theirs.seenAt), checkedAt: mine.checkedAt, newCount: mine.newCount }
      alerts[index] = merged
      if (merged.seenAt !== theirs.seenAt) uploadAlerts.push(merged)
    } else if (alerts.length < MAX_ALERTS) {
      const added = isUuid(mine.id) ? mine : { ...mine, id: newId() }
      alerts.push(added)
      uploadAlerts.push(added)
    }
  }
  return { favorites, alerts, uploadFavorites, uploadAlerts }
}

const alertKey = (alert: MarketAlert) => JSON.stringify([alert.label, alert.filters, alert.seenAt, alert.notify])

/**
 * Favoris et alertes sur le compte : réunis à la connexion, puis chaque ajout, suppression ou
 * consultation d’alerte est envoyé. Déconnecté, ils restent sur l’appareil.
 */
export function useMarketSync(api: SavedApi | null, userId: string | null) {
  useEffect(() => {
    if (!api || !userId) return
    let cancelled = false
    /** État du compte tel que connu (identifiant → empreinte) ; null avant la première réunion. */
    let synced: { favorites: Set<string>; alerts: Map<string, string> } | null = null
    let busy = false
    let dirty = false
    let timer: number | undefined

    const push = async () => {
      if (!synced || cancelled) return
      if (busy) {
        dirty = true
        return
      }
      busy = true
      try {
        const favorites = favoritesStore.get()
        for (const item of favorites) {
          if (synced.favorites.has(item.id)) continue
          await api.saveFavorite(item.id, item).catch((error: { status?: number }) => {
            // Annonce supprimée de la marketplace : le favori reste sur l’appareil seulement.
            if (error.status !== 404) throw error
          })
          synced.favorites.add(item.id)
        }
        for (const id of [...synced.favorites]) {
          if (favorites.some((item) => item.id === id)) continue
          await api.deleteFavorite(id)
          synced.favorites.delete(id)
        }
        const alerts = alertsStore.get()
        for (const alert of alerts) {
          if (synced.alerts.get(alert.id) === alertKey(alert)) continue
          if (!isUuid(alert.id)) continue
          await api.saveAlert(alert)
          synced.alerts.set(alert.id, alertKey(alert))
        }
        for (const id of [...synced.alerts.keys()]) {
          if (alerts.some((alert) => alert.id === id)) continue
          await api.deleteAlert(id)
          synced.alerts.delete(id)
        }
      } catch {
        // Hors connexion ou serveur indisponible : nouvel essai à la prochaine modification ou au retour du réseau.
      } finally {
        busy = false
        if (dirty) {
          dirty = false
          void push()
        }
      }
    }
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void push(), 600)
    }

    void (async () => {
      try {
        const remote = await api.list()
        if (cancelled) return
        const merged = mergeSaved({ favorites: favoritesStore.get(), alerts: alertsStore.get() }, remote)
        favoritesStore.set(merged.favorites)
        alertsStore.set(merged.alerts)
        const uploadedFavorites = new Set(merged.uploadFavorites.map((item) => item.id))
        const uploadedAlerts = new Set(merged.uploadAlerts.map((alert) => alert.id))
        synced = {
          favorites: new Set(merged.favorites.filter((item) => !uploadedFavorites.has(item.id)).map((item) => item.id)),
          alerts: new Map(merged.alerts.filter((alert) => !uploadedAlerts.has(alert.id)).map((alert) => [alert.id, alertKey(alert)])),
        }
        await push()
        await reattachPush(api)
      } catch {
        // Compte injoignable : les favoris et alertes restent sur l’appareil ; nouvel essai à la prochaine connexion.
      }
    })()

    const unsubscribeFavorites = favoritesStore.subscribe(schedule)
    const unsubscribeAlerts = alertsStore.subscribe(schedule)
    window.addEventListener('online', schedule)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      unsubscribeFavorites()
      unsubscribeAlerts()
      window.removeEventListener('online', schedule)
    }
  }, [api, userId])
}
