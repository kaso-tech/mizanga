// Favoris, sélection à comparer et alertes de recherche de la marketplace, enregistrés sur l’appareil
// (sans compte). Chaque liste est relue avec des contrôles : une donnée abîmée est ignorée.
import { useSyncExternalStore } from 'react'
import type { SearchFilters } from '../services/marketplaceApi'

/** Ce qu’on garde d’une annonce mise en favori (pour l’afficher même hors connexion ou retirée). */
export interface SavedListing {
  id: string
  title: string
  price: number
  currency: string
  photo: string | null
  city: string
  sellerName: string
  sellerVerified: boolean
  condition: string
  savedAt: string
}

export interface MarketAlert {
  id: string
  label: string
  filters: SearchFilters
  createdAt: string
  /** Dernière consultation : les annonces publiées après sont « nouvelles ». */
  seenAt: string
  checkedAt: string | null
  newCount: number
}

export const MAX_FAVORITES = 100
export const MAX_COMPARE = 3
export const MAX_ALERTS = 10

const KEYS = { favorites: 'gilli.marketplace.favorites', compare: 'gilli.marketplace.compare', alerts: 'gilli.marketplace.alerts' } as const

const isText = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
const isId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,64}$/.test(value)
const isDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const safePhoto = (value: unknown) => (typeof value === 'string' && (value.startsWith('/') || value.startsWith('https://')) ? value : null)

function readSaved(item: unknown): SavedListing | null {
  const raw = item as Partial<SavedListing> | null
  if (!raw || !isId(raw.id) || !isText(raw.title) || typeof raw.price !== 'number' || !Number.isFinite(raw.price)) return null
  return {
    id: raw.id,
    title: raw.title,
    price: raw.price,
    currency: isText(raw.currency, 3) ? raw.currency : 'XOF',
    photo: safePhoto(raw.photo),
    city: isText(raw.city, 60) ? raw.city : '',
    sellerName: isText(raw.sellerName, 120) ? raw.sellerName : '',
    sellerVerified: raw.sellerVerified === true,
    condition: isText(raw.condition, 20) ? raw.condition : 'new',
    savedAt: isDate(raw.savedAt) ? raw.savedAt : new Date(0).toISOString(),
  }
}

const FILTER_TEXT = ['q', 'category', 'subcategory', 'city', 'condition', 'sort', 'verified'] as const
const FILTER_NUMBERS = ['minPrice', 'maxPrice'] as const

/** Filtres d’une alerte, gardés seulement s’ils ont la bonne forme. */
export function readFilters(input: unknown): SearchFilters {
  const raw = (input ?? {}) as Record<string, unknown>
  const filters: SearchFilters = {}
  for (const key of FILTER_TEXT) if (isText(raw[key], 100)) filters[key] = raw[key] as string
  for (const key of FILTER_NUMBERS) if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) filters[key] = raw[key] as number
  if (raw.attributes && typeof raw.attributes === 'object') {
    const attributes = Object.fromEntries(Object.entries(raw.attributes as Record<string, unknown>).filter(([key, value]) => /^[a-z_]{1,40}$/.test(key) && isText(value, 60)))
    if (Object.keys(attributes).length) filters.attributes = attributes as Record<string, string>
  }
  return filters
}

function readAlert(item: unknown): MarketAlert | null {
  const raw = item as Partial<MarketAlert> | null
  if (!raw || !isText(raw.id, 60) || !isText(raw.label) || !isDate(raw.createdAt) || !isDate(raw.seenAt)) return null
  return {
    id: raw.id,
    label: raw.label,
    filters: readFilters(raw.filters),
    createdAt: raw.createdAt,
    seenAt: raw.seenAt,
    checkedAt: isDate(raw.checkedAt) ? raw.checkedAt : null,
    newCount: typeof raw.newCount === 'number' && raw.newCount >= 0 ? Math.floor(raw.newCount) : 0,
  }
}

function readList<T>(key: string, read: (item: unknown) => T | null, max: number): T[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.map(read).filter((item): item is T => item !== null).slice(0, max) : []
  } catch {
    return []
  }
}

/** Petite mémoire partagée par toutes les vues, recopiée sur l’appareil à chaque changement. */
function createList<T>(key: string, read: (item: unknown) => T | null, max: number) {
  let value: T[] | null = null
  const listeners = new Set<() => void>()
  const get = () => (value ??= readList(key, read, max))
  const set = (next: T[]) => {
    value = next.slice(0, max)
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Stockage indisponible (navigation privée) : la liste vaut pour cette visite seulement.
    }
    for (const listener of listeners) listener()
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return
      value = null
      listener()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  }
  return { get, set, subscribe, reset: () => { value = null } }
}

export const favoritesStore = createList(KEYS.favorites, readSaved, MAX_FAVORITES)
export const compareStore = createList(KEYS.compare, readSaved, MAX_COMPARE)
export const alertsStore = createList(KEYS.alerts, readAlert, MAX_ALERTS)

export const useFavorites = () => useSyncExternalStore(favoritesStore.subscribe, favoritesStore.get)
export const useCompare = () => useSyncExternalStore(compareStore.subscribe, compareStore.get)
export const useAlerts = () => useSyncExternalStore(alertsStore.subscribe, alertsStore.get)

/** Ce qui suffit pour enregistrer une annonce (fiche de recherche, page annonce ou fiche de l’assistant). */
export type ListingLike = Omit<SavedListing, 'savedAt'>

export const toSaved = (listing: ListingLike): SavedListing => ({
  id: listing.id, title: listing.title, price: listing.price, currency: listing.currency, photo: listing.photo, city: listing.city,
  sellerName: listing.sellerName, sellerVerified: listing.sellerVerified, condition: listing.condition, savedAt: new Date().toISOString(),
})

/** Ajoute ou retire un favori ; renvoie true s’il est désormais en favori. */
export function toggleFavorite(listing: ListingLike) {
  const current = favoritesStore.get()
  if (current.some((item) => item.id === listing.id)) {
    favoritesStore.set(current.filter((item) => item.id !== listing.id))
    return false
  }
  favoritesStore.set([toSaved(listing), ...current])
  return true
}

/** Ajoute ou retire une annonce de la comparaison (3 au plus) ; « full » si la sélection est déjà pleine. */
export function toggleCompare(listing: ListingLike): 'added' | 'removed' | 'full' {
  const current = compareStore.get()
  if (current.some((item) => item.id === listing.id)) {
    compareStore.set(current.filter((item) => item.id !== listing.id))
    return 'removed'
  }
  if (current.length >= MAX_COMPARE) return 'full'
  compareStore.set([...current, toSaved(listing)])
  return 'added'
}

/** Nom lisible d’une recherche (« Téléphone tecno · Téléphones et accessoires · Ouagadougou · ≤ 50 000 F »). */
export function describeFilters(filters: SearchFilters, categoryLabel?: string) {
  const parts = [
    filters.q,
    categoryLabel,
    filters.city,
    filters.maxPrice !== undefined ? `≤ ${filters.maxPrice.toLocaleString('fr-FR').replace(/\u202f/g, ' ')} F` : undefined,
    filters.minPrice !== undefined ? `≥ ${filters.minPrice.toLocaleString('fr-FR').replace(/\u202f/g, ' ')} F` : undefined,
    filters.verified === '1' ? 'vendeurs vérifiés' : undefined,
  ].filter(Boolean)
  return parts.join(' · ') || 'Toutes les annonces'
}

/** Crée une alerte pour la recherche ; « exists » si la même recherche est déjà suivie, « full » au-delà de 10. */
export function addAlert(filters: SearchFilters, label: string): 'added' | 'exists' | 'full' {
  const clean = readFilters({ ...filters, sort: undefined })
  const current = alertsStore.get()
  if (current.some((alert) => JSON.stringify(alert.filters) === JSON.stringify(clean))) return 'exists'
  if (current.length >= MAX_ALERTS) return 'full'
  const now = new Date().toISOString()
  alertsStore.set([...current, { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, label, filters: clean, createdAt: now, seenAt: now, checkedAt: now, newCount: 0 }])
  return 'added'
}

export const removeAlert = (id: string) => alertsStore.set(alertsStore.get().filter((alert) => alert.id !== id))

/** Alerte consultée : ses annonces ne sont plus « nouvelles ». */
export const markAlertSeen = (id: string) => {
  const now = new Date().toISOString()
  alertsStore.set(alertsStore.get().map((alert) => (alert.id === id ? { ...alert, seenAt: now, checkedAt: now, newCount: 0 } : alert)))
}

/** Une alerte n’est revérifiée qu’au plus toutes les 15 minutes, pour ménager le réseau. */
export const CHECK_INTERVAL_MS = 15 * 60_000

/**
 * Compte les annonces publiées depuis la dernière consultation de chaque alerte (une recherche par
 * alerte due). Une alerte qui échoue (réseau) garde son ancien compte.
 */
export async function checkAlerts(count: (filters: SearchFilters) => Promise<number>, now = Date.now()) {
  const due = alertsStore.get().filter((alert) => !alert.checkedAt || now - Date.parse(alert.checkedAt) >= CHECK_INTERVAL_MS)
  if (due.length === 0) return
  const results = new Map<string, number>()
  for (const alert of due) {
    try {
      results.set(alert.id, await count({ ...alert.filters, publishedAfter: alert.seenAt }))
    } catch {
      // Hors connexion ou serveur indisponible : nouvel essai à la prochaine vérification.
    }
  }
  if (results.size === 0) return
  const checkedAt = new Date(now).toISOString()
  alertsStore.set(alertsStore.get().map((alert) => (results.has(alert.id) ? { ...alert, newCount: results.get(alert.id) as number, checkedAt } : alert)))
}

/** Recherche d’une alerte, prête à être relancée (les plus récentes d’abord). */
export const alertFilters = (alert: MarketAlert): SearchFilters => ({ ...alert.filters, sort: 'recent' })
