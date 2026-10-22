// Adresses /api/business/* : l’identité est vérifiée auprès de Supabase, les données sont contrôlées,
// puis la base est interrogée avec le jeton de l’utilisateur (règles RLS appliquées).
import { BusinessError, isUuid, validateBusinessInput, validateCancelInput, validateExpenseInput, validateMovementInput, validatePeriod, validateProductChanges, validateProductInput, validateSaleInput } from './validate.mjs'

/**
 * @typedef {(req: import('node:http').IncomingMessage) => Promise<unknown>} ReadJson
 * @typedef {(res: import('node:http').ServerResponse, status: number, body: unknown) => void} SendJson
 */

/**
 * @param {{
 *   store: import('./supabase-store.mjs').BusinessStore,
 *   verify: (token: string) => Promise<import('../auth/supabase-auth.mjs').AuthUser | null>,
 *   bearerToken: (req: import('node:http').IncomingMessage) => string,
 *   readJson: ReadJson,
 *   sendJson: SendJson,
 *   assistant?: ReturnType<typeof import('./assistant.mjs').createAssistant> | null,
 * }} deps
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, path: string) => Promise<void>}
 */
export function createBusinessRoutes({ store, verify, bearerToken, readJson, sendJson, assistant = null }) {
  return async (req, res, path) => {
    try {
      const token = bearerToken(req)
      const user = await verify(token).catch(() => {
        throw new BusinessError(503, 'Supabase est injoignable.')
      })
      if (!user) throw new BusinessError(401, 'Connexion requise.')
      const session = { token, userId: user.id }
      const segments = path.split('/').slice(2) // ['business', entreprise, 'products', produit, 'movements']
      const [, businessId, collection, productId, sub] = segments
      if (businessId !== undefined && !isUuid(businessId)) throw new BusinessError(404, 'Entreprise introuvable.')
      if (productId !== undefined && !isUuid(productId)) throw new BusinessError(404, 'Élément introuvable.')
      const method = req.method ?? 'GET'
      const period = () => validatePeriod(new URL(req.url ?? '/', 'http://localhost').searchParams)

      if (segments.length === 1) {
        if (method === 'GET') return sendJson(res, 200, { businesses: await store.listBusinesses(session) })
        if (method === 'POST') return sendJson(res, 201, { business: await store.createBusiness(session, validateBusinessInput(await readJson(req))) })
      }
      if (collection === 'products' && segments.length === 3) {
        if (method === 'GET') {
          const includeArchived = new URL(req.url ?? '/', 'http://localhost').searchParams.get('archived') === '1'
          return sendJson(res, 200, { products: await store.listProducts(session, businessId, { includeArchived }) })
        }
        if (method === 'POST') return sendJson(res, 201, { product: await store.createProduct(session, businessId, validateProductInput(await readJson(req))) })
      }
      if (collection === 'products' && segments.length === 4 && method === 'PATCH') {
        return sendJson(res, 200, { product: await store.updateProduct(session, businessId, productId, validateProductChanges(await readJson(req))) })
      }
      if (collection === 'products' && segments.length === 5 && sub === 'movements') {
        if (method === 'GET') return sendJson(res, 200, { movements: await store.listMovements(session, businessId, productId) })
        if (method === 'POST') return sendJson(res, 201, { movement: await store.recordMovement(session, businessId, productId, validateMovementInput(await readJson(req))) })
      }
      // Ventes, dépenses et résultats (étape 4) ; productId désigne ici la vente ou la dépense.
      if (collection === 'sales' && segments.length === 3) {
        if (method === 'GET') return sendJson(res, 200, { sales: await store.listSales(session, businessId, period()) })
        if (method === 'POST') return sendJson(res, 201, { sale: await store.recordSale(session, businessId, validateSaleInput(await readJson(req))) })
      }
      if (collection === 'sales' && segments.length === 5 && sub === 'cancel' && method === 'POST') {
        const { reason } = validateCancelInput(await readJson(req))
        return sendJson(res, 200, { sale: await store.cancelSale(session, businessId, productId, reason) })
      }
      if (collection === 'expenses' && segments.length === 3) {
        if (method === 'GET') return sendJson(res, 200, { expenses: await store.listExpenses(session, businessId, period()) })
        if (method === 'POST') return sendJson(res, 201, { expense: await store.recordExpense(session, businessId, validateExpenseInput(await readJson(req))) })
      }
      if (collection === 'expenses' && segments.length === 4 && method === 'DELETE') {
        await store.deleteExpense(session, businessId, productId)
        return sendJson(res, 200, { deleted: true })
      }
      if (collection === 'summary' && segments.length === 3 && method === 'GET') {
        return sendJson(res, 200, await store.summary(session, businessId, period()))
      }
      // Assistant Business (étape 5) : consommation du jour, puis questions (réponse diffusée en NDJSON).
      if (collection === 'assistant' && assistant) {
        if (segments.length === 3 && method === 'GET') return sendJson(res, 200, { quota: await assistant.quota(session, businessId) })
        if (segments.length === 3 && method === 'POST') return await assistant.answer(req, res, session, businessId, await readJson(req))
      }
      throw new BusinessError(404, 'Introuvable.')
    } catch (error) {
      if (error instanceof BusinessError) return sendJson(res, error.status, { error: error.message })
      const { status, message } = /** @type {{ status?: number, message?: string }} */ (error)
      if (status === 400 || status === 413) return sendJson(res, status, { error: message ?? 'Requête invalide.' })
      console.error('[gilli] Erreur Business :', error)
      return sendJson(res, 500, { error: 'Erreur inattendue. Réessayez.' })
    }
  }
}
