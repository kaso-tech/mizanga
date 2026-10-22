// @vitest-environment node
// Étape 3 : création des produits et mouvements de stock, uniquement à travers les fonctions contrôlées.
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createTestDatabase, createUser, errorOf } from './database.mjs'

/** @type {import('@electric-sql/pglite').PGlite} */
let db
let alice = ''
let bob = ''
let carla = ''
let aliceShop = ''
let bobShop = ''

/** @param {string} userId @param {string} sql @param {unknown[]} params */
const queryAs = (userId, sql, params = []) => asUser(db, userId, async () => (await db.query(sql, params)).rows)
/** @param {string} userId @param {string} businessId @param {Record<string, unknown>} input */
const createProduct = async (userId, businessId, input) => /** @type {any} */ ((await queryAs(
  userId,
  'select * from public.create_product($1, $2, $3, $4, $5, $6, $7, $8)',
  [businessId, input.name, input.unit ?? 'unité', input.purchasePrice ?? 0, input.salePrice ?? 0, input.alertThreshold ?? 0, input.initialQuantity ?? 0, input.sku ?? null],
))[0])
/** @param {string} userId @param {string} businessId @param {string} productId @param {string} kind @param {number} quantity @param {number | null} [unitCost] */
const move = (userId, businessId, productId, kind, quantity, unitCost = null) => queryAs(
  userId,
  'select * from public.record_stock_movement($1, $2, $3, $4, $5, $6)',
  [businessId, productId, kind, quantity, unitCost, null],
)
const stockOf = async (/** @type {string} */ productId) => Number(/** @type {any} */ ((await db.query('select quantity from public.products where id = $1', [productId])).rows[0]).quantity)

beforeAll(async () => {
  db = await createTestDatabase()
  alice = await createUser(db, 'alice@example.test')
  bob = await createUser(db, 'bob@example.test')
  carla = await createUser(db, 'carla@example.test')
  aliceShop = /** @type {any} */ ((await queryAs(alice, "insert into public.businesses (name) values ('Boutique d’Alice') returning id"))[0]).id
  bobShop = /** @type {any} */ ((await queryAs(bob, "insert into public.businesses (name) values ('Boutique de Bob') returning id"))[0]).id
  await db.query("insert into public.business_members (business_id, user_id, role) values ($1, $2, 'staff')", [aliceShop, carla])
}, 60_000)

describe('création des produits', () => {
  it('crée un produit et inscrit son stock initial au journal', async () => {
    const product = await createProduct(alice, aliceShop, { name: '  Riz 25 kg ', unit: 'sac', purchasePrice: 15000, salePrice: 17500, alertThreshold: 3, initialQuantity: 10 })
    expect(product).toMatchObject({ name: 'Riz 25 kg', unit: 'sac', purchase_price: 15000, sale_price: 17500 })
    expect(Number(product.quantity)).toBe(10)
    const movements = await queryAs(alice, 'select kind, quantity_delta, unit_cost, note from public.stock_movements where product_id = $1', [product.id])
    expect(movements).toEqual([{ kind: 'initial', quantity_delta: '10.000', unit_cost: 15000, note: 'Stock initial' }])
  })

  it('n’inscrit pas de mouvement pour un stock initial nul ; un employé peut créer un produit', async () => {
    const product = await createProduct(carla, aliceShop, { name: 'Sucre', unit: 'kg' })
    expect(Number(product.quantity)).toBe(0)
    expect(await queryAs(alice, 'select * from public.stock_movements where product_id = $1', [product.id])).toEqual([])
  })

  it('refuse de créer un produit dans l’entreprise d’un autre ou avec des valeurs invalides', async () => {
    expect(await errorOf(createProduct(bob, aliceShop, { name: 'Intrus' }))).toBe('Accès refusé à cette entreprise.')
    expect(await errorOf(createProduct(alice, aliceShop, { name: 'X', initialQuantity: -1 }))).toBe('La quantité initiale ne peut pas être négative.')
    expect(await errorOf(createProduct(alice, aliceShop, { name: 'X', salePrice: -5 }))).toBe('Les prix ne peuvent pas être négatifs.')
    expect(await errorOf(createProduct(alice, aliceShop, { name: '   ' }))).toBe('Le nom du produit doit faire entre 1 et 120 caractères.')
    expect(await errorOf(asUser(db, null, () => db.query("select public.create_product($1, 'X')", [aliceShop])))).toMatch(/permission denied/)
  })
})

describe('mouvements de stock', () => {
  it('ajoute les achats et les retours, retire les pertes, applique les ajustements dans les deux sens', async () => {
    const product = await createProduct(alice, aliceShop, { name: 'Huile 5 L', unit: 'bidon', purchasePrice: 6000, salePrice: 7000, initialQuantity: 4 })
    const [purchase] = /** @type {any[]} */ (await move(alice, aliceShop, product.id, 'purchase', 6))
    expect(purchase).toMatchObject({ kind: 'purchase', quantity_delta: '6.000', unit_cost: 6000, created_by: alice })
    await move(carla, aliceShop, product.id, 'return', 1)
    const [loss] = /** @type {any[]} */ (await move(alice, aliceShop, product.id, 'loss', 2))
    expect(loss.quantity_delta).toBe('-2.000')
    await move(alice, aliceShop, product.id, 'adjustment', -0.5)
    await move(alice, aliceShop, product.id, 'adjustment', 1.5)
    expect(await stockOf(product.id)).toBe(10)
    // Le stock est toujours égal à la somme des mouvements du journal.
    const [{ total }] = /** @type {any[]} */ (await queryAs(alice, 'select sum(quantity_delta)::numeric as total from public.stock_movements where product_id = $1', [product.id]))
    expect(Number(total)).toBe(10)
  })

  it('garde le coût d’achat saisi, sinon le prix d’achat du produit', async () => {
    const product = await createProduct(alice, aliceShop, { name: 'Savon', purchasePrice: 250, salePrice: 300 })
    const [custom] = /** @type {any[]} */ (await move(alice, aliceShop, product.id, 'purchase', 10, 240))
    expect(custom.unit_cost).toBe(240)
    const [lost] = /** @type {any[]} */ (await move(alice, aliceShop, product.id, 'loss', 1))
    expect(lost.unit_cost).toBeNull()
  })

  it('refuse un stock négatif, avec la quantité restante', async () => {
    const product = await createProduct(alice, aliceShop, { name: 'Lait', unit: 'kg', initialQuantity: 2.5 })
    expect(await errorOf(move(alice, aliceShop, product.id, 'loss', 3))).toBe('Stock insuffisant : il reste 2.5 kg.')
    expect(await errorOf(move(alice, aliceShop, product.id, 'adjustment', -10))).toBe('Stock insuffisant : il reste 2.5 kg.')
    expect(await stockOf(product.id)).toBe(2.5)
  })

  it('refuse les quantités invalides et les types réservés aux ventes', async () => {
    const product = await createProduct(alice, aliceShop, { name: 'Thé', initialQuantity: 5 })
    expect(await errorOf(move(alice, aliceShop, product.id, 'purchase', 0))).toBe('La quantité doit être un nombre positif.')
    expect(await errorOf(move(alice, aliceShop, product.id, 'loss', -1))).toBe('La quantité doit être un nombre positif.')
    for (const kind of ['sale', 'initial', 'sale_cancelled']) {
      expect(await errorOf(move(alice, aliceShop, product.id, kind, 1))).toBe('Ce type de mouvement ne peut pas être saisi directement.')
    }
    expect(await errorOf(move(alice, aliceShop, product.id, 'purchase', 1, -10))).toBe('Le coût ne peut pas être négatif.')
  })

  it('isole les entreprises : ni mouvement ni lecture chez un autre commerçant', async () => {
    const product = await createProduct(alice, aliceShop, { name: 'Café', initialQuantity: 3 })
    expect(await errorOf(move(bob, aliceShop, product.id, 'loss', 1))).toBe('Accès refusé à cette entreprise.')
    // Bob passe sa propre entreprise avec le produit d’Alice : le produit n’y existe pas.
    expect(await errorOf(move(bob, bobShop, product.id, 'loss', 1))).toBe('Produit introuvable.')
    expect(await queryAs(bob, 'select * from public.stock_movements where product_id = $1', [product.id])).toEqual([])
    expect(await stockOf(product.id)).toBe(3)
  })

  it('refuse les mouvements sur un produit archivé', async () => {
    const product = await createProduct(alice, aliceShop, { name: 'Ancien produit', initialQuantity: 1 })
    await queryAs(alice, 'update public.products set archived = true where id = $1', [product.id])
    expect(await errorOf(move(alice, aliceShop, product.id, 'purchase', 1))).toBe('Ce produit est archivé.')
  })
})
