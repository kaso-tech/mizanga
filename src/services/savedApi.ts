// Favoris, alertes de recherche et notifications du téléphone enregistrés sur le compte.
import type { SearchFilters } from './marketplaceApi'
import { BusinessApiError } from './businessApi'

export interface RemoteFavorite {
  listingId: string
  snapshot: Record<string, unknown>
  createdAt: string
}

export interface RemoteAlert {
  id: string
  label: string
  filters: SearchFilters
  seenAt: string
  notify: boolean
  createdAt: string
}

export type SavedApi = ReturnType<typeof createSavedApi>

/** @param getToken renvoie le jeton de connexion courant (renouvelé par Supabase si besoin). */
export function createSavedApi(getToken: () => Promise<string | null>) {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const token = await getToken()
    if (!token) throw new BusinessApiError('Connectez-vous pour enregistrer vos favoris et vos alertes.', 401)
    let response: Response
    try {
      response = await fetch(path, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new BusinessApiError('Le serveur de Gilli est injoignable.', 0)
    }
    const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
    if (!response.ok || !data) throw new BusinessApiError(data?.error ?? 'Une erreur est survenue. Réessayez.', response.status)
    return data
  }
  return {
    list: () => request<{ favorites: RemoteFavorite[]; alerts: RemoteAlert[] }>('GET', '/api/saved'),
    saveFavorite: (listingId: string, snapshot: object) => request('PUT', `/api/saved/favorites/${encodeURIComponent(listingId)}`, snapshot),
    deleteFavorite: (listingId: string) => request('DELETE', `/api/saved/favorites/${encodeURIComponent(listingId)}`),
    saveAlert: (alert: { id: string; label: string; filters: SearchFilters; seenAt: string; notify: boolean }) => request('PUT', `/api/saved/alerts/${encodeURIComponent(alert.id)}`, { label: alert.label, filters: alert.filters, seenAt: alert.seenAt, notify: alert.notify }),
    deleteAlert: (id: string) => request('DELETE', `/api/saved/alerts/${encodeURIComponent(id)}`),
    subscribePush: (subscription: PushSubscriptionJSON) => request('POST', '/api/push/subscriptions', subscription),
    unsubscribePush: (endpoint: string) => request('DELETE', '/api/push/subscriptions', { endpoint }),
  }
}

/** Clé publique des notifications du serveur (sans compte) ; null si les notifications ne sont pas configurées. */
export async function fetchPushKey(): Promise<string | null> {
  try {
    const response = await fetch('/api/push/key')
    const data = (await response.json().catch(() => null)) as { publicKey?: string | null } | null
    return response.ok ? data?.publicKey ?? null : null
  } catch {
    return null
  }
}
