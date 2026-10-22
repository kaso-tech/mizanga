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
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const token = await getToken()
    if (!token) throw new BusinessApiError('Connectez-vous pour utiliser l’espace Business.', 401)
    let response: Response
    try {
      response = await fetch(`/api/business${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new BusinessApiError(navigator.onLine ? 'Le serveur de Gilli est injoignable. Réessayez.' : 'Vous êtes hors connexion. L’espace Business demande le réseau.', 0)
    }
    const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
    if (!response.ok || !data) throw new BusinessApiError(data?.error ?? 'Une erreur est survenue. Réessayez.', response.status)
    return data
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
  }
}
