// @vitest-environment node
// Adresses /api/business/* de bout en bout : serveur de Gilli → base PostgreSQL (PGlite) avec RLS et fonctions.
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiHandler } from '../../server/chat-handler.mjs'
import { createTestDatabase, createUser } from './database.mjs'
import { createPgliteBusinessStore } from './pglite-store.mjs'

/** @type {import('node:http').Server} */
let server
let base = ''
/** @type {Record<string, { id: string, email: string }>} */
const tokens = {}

beforeAll(async () => {
  const db = await createTestDatabase()
  tokens['jeton-alice'] = { id: await createUser(db, 'alice@example.test'), email: 'alice@example.test' }
  tokens['jeton-bob'] = { id: await createUser(db, 'bob@example.test'), email: 'bob@example.test' }
  const handler = createApiHandler({ verifyToken: async (token) => tokens[token] ?? null, businessStore: createPgliteBusinessStore(db) })
  server = createServer((req, res) => void handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
}, 60_000)
afterAll(() => server.close())

/** @param {string} token @param {string} method @param {string} path @param {unknown} [body] */
async function call(token, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: /** @type {any} */ (await response.json()) }
}

describe('espace Business : produits et stocks', () => {
  /** @type {string} */
  let shop
  /** @type {string} */
  let rice

  it('exige une connexion valide', async () => {
    expect((await call('', 'GET', '/api/business')).status).toBe(401)
    expect((await call('jeton-inconnu', 'GET', '/api/business')).status).toBe(401)
  })

  it('crée l’entreprise du commerçant, avec XOF et le Burkina Faso par défaut', async () => {
    expect((await call('jeton-alice', 'GET', '/api/business')).body).toEqual({ businesses: [] })
    const created = await call('jeton-alice', 'POST', '/api/business', { name: '  Boutique Awa ' })
    expect(created.status).toBe(201)
    expect(created.body.business).toMatchObject({ name: 'Boutique Awa', currency: 'XOF', countryCode: 'BF', timezone: 'Africa/Ouagadougou', role: 'owner' })
    shop = created.body.business.id
    expect((await call('jeton-alice', 'GET', '/api/business')).body.businesses).toHaveLength(1)
    expect((await call('jeton-alice', 'POST', '/api/business', { name: '' })).status).toBe(422)
  })

  it('crée un produit avec son stock initial, et refuse les données invalides', async () => {
    const created = await call('jeton-alice', 'POST', `/api/business/${shop}/products`, { name: 'Riz 25 kg', unit: 'sac', purchasePrice: 15000, salePrice: 17500, alertThreshold: 3, initialQuantity: 10 })
    expect(created.status).toBe(201)
    expect(created.body.product).toMatchObject({ name: 'Riz 25 kg', unit: 'sac', quantity: 10, purchasePrice: 15000, salePrice: 17500, alertThreshold: 3, archived: false })
    rice = created.body.product.id
    expect((await call('jeton-alice', 'POST', `/api/business/${shop}/products`, { name: 'X', salePrice: 12.5 })).body).toEqual({ error: 'Le prix de vente doit être un montant entier positif.' })
    expect((await call('jeton-alice', 'POST', `/api/business/${shop}/products`, { name: 'X', initialQuantity: 1.2345 })).status).toBe(422)
  })

  it('enregistre les mouvements et refuse un stock négatif', async () => {
    const purchase = await call('jeton-alice', 'POST', `/api/business/${shop}/products/${rice}/movements`, { kind: 'purchase', quantity: 5, unitCost: 14500, note: 'Grossiste' })
    expect(purchase.status).toBe(201)
    expect(purchase.body.movement).toMatchObject({ kind: 'purchase', quantityDelta: 5, unitCost: 14500, note: 'Grossiste' })
    await call('jeton-alice', 'POST', `/api/business/${shop}/products/${rice}/movements`, { kind: 'loss', quantity: 1 })
    const tooMuch = await call('jeton-alice', 'POST', `/api/business/${shop}/products/${rice}/movements`, { kind: 'loss', quantity: 100 })
    expect(tooMuch).toEqual({ status: 409, body: { error: 'Stock insuffisant : il reste 14 sac.' } })
    expect((await call('jeton-alice', 'POST', `/api/business/${shop}/products/${rice}/movements`, { kind: 'sale', quantity: 1 })).status).toBe(422)

    const { body } = await call('jeton-alice', 'GET', `/api/business/${shop}/products`)
    expect(body.products[0].quantity).toBe(14)
    const history = await call('jeton-alice', 'GET', `/api/business/${shop}/products/${rice}/movements`)
    expect(history.body.movements.map((/** @type {any} */ movement) => [movement.kind, movement.quantityDelta])).toEqual([['loss', -1], ['purchase', 5], ['initial', 10]])
  })

  it('modifie et archive un produit sans jamais toucher au stock', async () => {
    const updated = await call('jeton-alice', 'PATCH', `/api/business/${shop}/products/${rice}`, { salePrice: 18000, alertThreshold: 5, quantity: 999 })
    expect(updated.body.product).toMatchObject({ salePrice: 18000, alertThreshold: 5, quantity: 14 })
    await call('jeton-alice', 'PATCH', `/api/business/${shop}/products/${rice}`, { archived: true })
    expect((await call('jeton-alice', 'GET', `/api/business/${shop}/products`)).body.products).toEqual([])
    expect((await call('jeton-alice', 'GET', `/api/business/${shop}/products?archived=1`)).body.products).toHaveLength(1)
    expect((await call('jeton-alice', 'POST', `/api/business/${shop}/products/${rice}/movements`, { kind: 'purchase', quantity: 1 })).body).toEqual({ error: 'Ce produit est archivé.' })
    await call('jeton-alice', 'PATCH', `/api/business/${shop}/products/${rice}`, { archived: false })
  })

  it('isole les commerçants : Bob ne voit ni ne modifie rien chez Alice', async () => {
    expect((await call('jeton-bob', 'GET', '/api/business')).body).toEqual({ businesses: [] })
    expect((await call('jeton-bob', 'GET', `/api/business/${shop}/products`)).body).toEqual({ products: [] })
    expect((await call('jeton-bob', 'GET', `/api/business/${shop}/products/${rice}/movements`)).body).toEqual({ movements: [] })
    expect((await call('jeton-bob', 'POST', `/api/business/${shop}/products`, { name: 'Intrus' })).status).toBe(403)
    expect((await call('jeton-bob', 'PATCH', `/api/business/${shop}/products/${rice}`, { salePrice: 1 })).status).toBe(404)
    expect((await call('jeton-bob', 'POST', `/api/business/${shop}/products/${rice}/movements`, { kind: 'loss', quantity: 1 })).status).toBe(403)
    expect((await call('jeton-alice', 'GET', `/api/business/${shop}/products`)).body.products[0]).toMatchObject({ salePrice: 18000, quantity: 14 })
  })

  it('donne la formule du commerce (Gratuit) et limite le nombre de commerces', async () => {
    const { body } = await call('jeton-alice', 'GET', `/api/business/${shop}/subscription`)
    expect(body.subscription).toMatchObject({ planId: 'test', planName: 'Gratuit', isTest: false, status: 'test', monthlyPrice: 0, dailyAiRequests: 30, maxBusinesses: 1, maxListings: 5, maxPhotos: 3 })
    expect((await call('jeton-bob', 'GET', `/api/business/${shop}/subscription`)).status).toBe(403)
    expect(await call('jeton-alice', 'POST', '/api/business', { name: 'Deuxième boutique' })).toEqual({ status: 409, body: { error: 'Votre formule permet 1 commerce(s) : vous avez atteint cette limite.' } })
  })

  it('refuse les adresses mal formées', async () => {
    expect((await call('jeton-alice', 'GET', '/api/business/pas-un-uuid/products')).status).toBe(404)
    expect((await call('jeton-alice', 'DELETE', `/api/business/${shop}/products`)).status).toBe(404)
  })

  it('enregistre ventes et dépenses et calcule le résultat estimé de la période', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const sold = await call('jeton-alice', 'POST', `/api/business/${shop}/sales`, { items: [{ productId: rice, quantity: 2 }, { productId: rice, quantity: 1 }] })
    expect(sold).toEqual({ status: 422, body: { error: 'Un même produit apparaît deux fois : regroupez les quantités.' } })
    const sale = await call('jeton-alice', 'POST', `/api/business/${shop}/sales`, { items: [{ productId: rice, quantity: 2, unitPrice: 17000 }], customerName: 'Mariam' })
    expect(sale.status).toBe(201)
    expect(sale.body.sale).toMatchObject({ status: 'completed', totalAmount: 34000, totalCost: 30000, customerName: 'Mariam' })
    expect((await call('jeton-alice', 'GET', `/api/business/${shop}/products`)).body.products[0].quantity).toBe(12)

    expect((await call('jeton-alice', 'POST', `/api/business/${shop}/expenses`, { amount: 2500, category: 'Transport', spentOn: today })).status).toBe(201)
    expect((await call('jeton-alice', 'POST', `/api/business/${shop}/expenses`, { amount: 0, category: 'Transport' })).body).toEqual({ error: 'Le montant doit être positif.' })

    const result = await call('jeton-alice', 'GET', `/api/business/${shop}/summary?from=${today}&to=${today}`)
    expect(result.body.summary).toEqual({ revenue: 34000, costOfGoodsSold: 30000, grossMargin: 4000, expenses: 2500, estimatedResult: 1500, salesCount: 1, cancelledSalesCount: 0 })
    expect(result.body.products).toEqual([{ productId: rice, productName: 'Riz 25 kg', unit: 'sac', quantity: 2, revenue: 34000, cost: 30000, grossMargin: 4000 }])

    const sales = await call('jeton-alice', 'GET', `/api/business/${shop}/sales?from=${today}&to=${today}`)
    expect(sales.body.sales[0].items).toEqual([{ productId: rice, productName: 'Riz 25 kg', unit: 'sac', quantity: 2, unitPrice: 17000, lineTotal: 34000 }])

    const cancelled = await call('jeton-alice', 'POST', `/api/business/${shop}/sales/${sale.body.sale.id}/cancel`, { reason: 'Erreur' })
    expect(cancelled.body.sale.status).toBe('cancelled')
    expect((await call('jeton-alice', 'GET', `/api/business/${shop}/summary?from=${today}&to=${today}`)).body.summary).toMatchObject({ revenue: 0, estimatedResult: -2500, cancelledSalesCount: 1 })
    expect((await call('jeton-alice', 'GET', `/api/business/${shop}/products`)).body.products[0].quantity).toBe(14)

    const expenses = await call('jeton-alice', 'GET', `/api/business/${shop}/expenses?from=${today}&to=${today}`)
    expect(expenses.body.expenses).toHaveLength(1)
    expect((await call('jeton-bob', 'DELETE', `/api/business/${shop}/expenses/${expenses.body.expenses[0].id}`)).status).toBe(403)
    expect((await call('jeton-alice', 'DELETE', `/api/business/${shop}/expenses/${expenses.body.expenses[0].id}`)).body).toEqual({ deleted: true })

    expect((await call('jeton-alice', 'GET', `/api/business/${shop}/summary?from=${today}`)).status).toBe(422)
    expect((await call('jeton-alice', 'GET', `/api/business/${shop}/summary?from=2026-02-30&to=2026-03-01`)).body).toEqual({ error: 'La date de début n’existe pas.' })
    expect((await call('jeton-bob', 'GET', `/api/business/${shop}/summary?from=${today}&to=${today}`)).status).toBe(403)
    expect((await call('jeton-bob', 'POST', `/api/business/${shop}/sales`, { items: [{ productId: rice, quantity: 1 }] })).status).toBe(403)
  })

  it('limite les demandes par compte : des commerçants derrière la même adresse ne se bloquent pas', async () => {
    const statuses = []
    for (let index = 0; index < 121; index += 1) statuses.push((await call('jeton-alice', 'GET', '/api/business')).status)
    expect(statuses.at(-1)).toBe(429)
    expect(statuses.filter((status) => status === 200).length).toBeLessThanOrEqual(120)
    expect((await call('jeton-bob', 'GET', '/api/business')).status).toBe(200)
  })
})
