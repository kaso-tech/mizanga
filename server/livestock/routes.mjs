// Adresses /api/business/:entreprise/livestock/* (onglet Élevage). Le compte et l’appartenance à
// l’entreprise sont vérifiés par les routes Business ; les données sont contrôlées ici puis par la base.
import { BusinessError, isUuid, validatePeriod } from '../business/validate.mjs'
import { validateEventInput, validateHealthChanges, validateHealthInput, validateHerdChanges, validateHerdInput } from './validate.mjs'

/**
 * @param {{
 *   livestock: import('./store.mjs').LivestockStore,
 *   readJson: import('../business/routes.mjs').ReadJson,
 *   sendJson: import('../business/routes.mjs').SendJson,
 *   assistant?: ReturnType<typeof import('./assistant.mjs').createLivestockAssistant> | null,
 * }} deps
 */
export function createLivestockRoutes({ livestock, readJson, sendJson, assistant = null }) {
  /**
   * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
   * @param {import('../business/supabase-store.mjs').BusinessSession} session @param {string} businessId
   * @param {string[]} segments Chemin après « livestock », par exemple ['herds', '…'] ou ['events', '…', 'cancel'].
   */
  return async (req, res, session, businessId, segments) => {
    const [collection, itemId, action] = segments
    if (itemId !== undefined && !isUuid(itemId)) throw new BusinessError(404, 'Élément introuvable.')
    const method = req.method ?? 'GET'
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams

    if (collection === 'herds' && segments.length === 1) {
      if (method === 'GET') return sendJson(res, 200, { herds: await livestock.listHerds(session, businessId, { includeArchived: params.get('archived') === '1' }) })
      if (method === 'POST') return sendJson(res, 201, { herd: await livestock.createHerd(session, businessId, validateHerdInput(await readJson(req))) })
    }
    if (collection === 'herds' && segments.length === 2 && method === 'PATCH') {
      return sendJson(res, 200, { herd: await livestock.updateHerd(session, businessId, itemId, validateHerdChanges(await readJson(req))) })
    }
    if (collection === 'animals' && segments.length === 1 && method === 'GET') {
      return sendJson(res, 200, { animals: await livestock.listAnimals(session, businessId) })
    }
    if (collection === 'events' && segments.length === 1) {
      if (method === 'GET') return sendJson(res, 200, { events: await livestock.listEvents(session, businessId, validatePeriod(params)) })
      if (method === 'POST') return sendJson(res, 201, { event: await livestock.recordEvent(session, businessId, validateEventInput(await readJson(req))) })
    }
    if (collection === 'events' && segments.length === 3 && action === 'cancel' && method === 'POST') {
      const body = /** @type {any} */ (await readJson(req))
      const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : null
      return sendJson(res, 200, { event: await livestock.cancelEvent(session, businessId, itemId, reason) })
    }
    if (collection === 'health' && segments.length === 1) {
      if (method === 'GET') return sendJson(res, 200, { health: await livestock.listHealth(session, businessId) })
      if (method === 'POST') return sendJson(res, 201, { record: await livestock.createHealth(session, businessId, validateHealthInput(await readJson(req))) })
    }
    if (collection === 'health' && segments.length === 2 && method === 'PATCH') {
      return sendJson(res, 200, { record: await livestock.updateHealth(session, businessId, itemId, validateHealthChanges(await readJson(req))) })
    }
    if (collection === 'summary' && segments.length === 1 && method === 'GET') {
      const period = validatePeriod(params)
      return sendJson(res, 200, { period, herds: await livestock.summary(session, businessId, period) })
    }
    if (collection === 'assistant' && segments.length === 1 && assistant) {
      if (method === 'GET') return sendJson(res, 200, { quota: await assistant.quota(session, businessId) })
      if (method === 'POST') return await assistant.answer(req, res, session, businessId, await readJson(req))
    }
    throw new BusinessError(404, 'Introuvable.')
  }
}
