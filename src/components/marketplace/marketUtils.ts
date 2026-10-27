// Outils communs aux pages de la marketplace : icônes des catégories, ville, recherches récentes et
// affichage retenus sur l’appareil, mise en page selon la largeur de l’écran.
import {
  Baby, BookOpen, BriefcaseBusiness, Car, Dumbbell, Hammer, HeartPulse, Laptop, Package, Refrigerator, Shirt, ShoppingBasket,
  Smartphone, Sofa, Sparkles, Sprout, Sun, Tv, Watch, type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ListingLike } from '../../app/marketSaved'
import type { ListingCard, ListingDetail, SearchFilters } from '../../services/marketplaceApi'

export type Notify = (message: string, tone?: 'success' | 'info') => void

export const SORTS: Record<string, string> = { relevance: 'Pertinence', price_asc: 'Prix croissant', price_desc: 'Prix décroissant', recent: 'Plus récentes' }

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  telephones: Smartphone, informatique: Laptop, 'tv-audio-photo': Tv, electromenager: Refrigerator, 'energie-solaire': Sun,
  'mode-femme': Shirt, 'mode-homme': Shirt, 'enfants-bebes': Baby, beaute: Sparkles, 'sante-bien-etre': HeartPulse,
  alimentation: ShoppingBasket, 'agriculture-elevage': Sprout, maison: Sofa, 'btp-quincaillerie': Hammer, 'auto-moto': Car,
  'sport-loisirs': Dumbbell, 'bureau-ecole': BookOpen, 'bijoux-montres': Watch, 'equipement-pro': BriefcaseBusiness, autres: Package,
}

/** Nom court d’une catégorie pour les tuiles (« Téléphones et accessoires » → « Téléphones »). */
export const shortLabel = (label: string) => label.replace(/ et .*$| \(.*\)$|, .*$/u, '')

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string | null) => {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Stockage indisponible (navigation privée) : rien n’est retenu.
  }
}

const CITY_KEY = 'gilli.marketplace.city'
export const readCity = () => read(CITY_KEY) ?? ''
export const saveCity = (city: string) => write(CITY_KEY, city || null)

const RECENT_KEY = 'gilli.marketplace.recent'
/** Recherches récentes (6 au plus, la plus récente d’abord). */
export function readRecentSearches(): string[] {
  try {
    const parsed: unknown = JSON.parse(read(RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.length <= 100).slice(0, 6) : []
  } catch {
    return []
  }
}
export function rememberSearch(query: string) {
  const clean = query.trim()
  if (!clean) return
  write(RECENT_KEY, JSON.stringify([clean, ...readRecentSearches().filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 6)))
}
export const forgetSearches = () => write(RECENT_KEY, null)

const VIEW_KEY = 'gilli.marketplace.view'
export type ViewMode = 'grid' | 'list'
export const readViewMode = (): ViewMode => (read(VIEW_KEY) === 'list' ? 'list' : 'grid')
export const saveViewMode = (mode: ViewMode) => write(VIEW_KEY, mode)

/** Une recherche avec des critères affiche des résultats ; sans critère, la vitrine de la marketplace. */
export const hasCriteria = (filters: SearchFilters) => Boolean(
  filters.q || filters.category || filters.subcategory || filters.condition || filters.verified || filters.sort
  || filters.minPrice !== undefined || filters.maxPrice !== undefined || Object.keys(filters.attributes ?? {}).length,
)

/** Écran large (ordinateur, tablette en paysage) : les filtres restent affichés à côté des résultats. */
export function useWideLayout() {
  const query = '(min-width: 960px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const update = () => setWide(media.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  return wide
}

export const cardToSaved = (item: ListingCard): ListingLike => ({ id: item.id, title: item.title, price: item.price, currency: item.currency, photo: item.photo, city: item.city, sellerName: item.sellerName, sellerVerified: item.sellerVerified, condition: item.condition })
export const detailToSaved = (item: ListingDetail): ListingLike => ({ id: item.id, title: item.title, price: item.price, currency: item.currency, photo: item.photos[0] ?? null, city: item.seller.city, sellerName: item.seller.name, sellerVerified: item.seller.verified, condition: item.condition })


/**
 * Partage d’une page de la marketplace : menu de partage du téléphone, sinon lien copié. Renvoie
 * « copied » quand le lien a été copié, « shared » ou « cancelled » sinon ; lève une erreur si rien n’est possible.
 */
export async function sharePage({ title, text, path }: { title: string; text: string; path: string }): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = `${window.location.origin}${path}`
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, text, url })
      return 'shared'
    }
    await navigator.clipboard.writeText(`${text} ${url}`)
    return 'copied'
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') return 'cancelled'
    throw error
  }
}
