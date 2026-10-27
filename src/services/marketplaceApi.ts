// Marketplace : lecture publique (sans compte) et administration de la modération (console protégée).
// Les adresses du vendeur (vitrine, annonces) sont dans businessApi.ts, avec le jeton de connexion.

export interface MarketAttribute {
  key: string
  label: string
  /** Pour la comparaison : la valeur la plus haute (ou la plus basse) est la meilleure. */
  better?: 'higher' | 'lower'
  type: 'text' | 'number' | 'select' | 'boolean'
  unit?: string
  options?: string[]
  max?: number
}

export interface MarketCategory {
  id: string
  label: string
  subcategories: Array<{ id: string; label: string }>
  attributes?: MarketAttribute[]
}

export interface MarketCatalog {
  categories: MarketCategory[]
  conditions: Record<string, string>
  reportReasons: string[]
}

export interface ListingCard {
  id: string
  title: string
  category: string
  subcategory: string | null
  condition: string
  attributes: Record<string, string | number | boolean>
  photo: string | null
  price: number
  currency: string
  unit: string
  city: string
  sellerId: string
  sellerName: string
  sellerVerified: boolean
  /** Note du vendeur (avis publiés) et nombre d’avis. */
  sellerRating?: number | null
  sellerReviews?: number
  sameCity: boolean
  deliversToCity: boolean
  publishedAt: string
}

export interface SellerStats {
  rating: number | null
  reviewCount: number
  memberSince: string
  activeListings: number
}

export interface SellerReview {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  updatedAt: string
}

/** Avis du compte connecté sur un vendeur. */
export interface MyReview {
  id: string
  rating: number
  comment: string | null
  status: 'pending' | 'published' | 'review' | 'hidden'
  revision: number
  updatedAt: string
}

export interface ReviewModerationItem {
  id: string
  revision: number
  rating: number
  comment: string | null
  status: string
  reasons: string[]
  updatedAt: string
  businessId: string
  sellerName: string
}

export interface PublicSeller {
  id: string
  name: string
  city: string
  whatsapp: string | null
  phone: string | null
  verified: boolean
  deliversEverywhere: boolean
  deliveryCities: string[]
  description: string | null
  stats?: SellerStats
}

export interface ListingDetail extends Omit<ListingCard, 'photo' | 'city' | 'sellerId' | 'sellerName' | 'sellerVerified' | 'sameCity' | 'deliversToCity'> {
  description: string
  photos: string[]
  inStock: boolean
  seller: PublicSeller
}

export interface SearchFilters {
  q?: string
  category?: string
  subcategory?: string
  city?: string
  minPrice?: number
  maxPrice?: number
  condition?: string
  /** relevance (par défaut), price_asc, price_desc ou recent. */
  sort?: string
  /** '1' : vendeurs vérifiés seulement. */
  verified?: string
  /** Caractéristiques de la catégorie (nombre = minimum, '1' = oui, ou valeur). */
  attributes?: Record<string, string>
  /** Annonces publiées après cette date (alertes). */
  publishedAfter?: string
  page?: number
}

const SEARCH_KEYS = ['q', 'category', 'subcategory', 'city', 'minPrice', 'maxPrice', 'condition', 'sort', 'verified', 'publishedAfter', 'page'] as const

/** Paramètres d’adresse d’une recherche, toujours dans le même ordre (les caractéristiques deviennent « a_clé »). */
export function searchQuery(filters: SearchFilters) {
  const params = new URLSearchParams()
  for (const key of SEARCH_KEYS) {
    const value = filters[key]
    if (value !== undefined && value !== '' && value !== null) params.set(key, String(value))
  }
  for (const [key, value] of Object.entries(filters.attributes ?? {})) if (value) params.set(`a_${key}`, value)
  return params
}

export interface ModerationItem {
  id: string
  revision: number
  status: string
  title: string
  description: string
  category: string
  subcategory: string | null
  condition: string
  attributes: Record<string, unknown>
  photos: string[]
  reasons: string[]
  moderatedBy: string | null
  updatedAt: string
  price: number
  currency: string
  businessId: string
  businessName: string
  seller: { name: string; city: string; whatsapp: string | null; phone: string | null; verified: boolean } | null
  reports: Array<{ reason: string; details: string | null; createdAt: string }>
}

/** Paiement déclaré par un commerçant, vu par la console. */
export interface AdminPayment {
  id: string
  kind: 'pro' | 'sponsor'
  months: number | null
  offerId: string | null
  days: number | null
  amount: number
  currency: string
  method: 'orange_money' | 'moov_money'
  payerPhone: string
  reference: string
  status: 'pending' | 'confirmed' | 'rejected'
  adminNote: string | null
  createdAt: string
  decidedAt: string | null
  businessId: string
  businessName: string
  listingTitle: string | null
}

export interface Pricing {
  plans: Array<{ id: 'test' | 'pro'; name: string; monthlyPrice: number; currency: string; dailyAiRequests: number; maxBusinesses: number; maxListings: number; maxPhotos: number }>
  offers: Array<{ id: string; days: number; price: number; currency: string; active: boolean }>
  settings: { accountName: string; orangeMoney: string | null; moovMoney: string | null; instructions: string }
}

export const reportLabels: Record<string, string> = {
  forbidden: 'Produit interdit',
  scam: 'Arnaque ou fraude',
  counterfeit: 'Contrefaçon',
  wrong_info: 'Informations fausses',
  other: 'Autre raison',
}

/** Erreur dont le message peut être montré tel quel. */
export class MarketplaceError extends Error {
  constructor(readonly userMessage: string, readonly status: number) {
    super(userMessage)
    this.name = 'MarketplaceError'
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new MarketplaceError(navigator.onLine ? 'Le serveur de Gilli est injoignable. Réessayez.' : 'Vous êtes hors connexion.', 0)
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok || !data) throw new MarketplaceError(data?.error ?? 'Une erreur est survenue. Réessayez.', response.status)
  return data
}

const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

let catalogPromise: Promise<MarketCatalog> | null = null

export const marketplaceApi = {
  /** Catégories (gardées en mémoire après le premier chargement). */
  catalog: () => {
    catalogPromise ??= call<MarketCatalog>('/api/marketplace/categories').catch((error: unknown) => {
      catalogPromise = null
      throw error
    })
    return catalogPromise
  },
  search: (filters: SearchFilters) => {
    const params = searchQuery(filters)
    return call<{ total: number; items: ListingCard[]; sponsored?: ListingCard[] }>(`/api/marketplace/search?${params}`)
  },
  listing: async (id: string) => (await call<{ listing: ListingDetail }>(`/api/marketplace/listings/${id}`)).listing,
  seller: (id: string) => call<{ seller: PublicSeller; listings: ListingCard[]; reviews?: SellerReview[] }>(`/api/marketplace/sellers/${id}`),
  report: async (id: string, reason: string, details: string, token?: string | null) => {
    await call(`/api/marketplace/listings/${id}/report`, json('POST', { reason, details }, token ? { Authorization: `Bearer ${token}` } : {}))
  },
  /** Console d’administration (cookie de session administrateur). */
  moderationQueue: async (status: string) => (await call<{ listings: ModerationItem[] }>(`/api/admin/moderation?status=${status}`, { credentials: 'same-origin' })).listings,
  decide: async (id: string, revision: number, status: 'published' | 'rejected' | 'hidden' | 'review', reason?: string) => {
    await call(`/api/admin/moderation/${id}`, { ...json('POST', { revision, status, reason }), credentials: 'same-origin' })
  },
  reviewQueue: async (status: string) => (await call<{ reviews: ReviewModerationItem[] }>(`/api/admin/reviews?status=${status}`, { credentials: 'same-origin' })).reviews,
  decideReview: async (id: string, revision: number, status: 'published' | 'hidden' | 'review') => {
    await call(`/api/admin/reviews/${id}`, { ...json('POST', { revision, status }), credentials: 'same-origin' })
  },
  paymentQueue: async (status: string) => (await call<{ payments: AdminPayment[] }>(`/api/admin/payments?status=${status}`, { credentials: 'same-origin' })).payments,
  decidePayment: async (id: string, status: 'confirmed' | 'rejected', note?: string) => {
    await call(`/api/admin/payments/${id}`, { ...json('POST', { status, note }), credentials: 'same-origin' })
  },
  pricing: async () => (await call<{ pricing: Pricing }>('/api/admin/pricing', { credentials: 'same-origin' })).pricing,
  savePricing: async (pricing: Pricing) => (await call<{ pricing: Pricing }>('/api/admin/pricing', { ...json('PUT', pricing), credentials: 'same-origin' })).pricing,
  setSellerVerified: async (businessId: string, verified: boolean) => {
    await call(`/api/admin/sellers/${businessId}/verified`, { ...json('POST', { verified }), credentials: 'same-origin' })
  },
}

/** « 4,5 » (note sur 5). */
export const formatRating = (rating: number) => rating.toLocaleString('fr', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** « oct. 2026 ». */
export const formatMonth = (date: string) => new Date(date).toLocaleDateString('fr', { month: 'short', year: 'numeric' })

/** « 48 000 F CFA ». */
export const formatPrice = (amount: number, currency = 'XOF') => new Intl.NumberFormat('fr', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)

/** Lien WhatsApp avec un message prêt, qui dit au vendeur d’où vient le client. */
export function whatsappLink(phone: string, listing: { title: string; price: number; currency: string }) {
  const text = `Bonjour, je suis intéressé(e) par « ${listing.title} » à ${formatPrice(listing.price, listing.currency)}, vu sur Gilli.`
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

/** Affichage lisible d’un numéro international (« +226 70 12 34 56 »). */
export function formatPhone(digits: string) {
  const match = /^(22[0-9]|24[0-9])(\d+)$/.exec(digits)
  if (!match) return `+${digits}`
  return `+${match[1]} ${match[2].replace(/(\d{2})(?=\d)/g, '$1 ')}`
}
