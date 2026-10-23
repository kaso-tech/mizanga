// Accès aux données Agriculture dans Supabase (API REST), toujours avec le jeton de l’utilisateur : les
// règles RLS et les fonctions contrôlées de la base (stock de récolte, journal, résultats) s’appliquent.
import { BusinessError } from '../business/validate.mjs'
import { createSupabaseRequest } from '../business/supabase-store.mjs'

/**
 * @typedef {import('../business/supabase-store.mjs').BusinessSession} Session
 * @typedef {{ id: string, name: string, location: string | null, areaM2: number, areaUnit: string, tenure: string, note: string | null, archived: boolean }} Plot
 * @typedef {{ id: string, plotId: string, plotName: string, crop: string, cropLabel: string, season: string, year: number, areaM2: number, sownOn: string | null, expectedHarvestOn: string | null, status: string, harvestedKg: number, stockKg: number, note: string | null }} Crop
 * @typedef {{ id: string, cropId: string, cropLabel: string, plotName: string, kind: string, workType: string | null, inputType: string | null, label: string | null, quantity: number | null, unit: string | null, quantityKg: number, stockDelta: number, amount: number, note: string | null, occurredOn: string, status: string, cancelReason: string | null, createdAt: string }} Operation
 * @typedef {{ id: string, cropId: string, cropLabel: string, plotName: string, workType: string, label: string | null, dueOn: string, status: string, doneOn: string | null }} Task
 * @typedef {{ cropId: string, crop: string, cropLabel: string, plotId: string, plotName: string, season: string, year: number, status: string, areaM2: number, harvestedKg: number, yieldKgPerHa: number, soldKg: number, consumedKg: number, lostKg: number, stockKg: number, inputCost: number, labourCost: number, rentalCost: number, otherCost: number, totalCost: number, salesRevenue: number, estimatedMargin: number }} CropResult
 *
 * @typedef {object} AgricultureStore
 * @property {(session: Session, businessId: string, options: { includeArchived: boolean }) => Promise<Plot[]>} listPlots
 * @property {(session: Session, businessId: string, input: ReturnType<typeof import('./validate.mjs').validatePlotInput>) => Promise<Plot>} createPlot
 * @property {(session: Session, businessId: string, plotId: string, changes: Record<string, unknown>) => Promise<Plot>} updatePlot
 * @property {(session: Session, businessId: string, year: number | null) => Promise<Crop[]>} listCrops
 * @property {(session: Session, businessId: string, input: ReturnType<typeof import('./validate.mjs').validateCropInput>) => Promise<Crop>} createCrop
 * @property {(session: Session, businessId: string, cropId: string, changes: Record<string, unknown>) => Promise<Crop>} updateCrop
 * @property {(session: Session, businessId: string, period: { start: string, end: string }) => Promise<Operation[]>} listOperations
 * @property {(session: Session, businessId: string, input: ReturnType<typeof import('./validate.mjs').validateOperationInput>) => Promise<Operation>} recordOperation
 * @property {(session: Session, businessId: string, operationId: string, reason: string | null) => Promise<Operation>} cancelOperation
 * @property {(session: Session, businessId: string) => Promise<Task[]>} listTasks
 * @property {(session: Session, businessId: string, input: ReturnType<typeof import('./validate.mjs').validateTaskInput>) => Promise<Task>} createTask
 * @property {(session: Session, businessId: string, taskId: string, change: ReturnType<typeof import('./validate.mjs').validateTaskChange>) => Promise<Task>} updateTask
 * @property {(session: Session, businessId: string, year: number) => Promise<CropResult[]>} results
 */

export const PLOT_COLUMNS = 'id,name,location,area_m2,area_unit,tenure,note,archived'
export const CROP_COLUMNS = 'id,plot_id,crop,crop_label,season,year,area_m2,sown_on,expected_harvest_on,status,harvested_kg,stock_kg,note'
export const OPERATION_COLUMNS = 'id,crop_id,kind,work_type,input_type,label,quantity,unit,quantity_kg,stock_delta,amount,note,occurred_on,status,cancel_reason,created_at'
export const TASK_COLUMNS = 'id,crop_id,work_type,label,due_on,status,done_on'

const toDay = (/** @type {unknown} */ value) => (value === null || value === undefined ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10))
const toNumber = (/** @type {unknown} */ value) => (value === null || value === undefined ? null : Number(value))

/** @param {any} row @returns {Plot} */
export const toPlot = (row) => ({ id: row.id, name: row.name, location: row.location ?? null, areaM2: Number(row.area_m2), areaUnit: row.area_unit, tenure: row.tenure, note: row.note ?? null, archived: row.archived === true })

/** @param {any} row @returns {Crop} */
export const toCrop = (row) => ({
  id: row.id,
  plotId: row.plot_id,
  plotName: row.plot_name ?? row.plot?.name ?? '',
  crop: row.crop,
  cropLabel: row.crop_label,
  season: row.season,
  year: Number(row.year),
  areaM2: Number(row.area_m2),
  sownOn: toDay(row.sown_on),
  expectedHarvestOn: toDay(row.expected_harvest_on),
  status: row.status,
  harvestedKg: Number(row.harvested_kg),
  stockKg: Number(row.stock_kg),
  note: row.note ?? null,
})

/** @param {any} row @returns {Operation} */
export const toOperation = (row) => ({
  id: row.id,
  cropId: row.crop_id,
  cropLabel: row.crop_label ?? row.crop?.crop_label ?? '',
  plotName: row.plot_name ?? row.crop?.plot?.name ?? '',
  kind: row.kind,
  workType: row.work_type ?? null,
  inputType: row.input_type ?? null,
  label: row.label ?? null,
  quantity: toNumber(row.quantity),
  unit: row.unit ?? null,
  quantityKg: Number(row.quantity_kg),
  stockDelta: Number(row.stock_delta),
  amount: Number(row.amount),
  note: row.note ?? null,
  occurredOn: /** @type {string} */ (toDay(row.occurred_on)),
  status: row.status,
  cancelReason: row.cancel_reason ?? null,
  createdAt: new Date(row.created_at).toISOString(),
})

/** @param {any} row @returns {Task} */
export const toTask = (row) => ({
  id: row.id,
  cropId: row.crop_id,
  cropLabel: row.crop_label ?? row.crop?.crop_label ?? '',
  plotName: row.plot_name ?? row.crop?.plot?.name ?? '',
  workType: row.work_type,
  label: row.label ?? null,
  dueOn: /** @type {string} */ (toDay(row.due_on)),
  status: row.status,
  doneOn: toDay(row.done_on),
})

/** @param {any} row @returns {CropResult} */
export const toCropResult = (row) => ({
  cropId: row.crop_id,
  crop: row.crop,
  cropLabel: row.crop_label,
  plotId: row.plot_id,
  plotName: row.plot_name,
  season: row.season,
  year: Number(row.year),
  status: row.status,
  areaM2: Number(row.area_m2),
  harvestedKg: Number(row.harvested_kg),
  yieldKgPerHa: Number(row.yield_kg_per_ha),
  soldKg: Number(row.sold_kg),
  consumedKg: Number(row.consumed_kg),
  lostKg: Number(row.lost_kg),
  stockKg: Number(row.stock_kg),
  inputCost: Number(row.input_cost),
  labourCost: Number(row.labour_cost),
  rentalCost: Number(row.rental_cost),
  otherCost: Number(row.other_cost),
  totalCost: Number(row.total_cost),
  salesRevenue: Number(row.sales_revenue),
  estimatedMargin: Number(row.estimated_margin),
})

/** Paramètres de record_farm_operation. @param {string} businessId @param {ReturnType<typeof import('./validate.mjs').validateOperationInput>} input */
export const operationParams = (businessId, input) => ({
  p_business_id: businessId,
  p_crop_id: input.cropId,
  p_kind: input.kind,
  p_quantity: input.quantity,
  p_unit: input.unit,
  p_unit_kg: input.unitKg,
  p_amount: input.amount,
  p_occurred_on: input.occurredOn,
  p_work_type: input.workType,
  p_input_type: input.inputType,
  p_label: input.label,
  p_note: input.note,
})

/**
 * @param {{ supabaseUrl: string, publishableKey: string }} config
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {AgricultureStore}
 */
export function createSupabaseAgricultureStore(config, { fetchImpl = fetch } = {}) {
  const request = createSupabaseRequest(config, fetchImpl)
  const id = (/** @type {string} */ value) => encodeURIComponent(value)
  const cropSelect = `${CROP_COLUMNS},plot:farm_plots!farm_crops_plot_id_fkey(name)`
  const cropEmbed = (/** @type {string} */ fk) => `crop:farm_crops!${fk}(crop_label,plot:farm_plots!farm_crops_plot_id_fkey(name))`
  const operationSelect = `${OPERATION_COLUMNS},${cropEmbed('farm_operations_crop_id_fkey')}`
  const taskSelect = `${TASK_COLUMNS},${cropEmbed('farm_tasks_crop_id_fkey')}`
  /** @param {Session} session @param {string} businessId @param {string} operationId */
  const readOperation = async (session, businessId, operationId) => toOperation((await request(session, 'GET', `farm_operations?select=${operationSelect}&id=eq.${id(operationId)}&business_id=eq.${id(businessId)}`))[0])
  /** @param {Session} session @param {string} businessId @param {string} taskId */
  const readTask = async (session, businessId, taskId) => toTask((await request(session, 'GET', `farm_tasks?select=${taskSelect}&id=eq.${id(taskId)}&business_id=eq.${id(businessId)}`))[0])

  return {
    async listPlots(session, businessId, { includeArchived }) {
      return (await request(session, 'GET', `farm_plots?select=${PLOT_COLUMNS}&business_id=eq.${id(businessId)}${includeArchived ? '' : '&archived=eq.false'}&order=archived.asc,name.asc`)).map(toPlot)
    },
    async createPlot(session, businessId, input) {
      const [row] = await request(session, 'POST', `farm_plots?select=${PLOT_COLUMNS}`, { business_id: businessId, name: input.name, location: input.location, area_m2: input.areaM2, area_unit: input.areaUnit, tenure: input.tenure, note: input.note }, true)
      return toPlot(row)
    },
    async updatePlot(session, businessId, plotId, changes) {
      const rows = await request(session, 'PATCH', `farm_plots?select=${PLOT_COLUMNS}&id=eq.${id(plotId)}&business_id=eq.${id(businessId)}`, changes, true)
      if (!rows?.length) throw new BusinessError(404, 'Parcelle introuvable.')
      return toPlot(rows[0])
    },
    async listCrops(session, businessId, year) {
      return (await request(session, 'GET', `farm_crops?select=${cropSelect}&business_id=eq.${id(businessId)}${year ? `&year=eq.${year}` : ''}&order=year.desc,status.asc,crop_label.asc&limit=500`)).map(toCrop)
    },
    async createCrop(session, businessId, input) {
      const [row] = await request(session, 'POST', `farm_crops?select=${cropSelect}`, {
        business_id: businessId, plot_id: input.plotId, crop: input.crop, crop_label: input.cropLabel, season: input.season, year: input.year, area_m2: input.areaM2, sown_on: input.sownOn, expected_harvest_on: input.expectedHarvestOn, note: input.note,
      }, true)
      return toCrop(row)
    },
    async updateCrop(session, businessId, cropId, changes) {
      const rows = await request(session, 'PATCH', `farm_crops?select=${cropSelect}&id=eq.${id(cropId)}&business_id=eq.${id(businessId)}`, changes, true)
      if (!rows?.length) throw new BusinessError(404, 'Culture introuvable.')
      return toCrop(rows[0])
    },
    async listOperations(session, businessId, { start, end }) {
      return (await request(session, 'GET', `farm_operations?select=${operationSelect}&business_id=eq.${id(businessId)}&occurred_on=gte.${id(start)}&occurred_on=lte.${id(end)}&order=occurred_on.desc,created_at.desc&limit=500`)).map(toOperation)
    },
    async recordOperation(session, businessId, input) {
      const row = await request(session, 'POST', 'rpc/record_farm_operation', operationParams(businessId, input))
      return readOperation(session, businessId, row.id)
    },
    async cancelOperation(session, businessId, operationId, reason) {
      const row = await request(session, 'POST', 'rpc/cancel_farm_operation', { p_business_id: businessId, p_operation_id: operationId, p_reason: reason })
      return readOperation(session, businessId, row.id)
    },
    async listTasks(session, businessId) {
      const [planned, past] = await Promise.all([
        request(session, 'GET', `farm_tasks?select=${taskSelect}&business_id=eq.${id(businessId)}&status=eq.planned&order=due_on.asc&limit=500`),
        request(session, 'GET', `farm_tasks?select=${taskSelect}&business_id=eq.${id(businessId)}&status=neq.planned&order=updated_at.desc&limit=100`),
      ])
      return [...planned, ...past].map(toTask)
    },
    async createTask(session, businessId, input) {
      const [row] = await request(session, 'POST', `farm_tasks?select=${taskSelect}`, { business_id: businessId, crop_id: input.cropId, work_type: input.workType, label: input.label, due_on: input.dueOn }, true)
      return toTask(row)
    },
    async updateTask(session, businessId, taskId, change) {
      if (change.status === 'done') {
        await request(session, 'POST', 'rpc/complete_farm_task', { p_business_id: businessId, p_task_id: taskId, p_done_on: change.doneOn, p_amount: change.amount })
        return readTask(session, businessId, taskId)
      }
      const rows = await request(session, 'PATCH', `farm_tasks?select=${taskSelect}&id=eq.${id(taskId)}&business_id=eq.${id(businessId)}&status=eq.planned`, change.status === 'planned' ? { due_on: change.dueOn } : { status: 'cancelled' }, true)
      if (!rows?.length) throw new BusinessError(404, 'Travail introuvable ou déjà traité.')
      return toTask(rows[0])
    },
    async results(session, businessId, year) {
      return (await request(session, 'POST', 'rpc/farm_crop_results', { p_business_id: businessId, p_year: year })).map(toCropResult)
    },
  }
}
