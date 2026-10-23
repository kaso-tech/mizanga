// @vitest-environment node
// Élevage : lots, animaux, journal, santé et résultats, avec des chiffres vérifiables à la main.
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createTestDatabase, createUser, errorOf } from './database.mjs'

/** @type {import('@electric-sql/pglite').PGlite} */
let db
let alice = ''
let bob = ''
let carla = ''
let farm = ''

/** @param {string} userId @param {string} sql @param {unknown[]} [params] */
const queryAs = (userId, sql, params = []) => asUser(db, userId, async () => /** @type {any[]} */ ((await db.query(sql, params)).rows))
const day = (/** @type {number} */ offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
/** @param {string} userId @param {string} herd @param {string} kind @param {{ quantity?: number, amount?: number, on?: string, cause?: string, animalId?: string, animal?: object }} [values] */
const record = async (userId, herd, kind, { quantity = 0, amount = 0, on = day(0), cause, animalId, animal } = {}) => (
  await queryAs(userId, 'select * from public.record_livestock_event($1, $2, $3, $4, $5, $6, $7, null, $8, $9::jsonb)', [farm, herd, kind, quantity, amount, on, cause ?? null, animalId ?? null, animal ? JSON.stringify(animal) : null])
)[0]
const headcount = async (/** @type {string} */ herd) => Number((await db.query('select headcount from public.livestock_herds where id = $1', [herd])).rows.map((/** @type {any} */ row) => row.headcount)[0])
const createHerd = async (/** @type {string} */ userId, /** @type {string} */ name, species = 'poultry', tracking = 'group', initial = 0, started = day(0)) => (
  await queryAs(userId, 'select * from public.create_herd($1, $2, $3, $4, $5, $6, null)', [farm, name, species, tracking, initial, started])
)[0]

beforeAll(async () => {
  db = await createTestDatabase()
  alice = await createUser(db, 'alice@example.test')
  bob = await createUser(db, 'bob@example.test')
  carla = await createUser(db, 'carla@example.test')
  farm = (await queryAs(alice, "insert into public.businesses (name) values ('Ferme Awa') returning id"))[0].id
  await db.query("insert into public.business_members (business_id, user_id, role) values ($1, $2, 'staff')", [farm, carla])
}, 60_000)

describe('élevage : lots et journal', () => {
  it('crée un lot avec son effectif de départ et refuse les valeurs invalides', async () => {
    const herd = await createHerd(alice, 'Poulets de chair — bande 1', 'poultry', 'group', 100, day(-30))
    expect(herd).toMatchObject({ name: 'Poulets de chair — bande 1', species: 'poultry', tracking: 'group', headcount: 100 })
    const [start] = await queryAs(alice, 'select kind, quantity, headcount_delta, occurred_on::text as on from public.livestock_events where herd_id = $1', [herd.id])
    expect(start).toEqual({ kind: 'start', quantity: 100, headcount_delta: 100, on: day(-30) })
    expect(await errorOf(createHerd(alice, 'X', 'chameau'))).toMatch(/Choisissez une espèce/)
    expect(await errorOf(createHerd(alice, 'Bovins', 'cattle', 'individual', 5))).toMatch(/chaque animal avec son numéro/)
    expect(await errorOf(createHerd(alice, 'Futur', 'pig', 'group', 0, day(3)))).toMatch(/futur/)
    expect(await errorOf(createHerd(bob, 'Intrus'))).toMatch(/Accès refusé/)
  })

  it('tient l’effectif à jour : naissances, achats, ventes, morts et inventaire ; jamais négatif', async () => {
    const herd = await createHerd(alice, 'Chèvres', 'small_ruminant', 'group', 10)
    await record(carla, herd.id, 'birth', { quantity: 3 })
    await record(carla, herd.id, 'purchase', { quantity: 2, amount: 50000 })
    await record(carla, herd.id, 'sale', { quantity: 4, amount: 140000 })
    await record(carla, herd.id, 'death', { quantity: 1, cause: 'Diarrhée', amount: 999 })
    expect(await headcount(herd.id)).toBe(10)
    const death = (await queryAs(alice, "select amount, cause from public.livestock_events where herd_id = $1 and kind = 'death'", [herd.id]))[0]
    expect(death).toEqual({ amount: 0, cause: 'Diarrhée' }) // une mort n’a pas de montant
    await record(carla, herd.id, 'count', { quantity: 9 })
    expect(await headcount(herd.id)).toBe(9)
    expect(await errorOf(record(carla, herd.id, 'sale', { quantity: 10, amount: 1 }))).toMatch(/Effectif insuffisant dans « Chèvres » : il reste 9 animaux/)
    expect(await errorOf(record(carla, herd.id, 'feed'))).toMatch(/montant/)
    expect(await errorOf(record(carla, herd.id, 'birth', { quantity: 1, on: day(2) }))).toMatch(/futur/)
    expect(await errorOf(record(bob, herd.id, 'birth', { quantity: 1 }))).toMatch(/Accès refusé/)
    // Le journal ne s’écrit que par les fonctions contrôlées.
    expect(await errorOf(queryAs(alice, "update public.livestock_herds set headcount = 500 where id = $1", [herd.id]))).toMatch(/permission denied/)
    expect(await errorOf(queryAs(alice, "insert into public.livestock_events (business_id, herd_id, kind, occurred_on, created_by) values ($1, $2, 'birth', current_date, $3)", [farm, herd.id, alice]))).toMatch(/permission denied/)
  })

  it('suit les bovins un par un, par leur numéro', async () => {
    const herd = await createHerd(alice, 'Bovins', 'cattle', 'individual')
    const bought = await record(alice, herd.id, 'purchase', { amount: 350000, animal: { tag: 'BF-001', sex: 'female', name: 'Wênd-Kuni' } })
    await record(alice, herd.id, 'birth', { animal: { tag: 'BF-002', sex: 'male' } })
    expect(await headcount(herd.id)).toBe(2)
    expect(await errorOf(record(alice, herd.id, 'purchase', { animal: { tag: 'bf-001 ' } }))).toMatch(/« bf-001 » existe déjà/)
    expect(await errorOf(record(alice, herd.id, 'birth', { quantity: 1 }))).toMatch(/numéro de l’animal/)
    expect(await errorOf(record(alice, herd.id, 'count', { quantity: 5 }))).toMatch(/suivi individuel/)
    const animal = (await queryAs(alice, "select id from public.livestock_animals where herd_id = $1 and tag = 'BF-001'", [herd.id]))[0]
    expect(bought.animal_id).toBe(animal.id)
    const sale = await record(alice, herd.id, 'sale', { amount: 420000, animalId: animal.id })
    expect(await headcount(herd.id)).toBe(1)
    expect(await errorOf(record(alice, herd.id, 'death', { animalId: animal.id }))).toMatch(/n’est plus dans le lot/)
    // Annuler l’achat d’un animal vendu est refusé tant que la vente compte.
    expect(await errorOf(queryAs(alice, 'select * from public.cancel_livestock_event($1, $2, null)', [farm, bought.id]))).toMatch(/Annulez d’abord la vente/)
    await queryAs(alice, 'select * from public.cancel_livestock_event($1, $2, $3)', [farm, sale.id, 'Erreur de saisie'])
    expect(await headcount(herd.id)).toBe(2)
    expect((await queryAs(alice, 'select status from public.livestock_animals where id = $1', [animal.id]))[0].status).toBe('present')
  })

  it('réserve l’annulation au propriétaire', async () => {
    const herd = await createHerd(alice, 'Porcs', 'pig', 'group', 5)
    const death = await record(carla, herd.id, 'death', { quantity: 2 })
    expect(await errorOf(queryAs(carla, 'select * from public.cancel_livestock_event($1, $2, null)', [farm, death.id]))).toMatch(/Seul le propriétaire/)
    await queryAs(alice, 'select * from public.cancel_livestock_event($1, $2, null)', [farm, death.id])
    expect(await headcount(herd.id)).toBe(5)
    expect(await errorOf(queryAs(alice, 'select * from public.cancel_livestock_event($1, $2, null)', [farm, death.id]))).toMatch(/déjà annulé/)
  })
})

describe('élevage : santé et résultats', () => {
  it('enregistre les soins prévus et faits, réservés aux membres', async () => {
    const herd = await createHerd(alice, 'Pondeuses', 'poultry', 'group', 200, day(-60))
    const [planned] = await queryAs(carla, "insert into public.livestock_health (business_id, herd_id, kind, product, due_on) values ($1, $2, 'vaccination', 'Newcastle', $3) returning id, status, created_by", [farm, herd.id, day(-1)])
    expect(planned).toMatchObject({ status: 'planned', created_by: carla })
    await queryAs(carla, "update public.livestock_health set status = 'done', done_on = $2, cost = 12000 where id = $1", [planned.id, day(0)])
    expect(await errorOf(queryAs(carla, "insert into public.livestock_health (business_id, herd_id, kind, product) values ($1, $2, 'treatment', 'Vermifuge')", [farm, herd.id]))).toMatch(/check constraint/)
    expect(await errorOf(queryAs(bob, "insert into public.livestock_health (business_id, herd_id, kind, product, due_on) values ($1, $2, 'vaccination', 'X', current_date)", [farm, herd.id]))).toMatch(/row-level security/)
    expect(await queryAs(bob, 'select id from public.livestock_health')).toEqual([])
  })

  it('calcule effectifs, mortalité, coûts et marge par lot, au franc près', async () => {
    // Lot créé il y a 40 jours avec 500 poulets ; achats, aliment, morts et ventes sur les 30 derniers jours.
    const herd = await createHerd(alice, 'Bande test', 'poultry', 'group', 500, day(-40))
    await record(alice, herd.id, 'death', { quantity: 10, on: day(-35) }) // avant la période
    await record(alice, herd.id, 'purchase', { quantity: 10, amount: 15000, on: day(-20) })
    await record(alice, herd.id, 'death', { quantity: 12, on: day(-10), cause: 'Coccidiose (diagnostic du vétérinaire)' })
    await record(alice, herd.id, 'feed', { amount: 180000, on: day(-15) })
    await record(alice, herd.id, 'health', { amount: 7500, on: day(-12) })
    await record(alice, herd.id, 'expense', { amount: 5000, on: day(-5) })
    await record(alice, herd.id, 'sale', { quantity: 100, amount: 300000, on: day(-2) })
    await queryAs(alice, "insert into public.livestock_health (business_id, herd_id, kind, product, status, done_on, cost) values ($1, $2, 'vaccination', 'Gumboro', 'done', $3, 4500)", [farm, herd.id, day(-8)])
    const cancelled = await record(alice, herd.id, 'sale', { quantity: 5, amount: 15000, on: day(-1) })
    await queryAs(alice, 'select * from public.cancel_livestock_event($1, $2, null)', [farm, cancelled.id])

    const rows = await queryAs(carla, 'select * from public.livestock_summary($1, $2, $3)', [farm, day(-30), day(0)])
    const row = rows.find((item) => item.herd_id === herd.id)
    // Début : 500 − 10 = 490 ; entrées : 10 ; morts : 12 → mortalité 12 ÷ 500 = 2,4 %.
    // Coûts : 15 000 + 180 000 + (7 500 + 4 500) + 5 000 = 212 000 ; marge : 300 000 − 212 000 = 88 000.
    expect({ ...row, mortality_rate: Number(row.mortality_rate) }).toMatchObject({
      herd_name: 'Bande test', headcount: 388, opening_headcount: 490, closing_headcount: 388, births: 0, purchases: 10, sales: 100, deaths: 12,
      mortality_rate: 2.4, purchase_cost: 15000, feed_cost: 180000, health_cost: 12000, other_cost: 5000, total_cost: 212000, sales_revenue: 300000, estimated_margin: 88000,
    })
    // Lot créé pendant la période : son effectif de départ compte au début.
    const recent = (await queryAs(alice, 'select * from public.livestock_summary($1, $2, $3)', [farm, day(-45), day(0)])).find((item) => item.herd_id === herd.id)
    expect(recent).toMatchObject({ opening_headcount: 500, deaths: 22 })
    expect(Number(recent.mortality_rate)).toBe(4.3) // 22 ÷ 510
    expect(await errorOf(queryAs(bob, 'select * from public.livestock_summary($1, $2, $3)', [farm, day(-30), day(0)]))).toMatch(/Accès refusé/)
    expect(await errorOf(queryAs(alice, 'select * from public.livestock_summary($1, $2, $3)', [farm, day(0), day(-1)]))).toMatch(/Période invalide/)
  })
})
