// Adresses /api/business/:entreprise/agriculture/* (onglet Agriculture). Le compte et l’appartenance à
// l’entreprise sont vérifiés par les routes Business ; les données sont contrôlées ici puis par la base.
import { BusinessError, isUuid, validatePeriod } from '../business/validate.mjs'
import { validateCropChanges, validateCropInput, validateOperationInput, validatePlotChanges, validatePlotInput, validateTaskChange, validateTaskInput } from './validate.mjs'

/** @param {string | null} value */
const readYear = (value) => {
  if (value === null || value === '') return null
  const year = Number(value)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BusinessError(422, 'Année invalide.')
  return year
}

/**
 * @param {{
 *   agriculture: import('./store.mjs').AgricultureStore,
 *   readJson: import('../business/routes.mjs').ReadJson,
 *   sendJson: import('../business/routes.mjs').SendJson,
 *   assistant?: ReturnType<typeof import('./assistant.mjs').createAgricultureAssistant> | null,
 * }} deps
 */
export function createAgricultureRoutes({ agriculture, readJson, sendJson, assistant = null }) {
  /**
   * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
   * @param {import('../business/supabase-store.mjs').BusinessSession} session @param {string} businessId
   * @param {string[]} segments Chemin après « agriculture », par exemple ['plots', '…'] ou ['operations', '…', 'cancel'].
   */
  return async (req, res, session, businessId, segments) => {
    const [collection, itemId, action] = segments
    if (itemId !== undefined && !isUuid(itemId)) throw new BusinessError(404, 'Élément introuvable.')
    const method = req.method ?? 'GET'
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams

    if (collection === 'plots' && segments.length === 1) {
      if (method === 'GET') return sendJson(res, 200, { plots: await agriculture.listPlots(session, businessId, { includeArchived: params.get('archived') === '1' }) })
      if (method === 'POST') return sendJson(res, 201, { plot: await agriculture.createPlot(session, businessId, validatePlotInput(await readJson(req))) })
    }
    if (collection === 'plots' && segments.length === 2 && method === 'PATCH') {
      return sendJson(res, 200, { plot: await agriculture.updatePlot(session, businessId, itemId, validatePlotChanges(await readJson(req))) })
    }
    if (collection === 'crops' && segments.length === 1) {
      if (method === 'GET') return sendJson(res, 200, { crops: await agriculture.listCrops(session, businessId, readYear(params.get('year'))) })
      if (method === 'POST') return sendJson(res, 201, { crop: await agriculture.createCrop(session, businessId, validateCropInput(await readJson(req))) })
    }
    if (collection === 'crops' && segments.length === 2 && method === 'PATCH') {
      return sendJson(res, 200, { crop: await agriculture.updateCrop(session, businessId, itemId, validateCropChanges(await readJson(req))) })
    }
    if (collection === 'operations' && segments.length === 1) {
      if (method === 'GET') return sendJson(res, 200, { operations: await agriculture.listOperations(session, businessId, validatePeriod(params)) })
      if (method === 'POST') return sendJson(res, 201, { operation: await agriculture.recordOperation(session, businessId, validateOperationInput(await readJson(req))) })
    }
    if (collection === 'operations' && segments.length === 3 && action === 'cancel' && method === 'POST') {
      const body = /** @type {any} */ (await readJson(req))
      const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : null
      return sendJson(res, 200, { operation: await agriculture.cancelOperation(session, businessId, itemId, reason) })
    }
    if (collection === 'tasks' && segments.length === 1) {
      if (method === 'GET') return sendJson(res, 200, { tasks: await agriculture.listTasks(session, businessId) })
      if (method === 'POST') return sendJson(res, 201, { task: await agriculture.createTask(session, businessId, validateTaskInput(await readJson(req))) })
    }
    if (collection === 'tasks' && segments.length === 2 && method === 'PATCH') {
      return sendJson(res, 200, { task: await agriculture.updateTask(session, businessId, itemId, validateTaskChange(await readJson(req))) })
    }
    if (collection === 'results' && segments.length === 1 && method === 'GET') {
      const year = readYear(params.get('year'))
      if (!year) throw new BusinessError(422, 'Année invalide.')
      return sendJson(res, 200, { year, crops: await agriculture.results(session, businessId, year) })
    }
    if (collection === 'assistant' && segments.length === 1 && assistant) {
      if (method === 'GET') return sendJson(res, 200, { quota: await assistant.quota(session, businessId) })
      if (method === 'POST') return await assistant.answer(req, res, session, businessId, await readJson(req))
    }
    throw new BusinessError(404, 'Introuvable.')
  }
}
