// Adresses /api/conversations : conversations enregistrées sur le compte (chatbot généraliste et assistants
// de l’Espace Business). L’identité est vérifiée auprès de Supabase, puis la base est interrogée avec le
// jeton de l’utilisateur : chacun ne lit et ne modifie que les siennes (règles RLS).
import { BusinessError, isUuid } from '../business/validate.mjs'

export const CONVERSATION_KINDS = ['general', 'commerce']
const MAX_MESSAGES = 500
const MAX_STORED_BYTES = 2_000_000
const ID_PATTERN = /^[A-Za-z0-9-]{8,80}$/

/**
 * @typedef {{ id: string, kind: string, businessId: string | null, title: string | null, favorite: boolean, createdAt: string, updatedAt: string }} ConversationSummary
 * @typedef {ConversationSummary & { messages: unknown[] }} StoredConversation
 * @typedef {Omit<StoredConversation, 'title' | 'favorite'> & { title?: string | null, favorite?: boolean }} ConversationInput
 *   Titre et favori absents : ceux déjà enregistrés sont gardés (renommage depuis un autre écran).
 */

/** @param {unknown} value */
const isDate = (value) => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value))

/** Retire le contenu des fichiers joints (seuls le nom, le type et la taille sont gardés). @param {unknown} message */
function withoutFileContents(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null
  const copy = /** @type {Record<string, unknown>} */ ({ ...message })
  if (Array.isArray(copy.attachments)) {
    copy.attachments = copy.attachments.map((attachment) => {
      if (!attachment || typeof attachment !== 'object') return attachment
      const rest = /** @type {Record<string, unknown>} */ ({ ...attachment })
      delete rest.data
      return rest
    })
  }
  return copy
}

/** @param {unknown} title */
const readTitle = (title) => {
  if (title === null) return null
  if (typeof title !== 'string') throw new BusinessError(422, 'Titre invalide.')
  return title.trim().slice(0, 120) || null
}

/** Renommage et favori. @param {unknown} body @returns {{ title?: string | null, favorite?: boolean }} */
export function validateConversationChanges(body) {
  const input = /** @type {Record<string, unknown> | null} */ (body && typeof body === 'object' ? body : null)
  if (!input) throw new BusinessError(400, 'Requête invalide.')
  /** @type {{ title?: string | null, favorite?: boolean }} */
  const changes = {}
  if (input.title !== undefined) changes.title = readTitle(input.title)
  if (input.favorite !== undefined) {
    if (typeof input.favorite !== 'boolean') throw new BusinessError(422, 'Favori invalide.')
    changes.favorite = input.favorite
  }
  if (Object.keys(changes).length === 0) throw new BusinessError(422, 'Aucune modification.')
  return changes
}

/** @param {string} id @param {unknown} body @returns {ConversationInput} */
export function validateConversation(id, body) {
  if (!ID_PATTERN.test(id)) throw new BusinessError(404, 'Conversation introuvable.')
  const input = /** @type {Record<string, unknown> | null} */ (body && typeof body === 'object' ? body : null)
  if (!input) throw new BusinessError(400, 'Requête invalide.')
  const kind = input.kind === undefined ? 'general' : input.kind
  if (typeof kind !== 'string' || !CONVERSATION_KINDS.includes(kind)) throw new BusinessError(422, 'Type de conversation inconnu.')
  const businessId = input.businessId ?? null
  if (kind === 'general' ? businessId !== null : typeof businessId !== 'string' || !isUuid(businessId)) throw new BusinessError(422, 'Commerce de la conversation invalide.')
  if (!Array.isArray(input.messages) || input.messages.length > MAX_MESSAGES) throw new BusinessError(422, 'Messages invalides.')
  const messages = input.messages.map(withoutFileContents)
  if (messages.some((message) => message === null)) throw new BusinessError(422, 'Messages invalides.')
  if (Buffer.byteLength(JSON.stringify(messages)) > MAX_STORED_BYTES) throw new BusinessError(413, 'Conversation trop longue pour être enregistrée.')
  if (!isDate(input.createdAt) || !isDate(input.updatedAt)) throw new BusinessError(422, 'Dates invalides.')
  return {
    id,
    kind,
    businessId: /** @type {string | null} */ (businessId),
    ...(input.title === undefined ? {} : { title: readTitle(input.title) }),
    ...(input.favorite === undefined ? {} : { favorite: input.favorite === true }),
    messages,
    createdAt: new Date(/** @type {string} */ (input.createdAt)).toISOString(),
    updatedAt: new Date(/** @type {string} */ (input.updatedAt)).toISOString(),
  }
}

/** @param {any} row @returns {ConversationSummary} */
export const toConversationSummary = (row) => ({
  id: row.id,
  kind: row.kind,
  businessId: row.business_id ?? null,
  title: row.title ?? null,
  favorite: row.favorite === true,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
})

/** @param {any} row @returns {StoredConversation} */
export const toStoredConversation = (row) => ({ ...toConversationSummary(row), messages: Array.isArray(row.messages) ? row.messages : [] })

/**
 * @param {{
 *   store: import('../business/supabase-store.mjs').BusinessStore,
 *   verify: (token: string) => Promise<import('../auth/supabase-auth.mjs').AuthUser | null>,
 *   bearerToken: (req: import('node:http').IncomingMessage) => string,
 *   readJson: import('../business/routes.mjs').ReadJson,
 *   sendJson: import('../business/routes.mjs').SendJson,
 * }} deps
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, path: string) => Promise<void>}
 */
export function createConversationRoutes({ store, verify, bearerToken, readJson, sendJson }) {
  return async (req, res, path) => {
    try {
      const token = bearerToken(req)
      const user = await verify(token).catch(() => {
        throw new BusinessError(503, 'Supabase est injoignable.')
      })
      if (!user) throw new BusinessError(401, 'Connexion requise.')
      const session = { token, userId: user.id }
      const [, , id] = path.split('/').slice(1) // ['api', 'conversations', id]
      const method = req.method ?? 'GET'
      if (id === undefined) {
        if (method === 'GET') return sendJson(res, 200, { conversations: await store.listConversations(session) })
        throw new BusinessError(405, 'Méthode non autorisée.')
      }
      if (!ID_PATTERN.test(id)) throw new BusinessError(404, 'Conversation introuvable.')
      if (method === 'GET') {
        const conversation = await store.getConversation(session, id)
        if (!conversation) throw new BusinessError(404, 'Conversation introuvable.')
        return sendJson(res, 200, { conversation })
      }
      if (method === 'PUT') {
        const conversation = validateConversation(id, await readJson(req))
        // La version la plus récente l’emporte : une copie plus ancienne (autre appareil) ne l’écrase pas.
        const stored = await store.getConversation(session, id)
        if (stored && (stored.kind !== conversation.kind || stored.businessId !== conversation.businessId)) throw new BusinessError(409, 'Cette conversation appartient à un autre espace.')
        if (stored && Date.parse(stored.updatedAt) > Date.parse(conversation.updatedAt)) return sendJson(res, 409, { error: 'Une version plus récente existe.', conversation: stored })
        return sendJson(res, 200, { conversation: await store.saveConversation(session, conversation) })
      }
      if (method === 'PATCH') {
        const conversation = await store.updateConversation(session, id, validateConversationChanges(await readJson(req)))
        if (!conversation) throw new BusinessError(404, 'Conversation introuvable.')
        return sendJson(res, 200, { conversation })
      }
      if (method === 'DELETE') {
        await store.deleteConversation(session, id)
        return sendJson(res, 200, { deleted: true })
      }
      throw new BusinessError(405, 'Méthode non autorisée.')
    } catch (error) {
      if (error instanceof BusinessError) return sendJson(res, error.status, { error: error.message })
      const { status, message } = /** @type {{ status?: number, message?: string }} */ (error)
      if (status === 400 || status === 413) return sendJson(res, status, { error: message ?? 'Requête invalide.' })
      console.error('[gilli] Erreur conversations :', error)
      return sendJson(res, 500, { error: 'Erreur inattendue. Réessayez.' })
    }
  }
}
