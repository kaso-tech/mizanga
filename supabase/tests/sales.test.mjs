// @vitest-environment node
// Étape 4 : ventes, dépenses et calculs, avec des montants exacts vérifiables à la main.
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createTestDatabase, createUser, errorOf } from './database.mjs'

/** @type {import('@electric-sql/pglite').PGlite} */
let db
let alice = ''
let bob = ''
let carla = ''
let shop = ''
let rice = ''
let sugar = ''

/** @param {string} userId @param {string} sql @param {unknown[]} [params] */
const queryAs = (userId, sql, params = []) => asUser(db, userId, async () => /** @type {any[]} */ ((await db.query(sql, params)).rows))
/** @param {string} userId @param {Array<Record<string, unknown>>} items @param {string | null} [customer] */
const sell = async (userId, items, customer = null) => (await queryAs(userId, 'select * from public.record_sale($1, $2::jsonb, $3, null)', [shop, JSON.stringify(items), customer]))[0]
/** @param {string} userId @param {string} start @param {string} end */
const summary = async (userId, start, end, business = shop) => (await queryAs(userId, 'select * from public.business_summary($1, $2, $3)', [business, start, end]))[0]
const stockOf = async (/** @type {string} */ productId) => Number((await db.query('select quantity from public.products where id = $1', [productId])).rows.map((/** @type {any} */ row) => row.quantity)[0])
/** Date locale du jour au format AAAA-MM-JJ (fuseau UTC, comme Ouagadougou). */
const today = () => new Date().toISOString().slice(0, 10)
const dayOffset = (/** @type {number} */ days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

beforeAll(async () => {
  db = await createTestDatabase()
  alice = await createUser(db, 'alice@example.test')
  bob = await createUser(db, 'bob@example.test')
  carla = await createUser(db, 'carla@example.test')
  shop = (await queryAs(alice, "insert into public.businesses (name) values ('Boutique Awa') returning id"))[0].id
  await db.query("insert into public.business_members (business_id, user_id, role) values ($1, $2, 'staff')", [shop, carla])
  rice = (await queryAs(alice, "select id from public.create_product($1, 'Riz 25 kg', 'sac', 15000, 17500, 2, 10)", [shop]))[0].id
  sugar = (await queryAs(alice, "select id from public.create_product($1, 'Sucre', 'kg', 600, 800, 0, 20)", [shop]))[0].id
}, 60_000)

describe('ventes', () => {
  it('enregistre une vente à plusieurs lignes, avec les totaux exacts et le stock diminué', async () => {
    // 2 sacs au prix catalogue (17 500) + 1,5 kg de sucre vendu 900 au lieu de 800.
    const sale = await sell(carla, [{ product_id: rice, quantity: 2 }, { product_id: sugar, quantity: 1.5, unit_price: 900 }], 'Mariam')
    expect(sale).toMatchObject({ total_amount: 36350, total_cost: 30900, status: 'completed', customer_name: 'Mariam', created_by: carla })
    const items = await queryAs(alice, 'select product_id, quantity, unit_price, unit_cost, line_total, line_cost from public.sale_items where sale_id = $1 order by line_total desc', [sale.id])
    expect(items).toEqual([
      { product_id: rice, quantity: '2.000', unit_price: 17500, unit_cost: 15000, line_total: 35000, line_cost: 30000 },
      { product_id: sugar, quantity: '1.500', unit_price: 900, unit_cost: 600, line_total: 1350, line_cost: 900 },
    ])
    expect(await stockOf(rice)).toBe(8)
    expect(await stockOf(sugar)).toBe(18.5)
    const movements = await queryAs(alice, "select product_id, quantity_delta, unit_cost from public.stock_movements where sale_id = $1 and kind = 'sale' order by unit_cost desc", [sale.id])
    expect(movements).toEqual([{ product_id: rice, quantity_delta: '-2.000', unit_cost: 15000 }, { product_id: sugar, quantity_delta: '-1.500', unit_cost: 600 }])
  })

  it('arrondit au franc les lignes en quantité décimale', async () => {
    // 0,333 kg × 800 = 266,4 → 266 ; coût 0,333 × 600 = 199,8 → 200.
    const sale = await sell(alice, [{ product_id: sugar, quantity: 0.333 }])
    expect(sale).toMatchObject({ total_amount: 266, total_cost: 200 })
  })

  it('n’écrit rien si une ligne est impossible (stock insuffisant, doublon, produit archivé)', async () => {
    const salesBefore = (await db.query('select count(*)::int as n from public.sales')).rows
    expect(await errorOf(sell(alice, [{ product_id: sugar, quantity: 1 }, { product_id: rice, quantity: 50 }]))).toBe('Stock insuffisant pour « Riz 25 kg » : il reste 8 sac.')
    expect(await errorOf(sell(alice, [{ product_id: sugar, quantity: 1 }, { product_id: sugar, quantity: 2 }]))).toBe('Un même produit apparaît deux fois : regroupez les quantités.')
    expect(await errorOf(sell(alice, []))).toBe('Ajoutez au moins un produit à la vente.')
    expect(await errorOf(sell(alice, [{ product_id: sugar, quantity: 0 }]))).toBe('Chaque quantité doit être un nombre positif (trois décimales au plus).')
    expect(await errorOf(sell(alice, [{ product_id: sugar, quantity: 1, unit_price: -5 }]))).toBe('Un prix ne peut pas être négatif.')
    expect((await db.query('select count(*)::int as n from public.sales')).rows).toEqual(salesBefore)
    expect(await stockOf(sugar)).toBe(18.167)

    const old = (await queryAs(alice, "select id from public.create_product($1, 'Ancien', 'unité', 1, 2, 0, 5)", [shop]))[0].id
    await queryAs(alice, 'update public.products set archived = true where id = $1', [old])
    expect(await errorOf(sell(alice, [{ product_id: old, quantity: 1 }]))).toBe('Le produit « Ancien » est archivé.')
  })

  it('isole les commerçants : ni vente ni annulation chez un autre', async () => {
    expect(await errorOf(sell(bob, [{ product_id: rice, quantity: 1 }]))).toBe('Accès refusé à cette entreprise.')
    const [sale] = await queryAs(alice, 'select id from public.sales limit 1')
    expect(await errorOf(queryAs(bob, 'select public.cancel_sale($1, $2)', [shop, sale.id]))).toBe('Seul le propriétaire peut annuler une vente.')
    expect(await errorOf(summary(bob, today(), today()))).toBe('Accès refusé à cette entreprise.')
    expect(await errorOf(queryAs(bob, 'select * from public.business_product_sales($1, $2, $3)', [shop, today(), today()]))).toBe('Accès refusé à cette entreprise.')
  })

  it('annule une vente (propriétaire seulement) et rétablit le stock', async () => {
    const sale = await sell(alice, [{ product_id: rice, quantity: 1 }])
    expect(await stockOf(rice)).toBe(7)
    expect(await errorOf(queryAs(carla, 'select public.cancel_sale($1, $2)', [shop, sale.id]))).toBe('Seul le propriétaire peut annuler une vente.')
    const [cancelled] = await queryAs(alice, "select * from public.cancel_sale($1, $2, 'Erreur de saisie')", [shop, sale.id])
    expect(cancelled.status).toBe('cancelled')
    expect(await stockOf(rice)).toBe(8)
    expect(await queryAs(alice, "select quantity_delta, note from public.stock_movements where sale_id = $1 and kind = 'sale_cancelled'", [sale.id])).toEqual([{ quantity_delta: '1.000', note: 'Erreur de saisie' }])
    expect(await errorOf(queryAs(alice, 'select public.cancel_sale($1, $2)', [shop, sale.id]))).toBe('Cette vente est déjà annulée.')
  })
})

describe('dépenses et résultats', () => {
  it('enregistre une dépense datée du jour local, refuse le futur et les montants nuls', async () => {
    const [expense] = await queryAs(carla, "select * from public.record_expense($1, 5000, 'Transport', 'Taxi-moto', $2)", [shop, today()])
    expect(expense).toMatchObject({ amount: 5000, category: 'Transport', description: 'Taxi-moto', created_by: carla })
    expect(new Date(expense.spent_at).toISOString()).toBe(`${today()}T12:00:00.000Z`)
    await queryAs(alice, "select public.record_expense($1, 1500, 'Électricité')", [shop])
    expect(await errorOf(queryAs(alice, "select public.record_expense($1, 100, 'Transport', null, $2)", [shop, dayOffset(2)]))).toBe('La date de la dépense ne peut pas être dans le futur.')
    expect(await errorOf(queryAs(alice, "select public.record_expense($1, 100, '  ')", [shop]))).toBe('Choisissez une catégorie.')
  })

  it('calcule le résumé du jour sans les ventes annulées', async () => {
    // Ventes valides : 36 350 + 266 = 36 616 ; coûts : 30 900 + 200 = 31 100 ; dépenses : 5 000 + 1 500.
    expect(await summary(alice, today(), today())).toEqual({
      revenue: 36616,
      cost_of_goods_sold: 31100,
      gross_margin: 5516,
      expenses: 6500,
      estimated_result: -984,
      sales_count: 2,
      cancelled_sales_count: 1,
    })
  })

  it('respecte les bornes de la période', async () => {
    const sale = await sell(alice, [{ product_id: sugar, quantity: 1 }])
    await db.query("update public.sales set sold_at = now() - interval '3 days' where id = $1", [sale.id])
    expect((await summary(alice, today(), today())).revenue).toBe(36616)
    expect((await summary(alice, dayOffset(-3), today())).revenue).toBe(36616 + 800)
    expect(await errorOf(summary(alice, today(), dayOffset(-1)))).toBe('Période invalide (366 jours au plus).')
    expect(await errorOf(summary(alice, '2025-01-01', '2026-12-31'))).toBe('Période invalide (366 jours au plus).')
  })

  it('compte les jours selon le fuseau horaire de l’entreprise', async () => {
    // Second commerce d’Alice, créé par l’administrateur (la formule « test » n’en permet qu’un).
    const lagos = (await db.query("insert into public.businesses (name, timezone, created_by) values ('Boutique de Lagos', 'Africa/Lagos', $1) returning id", [alice])).rows.map((/** @type {any} */ row) => row.id)[0]
    const item = (await queryAs(alice, "select id from public.create_product($1, 'Pain', 'unité', 100, 150, 0, 10)", [lagos]))[0].id
    const [sale] = await queryAs(alice, 'select * from public.record_sale($1, $2::jsonb)', [lagos, JSON.stringify([{ product_id: item, quantity: 1 }])])
    // 23 h 30 UTC le 10 mars = 0 h 30 le 11 mars à Lagos (UTC+1).
    await db.query("update public.sales set sold_at = '2026-03-10 23:30:00+00' where id = $1", [sale.id])
    expect((await summary(alice, '2026-03-10', '2026-03-10', lagos)).revenue).toBe(0)
    expect((await summary(alice, '2026-03-11', '2026-03-11', lagos)).revenue).toBe(150)
  })

  it('détaille les ventes par produit', async () => {
    expect(await queryAs(alice, 'select product_name, unit, quantity, revenue, cost, gross_margin from public.business_product_sales($1, $2, $3)', [shop, today(), today()])).toEqual([
      { product_name: 'Riz 25 kg', unit: 'sac', quantity: '2.000', revenue: 35000, cost: 30000, gross_margin: 5000 },
      { product_name: 'Sucre', unit: 'kg', quantity: '1.833', revenue: 1616, cost: 1100, gross_margin: 516 },
    ])
  })

  it('liste les ventes et les dépenses de la période, au format attendu par l’interface', async () => {
    const [{ sales }] = await queryAs(alice, 'select public.list_sales($1, $2, $3) as sales', [shop, today(), today()])
    expect(sales).toHaveLength(3)
    const first = sales.find((/** @type {any} */ sale) => sale.customerName === 'Mariam')
    expect(first).toMatchObject({ status: 'completed', totalAmount: 36350, totalCost: 30900 })
    expect(first.items).toEqual([
      { productId: rice, productName: 'Riz 25 kg', unit: 'sac', quantity: 2, unitPrice: 17500, lineTotal: 35000 },
      { productId: sugar, productName: 'Sucre', unit: 'kg', quantity: 1.5, unitPrice: 900, lineTotal: 1350 },
    ])
    expect(sales.filter((/** @type {any} */ sale) => sale.status === 'cancelled')).toHaveLength(1)

    const [{ expenses }] = await queryAs(carla, 'select public.list_expenses($1, $2, $3) as expenses', [shop, today(), today()])
    expect(expenses.map((/** @type {any} */ expense) => [expense.category, expense.amount]).sort()).toEqual([['Transport', 5000], ['Électricité', 1500]])
    expect(await errorOf(queryAs(bob, 'select public.list_sales($1, $2, $3)', [shop, today(), today()]))).toBe('Accès refusé à cette entreprise.')
    expect(await errorOf(queryAs(bob, 'select public.list_expenses($1, $2, $3)', [shop, today(), today()]))).toBe('Accès refusé à cette entreprise.')
  })
})
