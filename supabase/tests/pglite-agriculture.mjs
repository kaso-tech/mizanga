// Accès aux données Agriculture pour les tests : mêmes opérations que l’API REST de Supabase, exécutées sur
// PGlite avec l’identité de l’utilisateur (rôle authenticated), donc avec les règles RLS et les fonctions réelles.
import { operationParams, toCrop, toCropResult, toOperation, toPlot, toTask } from '../../server/agriculture/store.mjs'
import { toBusinessError } from '../../server/business/supabase-store.mjs'
import { BusinessError } from '../../server/business/validate.mjs'
import { asUser } from './database.mjs'

const plotColumns = 'p.id, p.name, p.location, p.area_m2, p.area_unit, p.tenure, p.note, p.archived'
const cropColumns = 'c.id, c.plot_id, c.crop, c.crop_label, c.season, c.year, c.area_m2, c.sown_on::text, c.expected_harvest_on::text, c.status, c.harvested_kg, c.stock_kg, c.note, p.name as plot_name'
const operationColumns = 'o.id, o.crop_id, o.kind, o.work_type, o.input_type, o.label, o.quantity, o.unit, o.quantity_kg, o.stock_delta, o.amount, o.note, o.occurred_on::text, o.status, o.cancel_reason, o.created_at, c.crop_label, p.name as plot_name'
const taskColumns = 't.id, t.crop_id, t.work_type, t.label, t.due_on::text, t.status, t.done_on::text, c.crop_label, p.name as plot_name'
const cropJoin = 'join public.farm_crops c on c.id = %.crop_id join public.farm_plots p on p.id = c.plot_id'

/**
 * @param {import('@electric-sql/pglite').PGlite} db
 * @returns {import('../../server/agriculture/store.mjs').AgricultureStore}
 */
export function createPgliteAgricultureStore(db) {
  /** @param {string} userId @param {string} sql @param {unknown[]} params */
  const query = async (userId, sql, params = []) => {
    try {
      return /** @type {any[]} */ ((await asUser(db, userId, () => db.query(sql, params))).rows)
    } catch (error) {
      throw toBusinessError(400, /** @type {{ code?: string, message?: string }} */ (error))
    }
  }
  /** @param {string} userId @param {string} cropId */
  const readCrop = async (userId, cropId) => toCrop((await query(userId, `select ${cropColumns} from public.farm_crops c join public.farm_plots p on p.id = c.plot_id where c.id = $1`, [cropId]))[0])
  /** @param {string} userId @param {string} operationId */
  const readOperation = async (userId, operationId) => toOperation((await query(userId, `select ${operationColumns} from public.farm_operations o ${cropJoin.replace('%', 'o')} where o.id = $1`, [operationId]))[0])
  /** @param {string} userId @param {string} taskId */
  const readTask = async (userId, taskId) => toTask((await query(userId, `select ${taskColumns} from public.farm_tasks t ${cropJoin.replace('%', 't')} where t.id = $1`, [taskId]))[0])
  /** @param {string} userId @param {string} table @param {string} id @param {string} businessId @param {Record<string, unknown>} changes @param {string} [extra] */
  const update = async (userId, table, id, businessId, changes, extra = '') => {
    const columns = Object.keys(changes)
    return query(userId, `update public.${table} set ${columns.map((column, index) => `${column} = $${index + 3}`).join(', ')} where id = $1 and business_id = $2 ${extra} returning id`, [id, businessId, ...columns.map((column) => changes[column])])
  }

  return {
    async listPlots({ userId }, businessId, { includeArchived }) {
      return (await query(userId, `select ${plotColumns} from public.farm_plots p where p.business_id = $1 ${includeArchived ? '' : 'and not p.archived'} order by p.archived, p.name`, [businessId])).map(toPlot)
    },
    async createPlot({ userId }, businessId, input) {
      const [row] = await query(userId, 'insert into public.farm_plots (business_id, name, location, area_m2, area_unit, tenure, note) values ($1, $2, $3, $4, $5, $6, $7) returning id, name, location, area_m2, area_unit, tenure, note, archived', [businessId, input.name, input.location, input.areaM2, input.areaUnit, input.tenure, input.note])
      return toPlot(row)
    },
    async updatePlot({ userId }, businessId, plotId, changes) {
      const rows = await update(userId, 'farm_plots', plotId, businessId, changes)
      if (!rows.length) throw new BusinessError(404, 'Parcelle introuvable.')
      return toPlot((await query(userId, `select ${plotColumns} from public.farm_plots p where p.id = $1`, [plotId]))[0])
    },
    async listCrops({ userId }, businessId, year) {
      return (await query(userId, `select ${cropColumns} from public.farm_crops c join public.farm_plots p on p.id = c.plot_id where c.business_id = $1 ${year ? 'and c.year = $2' : ''} order by c.year desc, c.status, c.crop_label limit 500`, year ? [businessId, year] : [businessId])).map(toCrop)
    },
    async createCrop({ userId }, businessId, input) {
      const [row] = await query(userId, 'insert into public.farm_crops (business_id, plot_id, crop, crop_label, season, year, area_m2, sown_on, expected_harvest_on, note) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id',
        [businessId, input.plotId, input.crop, input.cropLabel, input.season, input.year, input.areaM2, input.sownOn, input.expectedHarvestOn, input.note])
      return readCrop(userId, row.id)
    },
    async updateCrop({ userId }, businessId, cropId, changes) {
      const rows = await update(userId, 'farm_crops', cropId, businessId, changes)
      if (!rows.length) throw new BusinessError(404, 'Culture introuvable.')
      return readCrop(userId, cropId)
    },
    async listOperations({ userId }, businessId, { start, end }) {
      return (await query(userId, `select ${operationColumns} from public.farm_operations o ${cropJoin.replace('%', 'o')} where o.business_id = $1 and o.occurred_on between $2 and $3 order by o.occurred_on desc, o.created_at desc limit 500`, [businessId, start, end])).map(toOperation)
    },
    async recordOperation({ userId }, businessId, input) {
      const p = operationParams(businessId, input)
      const [row] = await query(userId, 'select id from public.record_farm_operation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', [p.p_business_id, p.p_crop_id, p.p_kind, p.p_quantity, p.p_unit, p.p_unit_kg, p.p_amount, p.p_occurred_on, p.p_work_type, p.p_input_type, p.p_label, p.p_note])
      return readOperation(userId, row.id)
    },
    async cancelOperation({ userId }, businessId, operationId, reason) {
      const [row] = await query(userId, 'select id from public.cancel_farm_operation($1, $2, $3)', [businessId, operationId, reason])
      return readOperation(userId, row.id)
    },
    async listTasks({ userId }, businessId) {
      return (await query(userId, `select ${taskColumns} from public.farm_tasks t ${cropJoin.replace('%', 't')} where t.business_id = $1 order by (t.status = 'planned') desc, t.due_on, t.updated_at desc limit 600`, [businessId])).map(toTask)
    },
    async createTask({ userId }, businessId, input) {
      const [row] = await query(userId, 'insert into public.farm_tasks (business_id, crop_id, work_type, label, due_on) values ($1, $2, $3, $4, $5) returning id', [businessId, input.cropId, input.workType, input.label, input.dueOn])
      return readTask(userId, row.id)
    },
    async updateTask({ userId }, businessId, taskId, change) {
      if (change.status === 'done') {
        await query(userId, 'select id from public.complete_farm_task($1, $2, $3, $4)', [businessId, taskId, change.doneOn, change.amount])
        return readTask(userId, taskId)
      }
      const rows = await update(userId, 'farm_tasks', taskId, businessId, change.status === 'planned' ? { due_on: change.dueOn } : { status: 'cancelled' }, "and status = 'planned'")
      if (!rows.length) throw new BusinessError(404, 'Travail introuvable ou déjà traité.')
      return readTask(userId, taskId)
    },
    async results({ userId }, businessId, year) {
      return (await query(userId, 'select * from public.farm_crop_results($1, $2)', [businessId, year])).map(toCropResult)
    },
  }
}
