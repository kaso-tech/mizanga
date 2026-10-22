// Accès aux données Business pour les tests : mêmes requêtes que l’API REST de Supabase, exécutées sur
// PGlite avec l’identité de l’utilisateur (rôle authenticated), donc avec les règles RLS et les fonctions
// contrôlées réelles.
import { MOVEMENT_COLUMNS, PRODUCT_COLUMNS, toBusiness, toBusinessError, toExpense, toMovement, toProduct, toAiQuota, toProductSales, toSale, toSummary } from '../../server/business/supabase-store.mjs'
import { BusinessError } from '../../server/business/validate.mjs'
import { asUser } from './database.mjs'

/**
 * @param {import('@electric-sql/pglite').PGlite} db
 * @returns {import('../../server/business/supabase-store.mjs').BusinessStore}
 */
export function createPgliteBusinessStore(db) {
  /** @param {string} userId @param {string} sql @param {unknown[]} params */
  const query = async (userId, sql, params = []) => {
    try {
      return /** @type {any[]} */ ((await asUser(db, userId, () => db.query(sql, params))).rows)
    } catch (error) {
      throw toBusinessError(400, /** @type {{ code?: string, message?: string }} */ (error))
    }
  }
  const productColumns = PRODUCT_COLUMNS.split(',').join(', ')
  const movementColumns = MOVEMENT_COLUMNS.split(',').join(', ')

  return {
    async listBusinesses({ userId }) {
      const rows = await query(userId, 'select m.role, b.id, b.name, b.currency, b.country_code, b.timezone from public.business_members m join public.businesses b on b.id = m.business_id where m.user_id = $1 order by b.created_at', [userId])
      return rows.map((row) => toBusiness(row, row.role))
    },
    async createBusiness({ userId }, input) {
      const [row] = await query(userId, 'insert into public.businesses (name, currency, country_code) values ($1, $2, $3) returning id, name, currency, country_code, timezone', [input.name, input.currency, input.countryCode])
      return toBusiness(row, 'owner')
    },
    async listProducts({ userId }, businessId, { includeArchived }) {
      const rows = await query(userId, `select ${productColumns} from public.products where business_id = $1 ${includeArchived ? '' : 'and not archived'} order by name`, [businessId])
      return rows.map(toProduct)
    },
    async createProduct({ userId }, businessId, input) {
      const [row] = await query(userId, `select ${productColumns} from public.create_product($1, $2, $3, $4, $5, $6, $7, $8)`, [businessId, input.name, input.unit, input.purchasePrice, input.salePrice, input.alertThreshold, input.initialQuantity, input.sku])
      return toProduct(row)
    },
    async updateProduct({ userId }, businessId, productId, changes) {
      const columns = Object.keys(changes)
      const assignments = columns.map((column, index) => `${column} = $${index + 3}`).join(', ')
      const rows = await query(userId, `update public.products set ${assignments} where id = $1 and business_id = $2 returning ${productColumns}`, [productId, businessId, ...columns.map((column) => changes[column])])
      if (!rows.length) throw new BusinessError(404, 'Produit introuvable.')
      return toProduct(rows[0])
    },
    async listMovements({ userId }, businessId, productId) {
      const rows = await query(userId, `select ${movementColumns} from public.stock_movements where business_id = $1 and product_id = $2 order by created_at desc limit 100`, [businessId, productId])
      return rows.map(toMovement)
    },
    async recordMovement({ userId }, businessId, productId, input) {
      const [row] = await query(userId, `select ${movementColumns} from public.record_stock_movement($1, $2, $3, $4, $5, $6)`, [businessId, productId, input.kind, input.quantity, input.unitCost, input.note])
      return toMovement(row)
    },
    async listSales({ userId }, businessId, period) {
      return (await query(userId, 'select public.list_sales($1, $2, $3) as result', [businessId, period.start, period.end]))[0].result
    },
    async recordSale({ userId }, businessId, input) {
      return toSale((await query(userId, 'select * from public.record_sale($1, $2::jsonb, $3, $4)', [businessId, JSON.stringify(input.items), input.customerName, input.note]))[0])
    },
    async cancelSale({ userId }, businessId, saleId, reason) {
      return toSale((await query(userId, 'select * from public.cancel_sale($1, $2, $3)', [businessId, saleId, reason]))[0])
    },
    async listExpenses({ userId }, businessId, period) {
      return (await query(userId, 'select public.list_expenses($1, $2, $3) as result', [businessId, period.start, period.end]))[0].result
    },
    async recordExpense({ userId }, businessId, input) {
      return toExpense((await query(userId, 'select * from public.record_expense($1, $2, $3, $4, $5)', [businessId, input.amount, input.category, input.description, input.spentOn]))[0])
    },
    async deleteExpense({ userId }, businessId, expenseId) {
      const rows = await query(userId, 'delete from public.expenses where id = $1 and business_id = $2 returning id', [expenseId, businessId])
      if (!rows.length) throw new BusinessError(403, 'Seul le propriétaire peut supprimer une dépense.')
    },
    async summary({ userId }, businessId, period) {
      const params = [businessId, period.start, period.end]
      const [summaryRow] = await query(userId, 'select * from public.business_summary($1, $2, $3)', params)
      const productRows = await query(userId, 'select * from public.business_product_sales($1, $2, $3)', params)
      return { summary: toSummary(summaryRow), products: productRows.map(toProductSales) }
    },
    async subscription({ userId }, businessId) {
      return (await query(userId, 'select public.business_subscription($1) as result', [businessId]))[0].result
    },
    async aiQuota({ userId }, businessId) {
      return toAiQuota((await query(userId, 'select * from public.ai_quota($1)', [businessId]))[0])
    },
    async beginAiRequest({ userId }, businessId) {
      return String((await query(userId, 'select public.begin_ai_request($1) as id', [businessId]))[0].id)
    },
    async finishAiRequest({ userId }, requestId, result) {
      await query(userId, 'select public.finish_ai_request($1, $2, $3, $4, $5, $6, $7)', [requestId, result.status, result.provider, result.model, result.inputTokens, result.outputTokens, result.costMicroUsd])
    },
  }
}
