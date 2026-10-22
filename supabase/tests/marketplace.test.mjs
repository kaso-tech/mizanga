// @vitest-environment node
// Marketplace (phase 1) : vitrine, annonces modérées, lecture publique, signalements, photos.
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createTestDatabase, createUser, errorOf } from './database.mjs'

/** @type {import('@electric-sql/pglite').PGlite} */
let db
let alice = ''
let bob = ''
let carla = ''
let shop = ''
let bobShop = ''
let phone = ''
let cover = ''
let listing = ''
const KEY = 'cle-de-moderation-de-test-tres-longue'

/** @param {string | null} userId @param {string} sql @param {unknown[]} [params] */
const queryAs = (userId, sql, params = []) => asUser(db, userId, async () => /** @type {any[]} */ ((await db.query(sql, params)).rows))
const profile = (/** @type {string} */ userId, /** @type {string} */ business, city = 'Ouagadougou') => queryAs(userId, "select * from public.upsert_seller_profile($1, 'Boutique Awa', $2, '22670123456', null, false, array['Koudougou'], 'Téléphones neufs')", [business, city])
/** @param {string} userId @param {string} productId @param {Record<string, unknown>} [changes] */
const submit = async (userId, productId, changes = {}) => (await queryAs(userId, 'select * from public.submit_listing($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)', [
  changes.business ?? shop, productId, changes.title ?? 'Tecno Spark 20 neuf', changes.description ?? 'Téléphone Android, 8 Go de RAM, 256 Go.', 'telephones', 'smartphones', 'new',
  JSON.stringify({ marque: 'Tecno', ram_go: 8 }), changes.photos ?? [],
]))[0]
const moderate = async (/** @type {string} */ id, /** @type {number} */ revision, status = 'published', by = 'auto', key = KEY) => (await queryAs(null, 'select * from public.moderate_listing($1, $2, $3, $4, $5, $6)', [key, id, revision, status, ['ok'], by]))[0]
const search = async (/** @type {Record<string, unknown>} */ filters = {}) => (await queryAs(null, 'select public.marketplace_search($1, $2, $3, $4, $5, $6, $7) as result', [
  filters.query ?? null, filters.category ?? null, null, filters.city ?? null, null, filters.maxPrice ?? null, null,
]))[0].result

beforeAll(async () => {
  db = await createTestDatabase()
  await db.query('select public.set_moderation_key($1)', [KEY])
  alice = await createUser(db, 'alice@example.test')
  bob = await createUser(db, 'bob@example.test')
  carla = await createUser(db, 'carla@example.test')
  shop = (await queryAs(alice, "insert into public.businesses (name) values ('Boutique Awa') returning id"))[0].id
  bobShop = (await queryAs(bob, "insert into public.businesses (name) values ('Chez Bob') returning id"))[0].id
  await db.query("insert into public.business_members (business_id, user_id, role) values ($1, $2, 'staff')", [shop, carla])
  phone = (await queryAs(alice, "select id from public.create_product($1, 'Tecno Spark 20', 'pièce', 40000, 48000, 1, 3)", [shop]))[0].id
  cover = (await queryAs(alice, "select id from public.create_product($1, 'Coque', 'pièce', 500, 1500, 0, 0)", [shop]))[0].id
}, 60_000)

describe('marketplace : vitrine et annonces', () => {
  it('réserve la vitrine au propriétaire ; le badge « vérifié » ne s’obtient pas soi-même', async () => {
    expect(await errorOf(profile(carla, shop))).toBe('Seul le propriétaire peut gérer la vitrine.')
    expect(await errorOf(queryAs(alice, 'select public.submit_listing($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)', [shop, phone, 'Test', '', 'telephones', null, 'new', '{}', []]))).toBe('Complétez d’abord votre vitrine (nom, ville, contact).')
    const [created] = await profile(alice, shop)
    expect(created).toMatchObject({ display_name: 'Boutique Awa', city: 'Ouagadougou', city_key: 'ouagadougou', verified: false })
    expect(await errorOf(queryAs(alice, 'update public.seller_profiles set verified = true'))).toMatch(/permission denied/)
    expect(await errorOf(queryAs(alice, "select public.upsert_seller_profile($1, 'X', 'Ouaga', null, null, false, '{}', null)", [shop]))).toMatch(/check constraint/)
  })

  it('met toute annonce soumise en attente : le vendeur ne peut pas la publier lui-même', async () => {
    const submitted = await submit(alice, phone, { photos: [`${shop}/11111111-1111-4111-8111-111111111111.jpg`] })
    listing = submitted.id
    expect(submitted).toMatchObject({ status: 'pending', revision: 1, search_text: expect.stringContaining('tecno spark 20 neuf telephone android') })
    expect(await errorOf(queryAs(alice, "update public.listings set status = 'published'"))).toMatch(/permission denied/)
    expect(await errorOf(queryAs(alice, 'insert into public.listings (business_id, product_id, title, category) values ($1, $2, $3, $4)', [shop, cover, 'Coque', 'telephones']))).toMatch(/permission denied/)
    expect(await errorOf(moderate(listing, 1, 'published', 'auto', 'mauvaise-cle'))).toBe('Modération non autorisée.')
    expect((await search()).total).toBe(0)
    // Photos hors du dossier du commerce, staff, autre commerçant : refusés.
    expect(await errorOf(submit(alice, phone, { photos: [`${bobShop}/11111111-1111-4111-8111-111111111111.jpg`] }))).toBe('Photo invalide.')
    expect(await errorOf(submit(carla, phone))).toBe('Seul le propriétaire peut publier sur la marketplace.')
    expect(await errorOf(submit(bob, phone, { business: bobShop }))).toMatch(/Complétez|Produit introuvable/)
  })

  it('publie après modération, puis montre l’annonce au public avec le prix et la ville', async () => {
    expect(await errorOf(moderate(listing, 99))).toBe('L’annonce a changé depuis la vérification.')
    expect(await moderate(listing, 1)).toMatchObject({ status: 'published', moderated_by: 'auto' })
    const results = await search({ query: 'TÉLÉPHONE android', city: 'ouagadougou' })
    expect(results.total).toBe(1)
    expect(results.items[0]).toMatchObject({ id: listing, title: 'Tecno Spark 20 neuf', price: 48000, currency: 'XOF', city: 'Ouagadougou', sellerName: 'Boutique Awa', sameCity: true, sellerVerified: false })
    expect((await search({ query: 'iphone' })).total).toBe(0)
    expect((await search({ maxPrice: 40000 })).total).toBe(0)
    expect((await search({ city: 'Koudougou' })).items[0]).toMatchObject({ sameCity: false, deliversToCity: true })
    const [{ detail }] = await queryAs(null, 'select public.marketplace_listing($1) as detail', [listing])
    expect(detail).toMatchObject({ price: 48000, inStock: true, seller: { whatsapp: '22670123456', city: 'Ouagadougou', deliveryCities: ['Koudougou'] }, photos: [`${shop}/11111111-1111-4111-8111-111111111111.jpg`] })
    const [{ page }] = await queryAs(null, 'select public.marketplace_seller($1) as page', [shop])
    expect(page.listings).toHaveLength(1)
  })

  it('cache une annonce modifiée jusqu’à une nouvelle modération, et un produit épuisé', async () => {
    const changed = await submit(alice, phone, { title: 'Tecno Spark 20 neuf, garantie 6 mois' })
    expect(changed).toMatchObject({ status: 'pending', revision: 2 })
    expect((await search()).total).toBe(0)
    expect(await errorOf(moderate(listing, 1))).toBe('L’annonce a changé depuis la vérification.')
    await moderate(listing, 2)
    expect((await search()).total).toBe(1)
    await queryAs(alice, "select public.record_stock_movement($1, $2, 'loss', 3, null, null)", [shop, phone])
    expect((await search()).total).toBe(0)
    await queryAs(alice, "select public.record_stock_movement($1, $2, 'purchase', 2, null, null)", [shop, phone])
    expect((await search()).total).toBe(1)
  })

  it('renvoie en vérification une annonce signalée trois fois, et l’administration décide', async () => {
    expect(await errorOf(queryAs(null, "select public.report_listing($1, 'spam')", [listing]))).toMatch(/check constraint/)
    for (let index = 0; index < 3; index += 1) await queryAs(null, "select public.report_listing($1, 'scam', 'Prix trop bas')", [listing])
    const [row] = await queryAs(alice, 'select status, moderation_reasons from public.listings where id = $1', [listing])
    expect(row).toEqual({ status: 'review', moderation_reasons: ['Signalée plusieurs fois par des utilisateurs'] })
    expect((await search()).total).toBe(0)
    const [{ queue }] = await queryAs(null, "select public.moderation_queue($1, 'review') as queue", [KEY])
    expect(queue[0]).toMatchObject({ id: listing, title: 'Tecno Spark 20 neuf, garantie 6 mois', price: 48000, seller: { name: 'Boutique Awa' } })
    expect(queue[0].reports).toHaveLength(3)
    expect(await errorOf(queryAs(null, "select public.moderation_queue('x', 'review')"))).toBe('Modération non autorisée.')
    // Le contrôle automatique ne peut ni refuser ni toucher une annonce qui n’est plus en attente.
    expect(await errorOf(moderate(listing, 2, 'rejected', 'auto'))).toBe('Décision automatique invalide.')
    expect(await errorOf(moderate(listing, 2, 'published', 'auto'))).toBe('L’annonce n’attend plus de contrôle automatique.')
    expect(await moderate(listing, 2, 'published', 'admin')).toMatchObject({ status: 'published', moderated_by: 'admin' })
    await queryAs(null, 'select public.set_seller_verified($1, $2, true)', [KEY, shop])
    expect((await search()).items[0].sellerVerified).toBe(true)
  })

  it('laisse le vendeur retirer son annonce ; personne d’autre', async () => {
    expect(await errorOf(queryAs(bob, 'select public.withdraw_listing($1, $2)', [shop, listing]))).toBe('Seul le propriétaire peut retirer une annonce.')
    expect((await queryAs(alice, 'select * from public.withdraw_listing($1, $2)', [shop, listing]))[0].status).toBe('withdrawn')
    expect((await search()).total).toBe(0)
    expect(await errorOf(moderate(listing, 2, 'published', 'admin'))).toBe('L’annonce a changé depuis la vérification.')
  })

  it('protège les données : rien en lecture directe pour le public ni pour les autres commerçants', async () => {
    expect(await errorOf(queryAs(null, 'select * from public.listings'))).toMatch(/permission denied/)
    expect(await errorOf(queryAs(null, 'select * from public.seller_profiles'))).toMatch(/permission denied/)
    expect(await errorOf(queryAs(null, 'select * from public.listing_reports'))).toMatch(/permission denied/)
    expect(await queryAs(bob, 'select * from public.listings')).toEqual([])
    expect(await queryAs(bob, 'select * from public.seller_profiles')).toEqual([])
    expect(await errorOf(queryAs(alice, "select public.set_moderation_key('une-autre-cle-assez-longue-pour-passer')"))).toMatch(/permission denied/)
  })

  it('limite l’ajout de photos au dossier de son propre commerce', async () => {
    const insertPhoto = (/** @type {string | null} */ userId, /** @type {string} */ folder) => queryAs(userId, "insert into storage.objects (bucket_id, name) values ('listing-photos', $1)", [`${folder}/22222222-2222-4222-8222-222222222222.jpg`])
    await insertPhoto(alice, shop)
    expect(await errorOf(insertPhoto(bob, shop))).toMatch(/row-level security/)
    expect(await errorOf(insertPhoto(carla, shop))).toMatch(/row-level security/)
    expect(await errorOf(insertPhoto(null, shop))).toMatch(/row-level security/)
  })
})
