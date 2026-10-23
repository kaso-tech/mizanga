// Accès aux données Business dans Supabase (API REST PostgREST), toujours avec le jeton de l’utilisateur :
// les règles RLS et les fonctions contrôlées de la base s’appliquent comme s’il interrogeait lui-même.
import { BusinessError } from './validate.mjs'
import { toConversationSummary, toStoredConversation } from '../conversations/routes.mjs'

export const CONVERSATION_COLUMNS = 'id,kind,business_id,title,favorite,created_at,updated_at'

/** Colonnes absentes (titre, favori) : gardées telles quelles par la base. @param {import('../conversations/routes.mjs').ConversationInput} conversation */
export const toConversationRow = (conversation) => ({
  id: conversation.id,
  kind: conversation.kind,
  business_id: conversation.businessId,
  title: conversation.title,
  favorite: conversation.favorite,
  messages: conversation.messages,
  created_at: conversation.createdAt,
  updated_at: conversation.updatedAt,
})

/**
 * @typedef {{ token: string, userId: string }} BusinessSession
 * @typedef {{ id: string, name: string, currency: string, countryCode: string, timezone: string, role: 'owner' | 'staff' }} Business
 * @typedef {{ id: string, name: string, unit: string, sku: string | null, quantity: number, purchasePrice: number, salePrice: number, alertThreshold: number, archived: boolean, updatedAt: string }} Product
 * @typedef {{ id: string, kind: string, quantityDelta: number, unitCost: number | null, note: string | null, createdAt: string, createdBy: string }} StockMovement
 *
 * @typedef {object} BusinessStore
 * @property {(session: BusinessSession) => Promise<Business[]>} listBusinesses
 * @property {(session: BusinessSession, input: { name: string, currency: string, countryCode: string }) => Promise<Business>} createBusiness
 * @property {(session: BusinessSession, businessId: string, options: { includeArchived: boolean }) => Promise<Product[]>} listProducts
 * @property {(session: BusinessSession, businessId: string, input: ReturnType<typeof import('./validate.mjs').validateProductInput>) => Promise<Product>} createProduct
 * @property {(session: BusinessSession, businessId: string, productId: string, changes: Record<string, unknown>) => Promise<Product>} updateProduct
 * @property {(session: BusinessSession, businessId: string, productId: string) => Promise<StockMovement[]>} listMovements
 * @property {(session: BusinessSession, businessId: string, productId: string, input: ReturnType<typeof import('./validate.mjs').validateMovementInput>) => Promise<StockMovement>} recordMovement
 * @property {(session: BusinessSession, businessId: string, period: Period) => Promise<unknown[]>} listSales
 * @property {(session: BusinessSession, businessId: string, input: ReturnType<typeof import('./validate.mjs').validateSaleInput>) => Promise<Sale>} recordSale
 * @property {(session: BusinessSession, businessId: string, saleId: string, reason: string | null) => Promise<Sale>} cancelSale
 * @property {(session: BusinessSession, businessId: string, period: Period) => Promise<unknown[]>} listExpenses
 * @property {(session: BusinessSession, businessId: string, input: ReturnType<typeof import('./validate.mjs').validateExpenseInput>) => Promise<Expense>} recordExpense
 * @property {(session: BusinessSession, businessId: string, expenseId: string) => Promise<void>} deleteExpense
 * @property {(session: BusinessSession, businessId: string, period: Period) => Promise<{ summary: Summary, products: ProductSales[] }>} summary
 * @property {(session: BusinessSession, businessId: string) => Promise<AiQuota>} aiQuota
 * @property {(session: BusinessSession, businessId: string) => Promise<Subscription>} subscription
 * @property {(session: BusinessSession, businessId: string) => Promise<string>} beginAiRequest Réserve une question (erreur 429 au-delà de la limite du jour).
 * @property {(session: BusinessSession, requestId: string, result: AiRequestResult) => Promise<void>} finishAiRequest
 * @property {(session: BusinessSession) => Promise<import('../conversations/routes.mjs').ConversationSummary[]>} listConversations
 * @property {(session: BusinessSession, id: string) => Promise<import('../conversations/routes.mjs').StoredConversation | null>} getConversation
 * @property {(session: BusinessSession, conversation: import('../conversations/routes.mjs').ConversationInput) => Promise<import('../conversations/routes.mjs').ConversationSummary>} saveConversation
 * @property {(session: BusinessSession, id: string, changes: { title?: string | null, favorite?: boolean }) => Promise<import('../conversations/routes.mjs').ConversationSummary | null>} updateConversation
 * @property {(session: BusinessSession, id: string) => Promise<void>} deleteConversation
 *
 * @typedef {{ start: string, end: string }} Period
 * @typedef {{ id: string, soldAt: string, status: string, totalAmount: number, totalCost: number, customerName: string | null, note: string | null }} Sale
 * @typedef {{ id: string, amount: number, category: string, description: string | null, spentAt: string, createdBy: string }} Expense
 * @typedef {{ revenue: number, costOfGoodsSold: number, grossMargin: number, expenses: number, estimatedResult: number, salesCount: number, cancelledSalesCount: number }} Summary
 * @typedef {{ productId: string, productName: string, unit: string, quantity: number, revenue: number, cost: number, grossMargin: number }} ProductSales
 * @typedef {{ used: number, limit: number, resetsAt: string }} AiQuota
 * @typedef {{ planId: string, planName: string, isTest: boolean, status: string, monthlyPrice: number, currency: string, dailyAiRequests: number, maxBusinesses: number, currentPeriodEnd: string | null, aiUsedToday: number }} Subscription
 * @typedef {{ status: 'completed' | 'failed', provider: string, model: string, inputTokens: number, outputTokens: number, costMicroUsd: number }} AiRequestResult
 */

/** @param {any} row @returns {AiQuota} */
export const toAiQuota = (row) => ({ used: Number(row.used), limit: Number(row.daily_limit), resetsAt: new Date(row.resets_at).toISOString() })

/** @param {any} row @returns {Sale} */
export const toSale = (row) => ({
  id: row.id,
  soldAt: new Date(row.sold_at).toISOString(),
  status: row.status,
  totalAmount: Number(row.total_amount),
  totalCost: Number(row.total_cost),
  customerName: row.customer_name ?? null,
  note: row.note ?? null,
})

/** @param {any} row @returns {Expense} */
export const toExpense = (row) => ({
  id: row.id,
  amount: Number(row.amount),
  category: row.category,
  description: row.description ?? null,
  spentAt: new Date(row.spent_at).toISOString(),
  createdBy: row.created_by,
})

/** @param {any} row @returns {Summary} */
export const toSummary = (row) => ({
  revenue: Number(row.revenue),
  costOfGoodsSold: Number(row.cost_of_goods_sold),
  grossMargin: Number(row.gross_margin),
  expenses: Number(row.expenses),
  estimatedResult: Number(row.estimated_result),
  salesCount: Number(row.sales_count),
  cancelledSalesCount: Number(row.cancelled_sales_count),
})

/** @param {any} row @returns {ProductSales} */
export const toProductSales = (row) => ({
  productId: row.product_id,
  productName: row.product_name,
  unit: row.unit,
  quantity: Number(row.quantity),
  revenue: Number(row.revenue),
  cost: Number(row.cost),
  grossMargin: Number(row.gross_margin),
})

export const PRODUCT_COLUMNS = 'id,name,unit,sku,quantity,purchase_price,sale_price,alert_threshold,archived,updated_at'
export const MOVEMENT_COLUMNS = 'id,kind,quantity_delta,unit_cost,note,created_at,created_by'

/** @param {any} row @returns {Product} */
export const toProduct = (row) => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  sku: row.sku ?? null,
  quantity: Number(row.quantity),
  purchasePrice: Number(row.purchase_price),
  salePrice: Number(row.sale_price),
  alertThreshold: Number(row.alert_threshold),
  archived: row.archived === true,
  updatedAt: new Date(row.updated_at).toISOString(),
})

/** @param {any} row @returns {StockMovement} */
export const toMovement = (row) => ({
  id: row.id,
  kind: row.kind,
  quantityDelta: Number(row.quantity_delta),
  unitCost: row.unit_cost === null || row.unit_cost === undefined ? null : Number(row.unit_cost),
  note: row.note ?? null,
  createdAt: new Date(row.created_at).toISOString(),
  createdBy: row.created_by,
})

/** @param {any} row @param {'owner' | 'staff'} role @returns {Business} */
export const toBusiness = (row, role) => ({ id: row.id, name: row.name, currency: row.currency, countryCode: row.country_code, timezone: row.timezone, role })

/**
 * Traduit une erreur de la base (codes GL… des fonctions contrôlées, droits refusés, contrôles) en erreur
 * présentable. Le message des fonctions contrôlées est écrit en français pour l’utilisateur.
 * @param {number} httpStatus @param {{ code?: string, message?: string } | null} body
 */
export function toBusinessError(httpStatus, body) {
  const code = body?.code ?? ''
  const message = body?.message ?? ''
  if (code === 'GL403') return new BusinessError(403, message || 'Accès refusé.')
  if (code === 'GL409' || code === 'GL410') return new BusinessError(409, message)
  if (code === 'GL422') return new BusinessError(422, message)
  if (code === 'GL429') return new BusinessError(429, message)
  if (code === '42501' || httpStatus === 403) return new BusinessError(403, 'Accès refusé.')
  if (code === '23514' || code === '23502' || code === '22P02') return new BusinessError(422, 'Une des valeurs saisies est invalide.')
  if (code === 'PGRST301' || code === 'PGRST303' || httpStatus === 401) return new BusinessError(401, 'Votre session a expiré : reconnectez-vous.')
  return new BusinessError(502, 'La base de données est momentanément indisponible. Réessayez.')
}

/**
 * @param {{ supabaseUrl: string, publishableKey: string }} config
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {BusinessStore}
 */
export function createSupabaseBusinessStore({ supabaseUrl, publishableKey }, { fetchImpl = fetch } = {}) {
  /** @param {BusinessSession} session @param {string} method @param {string} path @param {unknown} [body] @param {boolean | string} [representation] */
  const request = async (session, method, path, body, representation = false) => {
    let response
    try {
      response = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
          ...(representation ? { Prefer: typeof representation === 'string' ? `return=representation,${representation}` : 'return=representation' } : {}),
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

  return {
    async listBusinesses(session) {
      const rows = await request(session, 'GET', `business_members?select=role,business:businesses(id,name,currency,country_code,timezone)&user_id=eq.${id(session.userId)}`)
      return rows.filter((/** @type {any} */ row) => row.business).map((/** @type {any} */ row) => toBusiness(row.business, row.role))
    },
    async createBusiness(session, input) {
      const [row] = await request(session, 'POST', 'businesses?select=id,name,currency,country_code,timezone', { name: input.name, currency: input.currency, country_code: input.countryCode }, true)
      return toBusiness(row, 'owner')
    },
    async listProducts(session, businessId, { includeArchived }) {
      const rows = await request(session, 'GET', `products?select=${PRODUCT_COLUMNS}&business_id=eq.${id(businessId)}${includeArchived ? '' : '&archived=eq.false'}&order=name.asc`)
      return rows.map(toProduct)
    },
    async createProduct(session, businessId, input) {
      const row = await request(session, 'POST', 'rpc/create_product', {
        p_business_id: businessId,
        p_name: input.name,
        p_unit: input.unit,
        p_purchase_price: input.purchasePrice,
        p_sale_price: input.salePrice,
        p_alert_threshold: input.alertThreshold,
        p_initial_quantity: input.initialQuantity,
        p_sku: input.sku,
      })
      return toProduct(row)
    },
    async updateProduct(session, businessId, productId, changes) {
      const rows = await request(session, 'PATCH', `products?select=${PRODUCT_COLUMNS}&id=eq.${id(productId)}&business_id=eq.${id(businessId)}`, changes, true)
      if (!rows?.length) throw new BusinessError(404, 'Produit introuvable.')
      return toProduct(rows[0])
    },
    async listMovements(session, businessId, productId) {
      const rows = await request(session, 'GET', `stock_movements?select=${MOVEMENT_COLUMNS}&business_id=eq.${id(businessId)}&product_id=eq.${id(productId)}&order=created_at.desc&limit=100`)
      return rows.map(toMovement)
    },
    async recordMovement(session, businessId, productId, input) {
      const row = await request(session, 'POST', 'rpc/record_stock_movement', {
        p_business_id: businessId,
        p_product_id: productId,
        p_kind: input.kind,
        p_quantity: input.quantity,
        p_unit_cost: input.unitCost,
        p_note: input.note,
      })
      return toMovement(row)
    },
    async listSales(session, businessId, period) {
      return request(session, 'POST', 'rpc/list_sales', { p_business_id: businessId, p_start: period.start, p_end: period.end })
    },
    async recordSale(session, businessId, input) {
      return toSale(await request(session, 'POST', 'rpc/record_sale', { p_business_id: businessId, p_items: input.items, p_customer_name: input.customerName, p_note: input.note }))
    },
    async cancelSale(session, businessId, saleId, reason) {
      return toSale(await request(session, 'POST', 'rpc/cancel_sale', { p_business_id: businessId, p_sale_id: saleId, p_reason: reason }))
    },
    async listExpenses(session, businessId, period) {
      return request(session, 'POST', 'rpc/list_expenses', { p_business_id: businessId, p_start: period.start, p_end: period.end })
    },
    async recordExpense(session, businessId, input) {
      return toExpense(await request(session, 'POST', 'rpc/record_expense', { p_business_id: businessId, p_amount: input.amount, p_category: input.category, p_description: input.description, p_spent_on: input.spentOn }))
    },
    async deleteExpense(session, businessId, expenseId) {
      // La règle RLS réserve la suppression au propriétaire : rien de supprimé signifie refus (ou absence).
      const rows = await request(session, 'DELETE', `expenses?select=id&id=eq.${id(expenseId)}&business_id=eq.${id(businessId)}`, undefined, true)
      if (!rows?.length) throw new BusinessError(403, 'Seul le propriétaire peut supprimer une dépense.')
    },
    async summary(session, businessId, period) {
      const params = { p_business_id: businessId, p_start: period.start, p_end: period.end }
      const [summaryRows, productRows] = await Promise.all([
        request(session, 'POST', 'rpc/business_summary', params),
        request(session, 'POST', 'rpc/business_product_sales', params),
      ])
      return { summary: toSummary(summaryRows[0]), products: productRows.map(toProductSales) }
    },
    async subscription(session, businessId) {
      return request(session, 'POST', 'rpc/business_subscription', { p_business_id: businessId })
    },
    async aiQuota(session, businessId) {
      return toAiQuota((await request(session, 'POST', 'rpc/ai_quota', { p_business_id: businessId }))[0])
    },
    async beginAiRequest(session, businessId) {
      return String(await request(session, 'POST', 'rpc/begin_ai_request', { p_business_id: businessId }))
    },
    async finishAiRequest(session, requestId, result) {
      await request(session, 'POST', 'rpc/finish_ai_request', {
        p_id: Number(requestId),
        p_status: result.status,
        p_provider: result.provider,
        p_model: result.model,
        p_input_tokens: result.inputTokens,
        p_output_tokens: result.outputTokens,
        p_estimated_cost_micro_usd: result.costMicroUsd,
      })
    },
    async listConversations(session) {
      const rows = await request(session, 'GET', `conversations?select=${CONVERSATION_COLUMNS}&user_id=eq.${id(session.userId)}&order=updated_at.desc&limit=500`)
      return rows.map(toConversationSummary)
    },
    async getConversation(session, conversationId) {
      const rows = await request(session, 'GET', `conversations?select=${CONVERSATION_COLUMNS},messages&user_id=eq.${id(session.userId)}&id=eq.${id(conversationId)}`)
      return rows?.length ? toStoredConversation(rows[0]) : null
    },
    async saveConversation(session, conversation) {
      const [row] = await request(session, 'POST', `conversations?on_conflict=user_id,id&select=${CONVERSATION_COLUMNS}`, { user_id: session.userId, ...toConversationRow(conversation) }, 'resolution=merge-duplicates')
      return toConversationSummary(row)
    },
    async updateConversation(session, conversationId, changes) {
      const rows = await request(session, 'PATCH', `conversations?select=${CONVERSATION_COLUMNS}&user_id=eq.${id(session.userId)}&id=eq.${id(conversationId)}`, changes, true)
      return rows?.length ? toConversationSummary(rows[0]) : null
    },
    async deleteConversation(session, conversationId) {
      await request(session, 'DELETE', `conversations?user_id=eq.${id(session.userId)}&id=eq.${id(conversationId)}`)
    },
  }
}
