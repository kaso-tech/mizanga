// Accès aux données Élevage pour les tests : mêmes opérations que l’API REST de Supabase, exécutées sur
// PGlite avec l’identité de l’utilisateur (rôle authenticated), donc avec les règles RLS et les fonctions réelles.
import { toBusinessError } from '../../server/business/supabase-store.mjs'
import { BusinessError } from '../../server/business/validate.mjs'
import { eventParams, toAnimal, toEvent, toHealth, toHerd, toHerdSummary } from '../../server/livestock/store.mjs'
import { asUser } from './database.mjs'

const herdColumns = 'h.id, h.name, h.species, h.tracking, h.headcount, h.started_on::text, h.note, h.archived'
const eventColumns = 'e.id, e.herd_id, e.animal_id, e.kind, e.quantity, e.headcount_delta, e.amount, e.cause, e.note, e.occurred_on::text, e.status, e.cancel_reason, e.created_at, h.name as herd_name, a.tag as animal_tag'
const healthColumns = 'c.id, c.herd_id, c.animal_id, c.kind, c.product, c.due_on::text, c.done_on::text, c.status, c.cost, c.note, h.name as herd_name, a.tag as animal_tag'

/**
 * @param {import('@electric-sql/pglite').PGlite} db
 * @returns {import('../../server/livestock/store.mjs').LivestockStore}
 */
export function createPgliteLivestockStore(db) {
  /** @param {string} userId @param {string} sql @param {unknown[]} params */
  const query = async (userId, sql, params = []) => {
    try {
      return /** @type {any[]} */ ((await asUser(db, userId, () => db.query(sql, params))).rows)
    } catch (error) {
      throw toBusinessError(400, /** @type {{ code?: string, message?: string }} */ (error))
    }
  }
  /** @param {string} userId @param {string} eventId */
  const readEvent = async (userId, eventId) => toEvent((await query(userId, `select ${eventColumns} from public.livestock_events e join public.livestock_herds h on h.id = e.herd_id left join public.livestock_animals a on a.id = e.animal_id where e.id = $1`, [eventId]))[0])
  /** @param {string} userId @param {string} healthId */
  const readHealth = async (userId, healthId) => toHealth((await query(userId, `select ${healthColumns} from public.livestock_health c join public.livestock_herds h on h.id = c.herd_id left join public.livestock_animals a on a.id = c.animal_id where c.id = $1`, [healthId]))[0])

  return {
    async listHerds({ userId }, businessId, { includeArchived }) {
      return (await query(userId, `select ${herdColumns} from public.livestock_herds h where h.business_id = $1 ${includeArchived ? '' : 'and not h.archived'} order by h.archived, h.name`, [businessId])).map(toHerd)
    },
    async createHerd({ userId }, businessId, input) {
      const [row] = await query(userId, 'select id from public.create_herd($1, $2, $3, $4, $5, $6, $7)', [businessId, input.name, input.species, input.tracking, input.initialCount, input.startedOn, input.note])
      return toHerd((await query(userId, `select ${herdColumns} from public.livestock_herds h where h.id = $1`, [row.id]))[0])
    },
    async updateHerd({ userId }, businessId, herdId, changes) {
      const columns = Object.keys(changes)
      const rows = await query(userId, `update public.livestock_herds h set ${columns.map((column, index) => `${column} = $${index + 3}`).join(', ')} where h.id = $1 and h.business_id = $2 returning ${herdColumns}`, [herdId, businessId, ...columns.map((column) => changes[column])])
      if (!rows.length) throw new BusinessError(404, 'Lot introuvable.')
      return toHerd(rows[0])
    },
    async listAnimals({ userId }, businessId) {
      return (await query(userId, "select id, herd_id, tag, name, sex, born_on::text, status from public.livestock_animals where business_id = $1 and status <> 'removed' order by tag", [businessId])).map(toAnimal)
    },
    async listEvents({ userId }, businessId, { start, end }) {
      return (await query(userId, `select ${eventColumns} from public.livestock_events e join public.livestock_herds h on h.id = e.herd_id left join public.livestock_animals a on a.id = e.animal_id
        where e.business_id = $1 and e.occurred_on between $2 and $3 order by e.occurred_on desc, e.created_at desc limit 500`, [businessId, start, end])).map(toEvent)
    },
    async recordEvent({ userId }, businessId, input) {
      const p = eventParams(businessId, input)
      const [row] = await query(userId, 'select id from public.record_livestock_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)', [p.p_business_id, p.p_herd_id, p.p_kind, p.p_quantity, p.p_amount, p.p_occurred_on, p.p_cause, p.p_note, p.p_animal_id, p.p_animal ? JSON.stringify(p.p_animal) : null])
      return readEvent(userId, row.id)
    },
    async cancelEvent({ userId }, businessId, eventId, reason) {
      const [row] = await query(userId, 'select id from public.cancel_livestock_event($1, $2, $3)', [businessId, eventId, reason])
      return readEvent(userId, row.id)
    },
    async listHealth({ userId }, businessId) {
      return (await query(userId, `select ${healthColumns} from public.livestock_health c join public.livestock_herds h on h.id = c.herd_id left join public.livestock_animals a on a.id = c.animal_id
        where c.business_id = $1 order by (c.status = 'planned') desc, c.due_on, c.updated_at desc limit 600`, [businessId])).map(toHealth)
    },
    async createHealth({ userId }, businessId, input) {
      const [row] = await query(userId, 'insert into public.livestock_health (business_id, herd_id, animal_id, kind, product, due_on, done_on, status, cost, note) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id',
        [businessId, input.herdId, input.animalId, input.kind, input.product, input.dueOn, input.doneOn, input.status, input.cost, input.note])
      return readHealth(userId, row.id)
    },
    async updateHealth({ userId }, businessId, healthId, changes) {
      const columns = Object.keys(changes)
      const rows = await query(userId, `update public.livestock_health set ${columns.map((column, index) => `${column} = $${index + 3}`).join(', ')} where id = $1 and business_id = $2 returning id`, [healthId, businessId, ...columns.map((column) => changes[column])])
      if (!rows.length) throw new BusinessError(404, 'Soin introuvable.')
      return readHealth(userId, rows[0].id)
    },
    async summary({ userId }, businessId, { start, end }) {
      return (await query(userId, 'select * from public.livestock_summary($1, $2, $3)', [businessId, start, end])).map(toHerdSummary)
    },
  }
}
