// Accès aux données Élevage dans Supabase (API REST), toujours avec le jeton de l’utilisateur : les règles
// RLS et les fonctions contrôlées de la base (effectifs, journal, résultats) s’appliquent.
import { BusinessError } from '../business/validate.mjs'
import { createSupabaseRequest } from '../business/supabase-store.mjs'

/**
 * @typedef {import('../business/supabase-store.mjs').BusinessSession} Session
 * @typedef {{ id: string, name: string, species: string, tracking: string, headcount: number, startedOn: string, note: string | null, archived: boolean }} Herd
 * @typedef {{ id: string, herdId: string, tag: string, name: string | null, sex: string, bornOn: string | null, status: string }} Animal
 * @typedef {{ id: string, herdId: string, herdName: string, animalId: string | null, animalTag: string | null, kind: string, quantity: number, headcountDelta: number, amount: number, cause: string | null, note: string | null, occurredOn: string, status: string, cancelReason: string | null, createdAt: string }} LivestockEvent
 * @typedef {{ id: string, herdId: string, herdName: string, animalId: string | null, animalTag: string | null, kind: string, product: string, dueOn: string | null, doneOn: string | null, status: string, cost: number, note: string | null }} HealthRecord
 * @typedef {{ herdId: string, herdName: string, species: string, tracking: string, archived: boolean, headcount: number, openingHeadcount: number, closingHeadcount: number, births: number, purchases: number, sales: number, deaths: number, countAdjustment: number, mortalityRate: number | null, purchaseCost: number, feedCost: number, healthCost: number, otherCost: number, totalCost: number, salesRevenue: number, estimatedMargin: number }} HerdSummary
 *
 * @typedef {object} LivestockStore
 * @property {(session: Session, businessId: string, options: { includeArchived: boolean }) => Promise<Herd[]>} listHerds
 * @property {(session: Session, businessId: string, input: ReturnType<typeof import('./validate.mjs').validateHerdInput>) => Promise<Herd>} createHerd
 * @property {(session: Session, businessId: string, herdId: string, changes: Record<string, unknown>) => Promise<Herd>} updateHerd
 * @property {(session: Session, businessId: string) => Promise<Animal[]>} listAnimals
 * @property {(session: Session, businessId: string, period: { start: string, end: string }) => Promise<LivestockEvent[]>} listEvents
 * @property {(session: Session, businessId: string, input: ReturnType<typeof import('./validate.mjs').validateEventInput>) => Promise<LivestockEvent>} recordEvent
 * @property {(session: Session, businessId: string, eventId: string, reason: string | null) => Promise<LivestockEvent>} cancelEvent
 * @property {(session: Session, businessId: string) => Promise<HealthRecord[]>} listHealth
 * @property {(session: Session, businessId: string, input: ReturnType<typeof import('./validate.mjs').validateHealthInput>) => Promise<HealthRecord>} createHealth
 * @property {(session: Session, businessId: string, healthId: string, changes: Record<string, unknown>) => Promise<HealthRecord>} updateHealth
 * @property {(session: Session, businessId: string, period: { start: string, end: string }) => Promise<HerdSummary[]>} summary
 */

export const HERD_COLUMNS = 'id,name,species,tracking,headcount,started_on,note,archived'
export const ANIMAL_COLUMNS = 'id,herd_id,tag,name,sex,born_on,status'
export const EVENT_COLUMNS = 'id,herd_id,animal_id,kind,quantity,headcount_delta,amount,cause,note,occurred_on,status,cancel_reason,created_at'
export const HEALTH_COLUMNS = 'id,herd_id,animal_id,kind,product,due_on,done_on,status,cost,note'

/** Jour AAAA-MM-JJ d’une colonne date (texte de l’API, ou objet Date). @param {unknown} value */
const toDay = (value) => (value === null || value === undefined ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10))

/** @param {any} row @returns {Herd} */
export const toHerd = (row) => ({ id: row.id, name: row.name, species: row.species, tracking: row.tracking, headcount: Number(row.headcount), startedOn: /** @type {string} */ (toDay(row.started_on)), note: row.note ?? null, archived: row.archived === true })

/** @param {any} row @returns {Animal} */
export const toAnimal = (row) => ({ id: row.id, herdId: row.herd_id, tag: row.tag, name: row.name ?? null, sex: row.sex, bornOn: toDay(row.born_on), status: row.status })

/** @param {any} row @returns {LivestockEvent} */
export const toEvent = (row) => ({
  id: row.id,
  herdId: row.herd_id,
  herdName: row.herd_name ?? row.herd?.name ?? '',
  animalId: row.animal_id ?? null,
  animalTag: row.animal_tag ?? row.animal?.tag ?? null,
  kind: row.kind,
  quantity: Number(row.quantity),
  headcountDelta: Number(row.headcount_delta),
  amount: Number(row.amount),
  cause: row.cause ?? null,
  note: row.note ?? null,
  occurredOn: /** @type {string} */ (toDay(row.occurred_on)),
  status: row.status,
  cancelReason: row.cancel_reason ?? null,
  createdAt: new Date(row.created_at).toISOString(),
})

/** @param {any} row @returns {HealthRecord} */
export const toHealth = (row) => ({
  id: row.id,
  herdId: row.herd_id,
  herdName: row.herd_name ?? row.herd?.name ?? '',
  animalId: row.animal_id ?? null,
  animalTag: row.animal_tag ?? row.animal?.tag ?? null,
  kind: row.kind,
  product: row.product,
  dueOn: toDay(row.due_on),
  doneOn: toDay(row.done_on),
  status: row.status,
  cost: Number(row.cost),
  note: row.note ?? null,
})

/** @param {any} row @returns {HerdSummary} */
export const toHerdSummary = (row) => ({
  herdId: row.herd_id,
  herdName: row.herd_name,
  species: row.species,
  tracking: row.tracking,
  archived: row.archived === true,
  headcount: Number(row.headcount),
  openingHeadcount: Number(row.opening_headcount),
  closingHeadcount: Number(row.closing_headcount),
  births: Number(row.births),
  purchases: Number(row.purchases),
  sales: Number(row.sales),
  deaths: Number(row.deaths),
  countAdjustment: Number(row.count_adjustment),
  mortalityRate: row.mortality_rate === null || row.mortality_rate === undefined ? null : Number(row.mortality_rate),
  purchaseCost: Number(row.purchase_cost),
  feedCost: Number(row.feed_cost),
  healthCost: Number(row.health_cost),
  otherCost: Number(row.other_cost),
  totalCost: Number(row.total_cost),
  salesRevenue: Number(row.sales_revenue),
  estimatedMargin: Number(row.estimated_margin),
})

/** Paramètres de record_livestock_event. @param {string} businessId @param {ReturnType<typeof import('./validate.mjs').validateEventInput>} input */
export const eventParams = (businessId, input) => ({
  p_business_id: businessId,
  p_herd_id: input.herdId,
  p_kind: input.kind,
  p_quantity: input.quantity,
  p_amount: input.amount,
  p_occurred_on: input.occurredOn,
  p_cause: input.cause,
  p_note: input.note,
  p_animal_id: input.animalId,
  p_animal: input.animal ? { tag: input.animal.tag, name: input.animal.name, sex: input.animal.sex, born_on: input.animal.bornOn } : null,
})

/**
 * @param {{ supabaseUrl: string, publishableKey: string }} config
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {LivestockStore}
 */
export function createSupabaseLivestockStore(config, { fetchImpl = fetch } = {}) {
  const request = createSupabaseRequest(config, fetchImpl)
  const id = (/** @type {string} */ value) => encodeURIComponent(value)
  const eventSelect = `${EVENT_COLUMNS},herd:livestock_herds!livestock_events_herd_id_fkey(name),animal:livestock_animals!livestock_events_animal_id_fkey(tag)`
  const healthSelect = `${HEALTH_COLUMNS},herd:livestock_herds!livestock_health_herd_id_fkey(name),animal:livestock_animals!livestock_health_animal_id_fkey(tag)`
  /** @param {Session} session @param {string} businessId @param {string} eventId */
  const readEvent = async (session, businessId, eventId) => toEvent((await request(session, 'GET', `livestock_events?select=${eventSelect}&id=eq.${id(eventId)}&business_id=eq.${id(businessId)}`))[0])

  return {
    async listHerds(session, businessId, { includeArchived }) {
      const rows = await request(session, 'GET', `livestock_herds?select=${HERD_COLUMNS}&business_id=eq.${id(businessId)}${includeArchived ? '' : '&archived=eq.false'}&order=archived.asc,name.asc`)
      return rows.map(toHerd)
    },
    async createHerd(session, businessId, input) {
      return toHerd(await request(session, 'POST', 'rpc/create_herd', {
        p_business_id: businessId, p_name: input.name, p_species: input.species, p_tracking: input.tracking, p_initial_count: input.initialCount, p_started_on: input.startedOn, p_note: input.note,
      }))
    },
    async updateHerd(session, businessId, herdId, changes) {
      const rows = await request(session, 'PATCH', `livestock_herds?select=${HERD_COLUMNS}&id=eq.${id(herdId)}&business_id=eq.${id(businessId)}`, changes, true)
      if (!rows?.length) throw new BusinessError(404, 'Lot introuvable.')
      return toHerd(rows[0])
    },
    async listAnimals(session, businessId) {
      const rows = await request(session, 'GET', `livestock_animals?select=${ANIMAL_COLUMNS}&business_id=eq.${id(businessId)}&status=neq.removed&order=tag.asc&limit=2000`)
      return rows.map(toAnimal)
    },
    async listEvents(session, businessId, { start, end }) {
      const rows = await request(session, 'GET', `livestock_events?select=${eventSelect}&business_id=eq.${id(businessId)}&occurred_on=gte.${id(start)}&occurred_on=lte.${id(end)}&order=occurred_on.desc,created_at.desc&limit=500`)
      return rows.map(toEvent)
    },
    async recordEvent(session, businessId, input) {
      const row = await request(session, 'POST', 'rpc/record_livestock_event', eventParams(businessId, input))
      return readEvent(session, businessId, row.id)
    },
    async cancelEvent(session, businessId, eventId, reason) {
      const row = await request(session, 'POST', 'rpc/cancel_livestock_event', { p_business_id: businessId, p_event_id: eventId, p_reason: reason })
      return readEvent(session, businessId, row.id)
    },
    async listHealth(session, businessId) {
      // Soins prévus (rappels), puis les plus récents faits ou annulés.
      const [planned, past] = await Promise.all([
        request(session, 'GET', `livestock_health?select=${healthSelect}&business_id=eq.${id(businessId)}&status=eq.planned&order=due_on.asc&limit=500`),
        request(session, 'GET', `livestock_health?select=${healthSelect}&business_id=eq.${id(businessId)}&status=neq.planned&order=updated_at.desc&limit=100`),
      ])
      return [...planned, ...past].map(toHealth)
    },
    async createHealth(session, businessId, input) {
      const [row] = await request(session, 'POST', `livestock_health?select=${healthSelect}`, {
        business_id: businessId, herd_id: input.herdId, animal_id: input.animalId, kind: input.kind, product: input.product, due_on: input.dueOn, done_on: input.doneOn, status: input.status, cost: input.cost, note: input.note,
      }, true)
      return toHealth(row)
    },
    async updateHealth(session, businessId, healthId, changes) {
      const rows = await request(session, 'PATCH', `livestock_health?select=${healthSelect}&id=eq.${id(healthId)}&business_id=eq.${id(businessId)}`, changes, true)
      if (!rows?.length) throw new BusinessError(404, 'Soin introuvable.')
      return toHealth(rows[0])
    },
    async summary(session, businessId, { start, end }) {
      const rows = await request(session, 'POST', 'rpc/livestock_summary', { p_business_id: businessId, p_start: start, p_end: end })
      return rows.map(toHerdSummary)
    },
  }
}
