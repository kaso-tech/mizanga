// @vitest-environment node
// Agriculture : parcelles, cultures, journal, stock de récolte, travaux prévus et résultats, au kg et au franc près.
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createTestDatabase, createUser, errorOf } from './database.mjs'

/** @type {import('@electric-sql/pglite').PGlite} */
let db
let alice = ''
let bob = ''
let carla = ''
let farm = ''
let plot = ''

/** @param {string} userId @param {string} sql @param {unknown[]} [params] */
const queryAs = (userId, sql, params = []) => asUser(db, userId, async () => /** @type {any[]} */ ((await db.query(sql, params)).rows))
const day = (/** @type {number} */ offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
const year = new Date().getUTCFullYear()
/** @param {string} userId @param {string} crop @param {string} kind @param {{ quantity?: number, unit?: string, unitKg?: number, amount?: number, on?: string, work?: string, input?: string, label?: string }} [values] */
const record = async (userId, crop, kind, { quantity, unit, unitKg, amount = 0, on = day(0), work, input, label } = {}) => (
  await queryAs(userId, 'select * from public.record_farm_operation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, null)', [farm, crop, kind, quantity ?? null, unit ?? null, unitKg ?? null, amount, on, work ?? null, input ?? null, label ?? null])
)[0]
const crop = async (/** @type {string} */ id) => (await db.query('select harvested_kg::float as harvested, stock_kg::float as stock from public.farm_crops where id = $1', [id])).rows[0]
/** @param {string} userId @param {string} label @param {number} area */
const createCrop = async (userId, label, area, code = 'maize', plotId = plot) => (
  await queryAs(userId, "insert into public.farm_crops (business_id, plot_id, crop, crop_label, season, year, area_m2, sown_on) values ($1, $2, $3, $4, 'rainy', $5, $6, $7) returning id", [farm, plotId, code, label, year, area, day(-60)])
)[0].id

beforeAll(async () => {
  db = await createTestDatabase()
  alice = await createUser(db, 'alice@example.test')
  bob = await createUser(db, 'bob@example.test')
  carla = await createUser(db, 'carla@example.test')
  farm = (await queryAs(alice, "insert into public.businesses (name) values ('Ferme Awa') returning id"))[0].id
  await db.query("insert into public.business_members (business_id, user_id, role) values ($1, $2, 'staff')", [farm, carla])
  plot = (await queryAs(carla, "insert into public.farm_plots (business_id, name, location, area_m2, area_unit, tenure) values ($1, 'Champ derrière la maison', 'Koudougou', 20000, 'ha', 'owned') returning id", [farm]))[0].id
}, 60_000)

describe('agriculture : parcelles et cultures', () => {
  it('réserve parcelles et cultures aux membres et refuse une culture plus grande que sa parcelle', async () => {
    expect(await queryAs(bob, 'select id from public.farm_plots')).toEqual([])
    expect(await errorOf(queryAs(bob, "insert into public.farm_plots (business_id, name, area_m2) values ($1, 'Intrus', 100)", [farm]))).toMatch(/row-level security/)
    expect(await errorOf(createCrop(alice, 'Maïs trop grand', 30000))).toMatch(/dépasse celle de la parcelle/)
    expect(await errorOf(queryAs(alice, "insert into public.farm_crops (business_id, plot_id, crop, crop_label, season, year, area_m2) values ($1, $2, 'banane', 'Banane', 'rainy', 2026, 100)", [farm, plot]))).toMatch(/check constraint/)
    expect(await errorOf(queryAs(alice, 'update public.farm_crops set stock_kg = 999'))).toMatch(/permission denied/)
  })
})

describe('agriculture : journal et stock de récolte', () => {
  it('convertit les récoltes en kg, tient le stock et refuse un stock négatif', async () => {
    const maize = await createCrop(alice, 'Maïs', 15000)
    await record(carla, maize, 'harvest', { quantity: 20, unit: 'sac', unitKg: 100 })
    await record(carla, maize, 'harvest', { quantity: 0.5, unit: 'tonne' })
    expect(await crop(maize)).toEqual({ harvested: 2500, stock: 2500 })
    await record(carla, maize, 'sale', { quantity: 1200, unit: 'kg', amount: 240000 })
    await record(carla, maize, 'consumption', { quantity: 3, unit: 'sac', unitKg: 100 })
    const loss = await record(carla, maize, 'loss', { quantity: 50, amount: 999 })
    expect(Number(loss.amount)).toBe(0) // une perte n’a pas de montant
    expect(await crop(maize)).toEqual({ harvested: 2500, stock: 950 })
    expect(await errorOf(record(carla, maize, 'sale', { quantity: 1000, amount: 1 }))).toMatch(/Stock de récolte insuffisant pour « Maïs » : il reste 950 kg/)
    expect(await errorOf(record(carla, maize, 'harvest', { quantity: 2, unit: 'sac' }))).toMatch(/poids d’un sac/)
    expect(await errorOf(record(carla, maize, 'harvest', { quantity: 2, unit: 'botte' }))).toMatch(/Unité de récolte inconnue/)
    expect(await errorOf(record(carla, maize, 'work'))).toMatch(/type de travail/)
    expect(await errorOf(record(carla, maize, 'rental'))).toMatch(/montant/)
    expect(await errorOf(record(carla, maize, 'harvest', { quantity: 1, on: day(2) }))).toMatch(/futur/)
    expect(await errorOf(record(bob, maize, 'harvest', { quantity: 1 }))).toMatch(/Accès refusé/)
    expect(await errorOf(queryAs(alice, "insert into public.farm_operations (business_id, crop_id, kind, occurred_on, created_by) values ($1, $2, 'harvest', current_date, $3)", [farm, maize, alice]))).toMatch(/permission denied/)
  })

  it('annule une opération (propriétaire) sans laisser le stock devenir négatif ; une culture clôturée ne garde que les sorties', async () => {
    const sorghum = await createCrop(alice, 'Sorgho', 5000, 'sorghum')
    const harvest = await record(alice, sorghum, 'harvest', { quantity: 800 })
    const sale = await record(alice, sorghum, 'sale', { quantity: 500, amount: 100000 })
    expect(await errorOf(queryAs(carla, 'select * from public.cancel_farm_operation($1, $2, null)', [farm, sale.id]))).toMatch(/Seul le propriétaire/)
    expect(await errorOf(queryAs(alice, 'select * from public.cancel_farm_operation($1, $2, null)', [farm, harvest.id]))).toMatch(/déjà sortie du stock/)
    await queryAs(alice, 'select * from public.cancel_farm_operation($1, $2, $3)', [farm, sale.id, 'Erreur'])
    expect(await crop(sorghum)).toEqual({ harvested: 800, stock: 800 })
    await queryAs(alice, "update public.farm_crops set status = 'closed' where id = $1", [sorghum])
    expect(await errorOf(record(alice, sorghum, 'harvest', { quantity: 1 }))).toMatch(/clôturée/)
    await record(alice, sorghum, 'sale', { quantity: 100, amount: 20000 })
    expect(await crop(sorghum)).toEqual({ harvested: 800, stock: 700 })
  })
})

describe('agriculture : travaux prévus et résultats', () => {
  it('un travail prévu fait entre au journal avec sa main-d’œuvre', async () => {
    const onion = await createCrop(alice, 'Oignon', 2500, 'onion')
    const [task] = await queryAs(carla, "insert into public.farm_tasks (business_id, crop_id, work_type, label, due_on) values ($1, $2, 'weeding', 'Deuxième sarclage', $3) returning id", [farm, onion, day(-1)])
    const [done] = await queryAs(carla, 'select * from public.complete_farm_task($1, $2, $3, 7500)', [farm, task.id, day(0)])
    expect(done).toMatchObject({ status: 'done' })
    const [operation] = await queryAs(carla, 'select kind, work_type, label, amount from public.farm_operations where id = $1', [done.operation_id])
    expect(operation).toEqual({ kind: 'work', work_type: 'weeding', label: 'Deuxième sarclage', amount: 7500 })
    expect(await errorOf(queryAs(carla, 'select * from public.complete_farm_task($1, $2, null, 0)', [farm, task.id]))).toMatch(/n’est plus prévu/)
    expect(await errorOf(queryAs(bob, "insert into public.farm_tasks (business_id, crop_id, work_type, due_on) values ($1, $2, 'weeding', current_date)", [farm, onion]))).toMatch(/row-level security/)
  })

  it('calcule rendement, coûts, ventes, stock et marge estimée par culture', async () => {
    // 1,5 ha de niébé : 1 800 kg récoltés → 1 200 kg/ha.
    const cowpea = await createCrop(alice, 'Niébé', 15000, 'cowpea')
    await record(alice, cowpea, 'input', { input: 'seed', label: 'Semences améliorées', quantity: 30, unit: 'kg', amount: 30000 })
    await record(alice, cowpea, 'input', { input: 'fertilizer', label: 'NPK 14-23-14', quantity: 2, unit: 'sac', amount: 36000 })
    await record(alice, cowpea, 'work', { work: 'soil_prep', amount: 25000 })
    await record(alice, cowpea, 'work', { work: 'weeding', amount: 15000 })
    await record(alice, cowpea, 'rental', { amount: 20000, label: 'Charrue' })
    await record(alice, cowpea, 'expense', { amount: 5000, label: 'Transport' })
    await record(alice, cowpea, 'harvest', { quantity: 18, unit: 'sac', unitKg: 100 })
    await record(alice, cowpea, 'sale', { quantity: 1000, amount: 400000 })
    await record(alice, cowpea, 'consumption', { quantity: 150 })
    await record(alice, cowpea, 'loss', { quantity: 50 })
    const cancelled = await record(alice, cowpea, 'expense', { amount: 99999 })
    await queryAs(alice, 'select * from public.cancel_farm_operation($1, $2, null)', [farm, cancelled.id])

    const rows = await queryAs(carla, 'select * from public.farm_crop_results($1, $2)', [farm, year])
    const row = rows.find((item) => item.crop_id === cowpea)
    // Coûts : 30 000 + 36 000 + 25 000 + 15 000 + 20 000 + 5 000 = 131 000 ; marge : 400 000 − 131 000 = 269 000.
    expect({ ...row, harvested_kg: Number(row.harvested_kg), sold_kg: Number(row.sold_kg), consumed_kg: Number(row.consumed_kg), lost_kg: Number(row.lost_kg), stock_kg: Number(row.stock_kg) }).toMatchObject({
      crop: 'cowpea', crop_label: 'Niébé', plot_name: 'Champ derrière la maison', season: 'rainy', area_m2: 15000,
      harvested_kg: 1800, yield_kg_per_ha: 1200, sold_kg: 1000, consumed_kg: 150, lost_kg: 50, stock_kg: 600,
      input_cost: 66000, labour_cost: 40000, rental_cost: 20000, other_cost: 5000, total_cost: 131000, sales_revenue: 400000, estimated_margin: 269000,
    })
    expect(await queryAs(alice, 'select * from public.farm_crop_results($1, $2)', [farm, year - 1])).toEqual([])
    expect(await errorOf(queryAs(bob, 'select * from public.farm_crop_results($1, $2)', [farm, year]))).toMatch(/Accès refusé/)
  })
})
