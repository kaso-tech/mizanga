// Appels à l’espace Business du serveur de Gilli, avec le jeton de connexion de l’utilisateur.

export interface Business {
  id: string
  name: string
  currency: string
  countryCode: string
  timezone: string
  role: 'owner' | 'staff'
}

export interface Product {
  id: string
  name: string
  unit: string
  sku: string | null
  quantity: number
  purchasePrice: number
  salePrice: number
  alertThreshold: number
  archived: boolean
  updatedAt: string
}

export type MovementKind = 'initial' | 'purchase' | 'return' | 'loss' | 'adjustment' | 'sale' | 'sale_cancelled'

export interface StockMovement {
  id: string
  kind: MovementKind
  quantityDelta: number
  unitCost: number | null
  note: string | null
  createdAt: string
  createdBy: string
}

export interface ProductInput {
  name: string
  unit: string
  sku?: string | null
  purchasePrice: number
  salePrice: number
  alertThreshold: number
  initialQuantity?: number
}

export interface MovementInput {
  kind: 'purchase' | 'return' | 'loss' | 'adjustment'
  quantity: number
  unitCost?: number | null
  note?: string | null
}

export interface SaleItem {
  productId: string
  productName: string
  unit: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface Sale {
  id: string
  soldAt: string
  status: 'completed' | 'cancelled'
  totalAmount: number
  totalCost: number
  customerName: string | null
  note: string | null
  items?: SaleItem[]
}

export interface SaleInput {
  items: Array<{ productId: string; quantity: number; unitPrice?: number }>
  customerName?: string | null
  note?: string | null
}

export interface Expense {
  id: string
  amount: number
  category: string
  description: string | null
  spentAt: string
  createdBy: string
}

export interface ExpenseInput {
  amount: number
  category: string
  description?: string | null
  spentOn?: string | null
}

export interface Summary {
  revenue: number
  costOfGoodsSold: number
  grossMargin: number
  expenses: number
  estimatedResult: number
  salesCount: number
  cancelledSalesCount: number
}

export interface ProductSales {
  productId: string
  productName: string
  unit: string
  quantity: number
  revenue: number
  cost: number
  grossMargin: number
}

/** Période de jours du calendrier local du commerce, bornes incluses (AAAA-MM-JJ). */
export interface Period {
  start: string
  end: string
}

/** Vitrine du commerce sur la marketplace. */
export interface SellerProfile {
  businessId: string
  displayName: string
  city: string
  whatsapp: string | null
  phone: string | null
  deliversEverywhere: boolean
  deliveryCities: string[]
  description: string | null
  verified: boolean
}

export type ListingStatus = 'pending' | 'published' | 'review' | 'rejected' | 'hidden' | 'withdrawn'

/** Annonce d’un produit du commerce (vue du vendeur). */
export interface OwnListing {
  id: string
  productId: string
  title: string
  description: string
  category: string
  subcategory: string | null
  condition: string
  attributes: Record<string, string | number | boolean>
  photos: Array<{ path: string; url: string }>
  status: ListingStatus
  revision: number
  reasons: string[]
  moderatedBy: string | null
  updatedAt: string
}

export interface ListingSubmission {
  productId: string
  title: string
  description: string
  category: string
  subcategory: string | null
  condition: string
  attributes: Record<string, string | number | boolean>
  keepPhotos: string[]
  newPhotos: Array<{ mimeType: string; data: string }>
}

/** Formule du commerce ; en mode test, aucun paiement n’est demandé. */
export interface Subscription {
  planId: string
  planName: string
  isTest: boolean
  status: 'test' | 'active' | 'past_due' | 'cancelled'
  monthlyPrice: number
  currency: string
  dailyAiRequests: number
  maxBusinesses: number
  currentPeriodEnd: string | null
  aiUsedToday: number
}

export interface AiQuota {
  used: number
  limit: number
  resetsAt: string
}

/** Chiffres transmis à l’assistant Business (calculés par la base), montrés à l’utilisateur pour vérification. */
export interface AssistantContext {
  business: { name: string; currency: string; today: string }
  periods: Array<{ key: string; label: string; start: string; end: string; summary: Summary }>
  productSales: Array<{ name: string; unit: string; quantity: number; revenue: number; grossMargin: number }>
  expensesByCategory: Array<{ category: string; amount: number }>
  stock: { productCount: number; value: number; listed: number; products: Array<{ name: string; unit: string; quantity: number; salePrice: number; purchasePrice: number; alertThreshold: number; level: string }> }
}

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
  /** Photos (seulement sur le dernier message de l’utilisateur). */
  attachments?: Array<{ name: string; mimeType: string; data: string }>
}

/** Fiche préparée par l’assistant ; rien n’est enregistré avant la confirmation de l’utilisateur. */
export type AssistantProposal =
  | { id: string; action: 'create_product'; values: { name: string; unit: string | null; purchasePrice: number | null; salePrice: number | null; initialQuantity: number | null; alertThreshold: number | null } }
  | { id: string; action: 'stock_movement'; values: { productId: string | null; productName: string; kind: 'purchase' | 'return' | 'loss' | 'count'; quantity: number | null; unitCost: number | null; note: string | null } }
  | { id: string; action: 'sale'; values: { items: Array<{ productId: string | null; productName: string; quantity: number | null; unitPrice: number | null }>; customerName: string | null; note: string | null } }
  | { id: string; action: 'expense'; values: { amount: number | null; category: string; description: string | null; spentOn: string | null } }
  | { id: string; action: 'cancel_sale'; values: { saleId: string | null; reference: string; sale: { soldAt: string; totalAmount: number; status: string; items: Array<{ productName: string; quantity: number; unit: string }> } | null; reason: string | null } }

/** Événements diffusés par un assistant de l’Espace Business (chiffres reçus, texte, fiches, fin). */
export type AssistantStreamEvent<Context, Proposal> =
  | { context: Context; quota: AiQuota }
  | { text: string }
  | { proposals: Proposal[] }
  | { done: true; quota: AiQuota }

export type AssistantEvent = AssistantStreamEvent<AssistantContext, AssistantProposal>

/** Erreur dont le message peut être montré tel quel à l’utilisateur. */
export class BusinessApiError extends Error {
  constructor(readonly userMessage: string, readonly status: number) {
    super(userMessage)
    this.name = 'BusinessApiError'
  }
}

export type BusinessApi = ReturnType<typeof createBusinessApi>

/** @param getToken renvoie le jeton de connexion courant (renouvelé par Supabase si besoin). */
export function createBusinessApi(getToken: () => Promise<string | null>) {
  const send = async (method: string, path: string, body?: unknown, signal?: AbortSignal) => {
    const token = await getToken()
    if (!token) throw new BusinessApiError('Connectez-vous pour utiliser l’espace Business.', 401)
    try {
      return await fetch(`/api/business${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new BusinessApiError(navigator.onLine ? 'Le serveur de Gilli est injoignable. Réessayez.' : 'Vous êtes hors connexion. L’espace Business demande le réseau.', 0)
    }
  }
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await send(method, path, body)
    const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
    if (!response.ok || !data) throw new BusinessApiError(data?.error ?? 'Une erreur est survenue. Réessayez.', response.status)
    return data
  }
  /** Question à l’assistant ; la réponse NDJSON arrive par fragments. */
  const stream = async <Event extends object>(path: string, messages: AssistantMessage[], onEvent: (event: Event) => void, signal?: AbortSignal) => {
    const response = await send('POST', path, { messages }, signal)
    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      throw new BusinessApiError(data?.error ?? 'L’assistant n’a pas pu répondre. Réessayez.', response.status)
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    let finished = false
    const handle = (line: string) => {
      if (!line.trim()) return
      const event = JSON.parse(line) as Event | { error: string }
      if ('error' in event) throw new BusinessApiError(event.error, 502)
      if ('done' in event) finished = true
      onEvent(event)
    }
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(handle)
    }
    handle(buffer)
    if (!finished) throw new BusinessApiError('La réponse a été interrompue. Réessayez.', 502)
  }

  return {
    listBusinesses: async () => (await request<{ businesses: Business[] }>('GET', '')).businesses,
    createBusiness: async (input: { name: string; currency?: string; countryCode?: string }) => (await request<{ business: Business }>('POST', '', input)).business,
    listProducts: async (businessId: string, includeArchived = false) => (await request<{ products: Product[] }>('GET', `/${businessId}/products${includeArchived ? '?archived=1' : ''}`)).products,
    createProduct: async (businessId: string, input: ProductInput) => (await request<{ product: Product }>('POST', `/${businessId}/products`, input)).product,
    updateProduct: async (businessId: string, productId: string, changes: Partial<Omit<ProductInput, 'initialQuantity'>> & { archived?: boolean }) => (
      (await request<{ product: Product }>('PATCH', `/${businessId}/products/${productId}`, changes)).product
    ),
    listMovements: async (businessId: string, productId: string) => (await request<{ movements: StockMovement[] }>('GET', `/${businessId}/products/${productId}/movements`)).movements,
    recordMovement: async (businessId: string, productId: string, input: MovementInput) => (
      (await request<{ movement: StockMovement }>('POST', `/${businessId}/products/${productId}/movements`, input)).movement
    ),
    listSales: async (businessId: string, period: Period) => (await request<{ sales: Sale[] }>('GET', `/${businessId}/sales?from=${period.start}&to=${period.end}`)).sales,
    recordSale: async (businessId: string, input: SaleInput) => (await request<{ sale: Sale }>('POST', `/${businessId}/sales`, input)).sale,
    cancelSale: async (businessId: string, saleId: string, reason?: string) => (await request<{ sale: Sale }>('POST', `/${businessId}/sales/${saleId}/cancel`, { reason: reason ?? null })).sale,
    listExpenses: async (businessId: string, period: Period) => (await request<{ expenses: Expense[] }>('GET', `/${businessId}/expenses?from=${period.start}&to=${period.end}`)).expenses,
    recordExpense: async (businessId: string, input: ExpenseInput) => (await request<{ expense: Expense }>('POST', `/${businessId}/expenses`, input)).expense,
    deleteExpense: async (businessId: string, expenseId: string) => { await request<{ deleted: boolean }>('DELETE', `/${businessId}/expenses/${expenseId}`) },
    summary: async (businessId: string, period: Period) => request<{ summary: Summary; products: ProductSales[] }>('GET', `/${businessId}/summary?from=${period.start}&to=${period.end}`),
    sellerProfile: async (businessId: string) => (await request<{ profile: SellerProfile | null }>('GET', `/${businessId}/seller`)).profile,
    saveSellerProfile: async (businessId: string, input: Omit<SellerProfile, 'businessId' | 'verified'>) => (await request<{ profile: SellerProfile }>('PUT', `/${businessId}/seller`, input)).profile,
    listListings: async (businessId: string) => (await request<{ listings: OwnListing[] }>('GET', `/${businessId}/listings`)).listings,
    submitListing: async (businessId: string, input: ListingSubmission) => request<{ listing: OwnListing; moderation: 'done' | 'unavailable' }>('POST', `/${businessId}/listings`, input),
    withdrawListing: async (businessId: string, listingId: string) => (await request<{ listing: OwnListing }>('POST', `/${businessId}/listings/${listingId}/withdraw`)).listing,
    subscription: async (businessId: string) => (await request<{ subscription: Subscription }>('GET', `/${businessId}/subscription`)).subscription,
    assistantQuota: async (businessId: string) => (await request<{ quota: AiQuota }>('GET', `/${businessId}/assistant`)).quota,
    /** Pose une question à l’assistant ; la réponse arrive par fragments (`onEvent`). */
    askAssistant: (businessId: string, messages: AssistantMessage[], onEvent: (event: AssistantEvent) => void, signal?: AbortSignal) => (
      stream(`/${businessId}/assistant`, messages, onEvent, signal)
    ),
  }
}
