// @vitest-environment node
// Marketplace de bout en bout : serveur de Gilli → PostgreSQL (PGlite, RLS) → modération (règles + IA simulée).
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { UpstreamError } from '../../server/ai/errors.mjs'
import { createApiHandler } from '../../server/chat-handler.mjs'
import { createTestDatabase, createUser } from './database.mjs'
import { createPgliteBusinessStore } from './pglite-store.mjs'
import { createPgliteMarketplace } from './pglite-marketplace.mjs'

const KEY = 'cle-de-moderation-de-test-tres-longue'
const ADMIN_PASSWORD = 'mot-de-passe-admin-test'
/** Petite image PNG valide (1 × 1 pixel). */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** @type {import('node:http').Server[]} */
const servers = []
/** @type {Record<string, { id: string, email: string }>} */
const tokens = {}
/** @type {any[]} */
const aiCalls = []
let base = ''
let baseWithoutKey = ''
let shop = ''
/** @type {ReturnType<typeof createPgliteMarketplace>} */
let market

/** @type {import('../../server/ai/provider.mjs').AiProvider} */
const provider = {
  name: 'gemini',
  configured: true,
  models: { standard: 'gemini-test', lite: 'gemini-lite-test' },
  async *streamReply() { throw new Error('non utilisé') },
  generateTitle: async () => null,
  async generateJson(request) {
    aiCalls.push(request)
    if (request.text.includes('PANNE')) throw new UpstreamError('La limite d’utilisation gratuite du moteur est atteinte.', 429)
    if (request.text.includes('Douteux')) return { conforme: false, raisons: ['La photo ne correspond pas au titre.'] }
    return { conforme: true, raisons: [] }
  },
}

/** @param {Parameters<typeof createApiHandler>[0]} config */
async function start(config) {
  const handler = createApiHandler(config)
  const server = createServer((req, res) => void handler(req, res))
  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  return `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
}

beforeAll(async () => {
  const db = await createTestDatabase()
  await db.query('select public.set_moderation_key($1)', [KEY])
  tokens['jeton-alice'] = { id: await createUser(db, 'alice@example.test'), email: 'alice@example.test' }
  tokens['jeton-bob'] = { id: await createUser(db, 'bob@example.test'), email: 'bob@example.test' }
  market = createPgliteMarketplace(db)
  const common = { provider, verifyToken: async (/** @type {string} */ token) => tokens[token] ?? null, businessStore: createPgliteBusinessStore(db), marketplace: market, adminPassword: ADMIN_PASSWORD }
  base = await start({ ...common, moderationKey: KEY })
  baseWithoutKey = await start(common)
}, 60_000)
afterAll(() => { for (const server of servers) server.close() })

/** @param {string} token @param {string} method @param {string} path @param {unknown} [body] @param {string} [root] */
async function call(token, method, path, body, root = base, extraHeaders = {}) {
  const response = await fetch(`${root}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: /** @type {any} */ (await response.json()), headers: response.headers }
}
/** @param {string} name @param {number} price */
const createProduct = async (name, price = 48000) => (await call('jeton-alice', 'POST', `/api/business/${shop}/products`, { name, unit: 'pièce', purchasePrice: price - 8000, salePrice: price, initialQuantity: 3 })).body.product.id
/** @param {string} productId @param {Record<string, unknown>} [changes] */
const publish = (productId, changes = {}, root = base) => call('jeton-alice', 'POST', `/api/business/${shop}/listings`, {
  productId, title: 'Tecno Spark 20 neuf', description: 'Android, 8 Go de RAM, double SIM.', category: 'telephones', subcategory: 'smartphones', condition: 'new',
  attributes: { marque: 'Tecno', ram_go: 8, stockage_go: 256, inconnu: 'ignoré', reseau: '6G' }, newPhotos: [{ mimeType: 'image/png', data: PNG }], ...changes,
}, root)
const adminCookie = async () => {
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PASSWORD }) })
  return (login.headers.get('set-cookie') ?? '').split(';')[0]
}

describe('marketplace : de la vitrine à la publication', () => {
  it('donne les catégories au public', async () => {
    const { body } = await call('', 'GET', '/api/marketplace/categories')
    expect(body.categories.find((/** @type {any} */ category) => category.id === 'telephones').subcategories[0]).toEqual({ id: 'smartphones', label: 'Smartphones' })
    expect(body.conditions).toEqual({ new: 'Neuf', used: 'Occasion', refurbished: 'Reconditionné' })
  })

  it('crée la vitrine du vendeur, avec un numéro au format international', async () => {
    shop = (await call('jeton-alice', 'POST', '/api/business', { name: 'Boutique Awa' })).body.business.id
    expect((await call('jeton-alice', 'GET', `/api/business/${shop}/seller`)).body).toEqual({ profile: null })
    expect((await call('jeton-alice', 'PUT', `/api/business/${shop}/seller`, { displayName: 'Awa Téléphones', city: 'Ouagadougou' })).body).toEqual({ error: 'Indiquez au moins un numéro WhatsApp ou d’appel.' })
    const saved = await call('jeton-alice', 'PUT', `/api/business/${shop}/seller`, { displayName: 'Awa Téléphones', city: 'Ouagadougou', whatsapp: '70 12 34 56', phone: '+226 76 00 00 00', deliveryCities: ['Koudougou', 'Koudougou'] })
    expect(saved.body.profile).toEqual({ businessId: shop, displayName: 'Awa Téléphones', city: 'Ouagadougou', whatsapp: '22670123456', phone: '22676000000', deliversEverywhere: false, deliveryCities: ['Koudougou'], description: null, verified: false })
    expect((await call('jeton-bob', 'PUT', `/api/business/${shop}/seller`, { displayName: 'Intrus', city: 'Ouaga', whatsapp: '70000000' })).status).toBe(403)
  })

  it('publie une annonce conforme après le contrôle automatique (règles puis IA), avec sa photo', async () => {
    const productId = await createProduct('Tecno Spark 20')
    const { status, body } = await publish(productId)
    expect(status).toBe(201)
    expect(body.moderation).toBe('done')
    expect(body.listing).toMatchObject({ status: 'published', revision: 1, moderatedBy: 'auto', attributes: { marque: 'Tecno', ram_go: 8, stockage_go: 256 } })
    expect(body.listing.photos[0].path).toMatch(new RegExp(`^${shop}/[0-9a-f-]{36}\\.png$`))
    expect(market.photos.files.has(body.listing.photos[0].path)).toBe(true)
    expect(aiCalls.at(-1).images).toEqual([{ mimeType: 'image/png', data: PNG }])
    expect(aiCalls.at(-1).text).toContain('Titre : Tecno Spark 20 neuf')

    const search = await call('', 'GET', '/api/marketplace/search?q=tecno&city=ouagadougou&maxPrice=50000')
    expect(search.body.total).toBe(1)
    expect(search.body.items[0]).toMatchObject({ title: 'Tecno Spark 20 neuf', price: 48000, sellerName: 'Awa Téléphones', sameCity: true, photo: `/photos/${body.listing.photos[0].path}` })
    const detail = await call('', 'GET', `/api/marketplace/listings/${body.listing.id}`)
    expect(detail.body.listing).toMatchObject({ inStock: true, seller: { whatsapp: '22670123456' }, photos: [`/photos/${body.listing.photos[0].path}`] })
    expect((await call('', 'GET', `/api/marketplace/sellers/${shop}`)).body.listings).toHaveLength(1)
    expect((await call('', 'GET', '/api/marketplace/listings/00000000-0000-4000-8000-000000000000')).status).toBe(404)
  })

  it('envoie en vérification humaine sans appeler l’IA quand un mot interdit apparaît', async () => {
    const before = aiCalls.length
    const { body } = await publish(await createProduct('Article 2'), { title: 'Pistolet d’alarme', newPhotos: [] })
    expect(body.listing).toMatchObject({ status: 'review', reasons: ['Mot lié à des produits interdits (armes, munitions ou explosifs) : « pistolet ».'] })
    expect(aiCalls.length).toBe(before)
    expect((await call('', 'GET', '/api/marketplace/search?q=pistolet')).body.total).toBe(0)
  })

  it('suit l’avis de l’IA, et passe en vérification humaine si elle est indisponible', async () => {
    const doubtful = await publish(await createProduct('Article 3'), { title: 'Douteux lot de téléphones' })
    expect(doubtful.body.listing).toMatchObject({ status: 'review', reasons: ['Agent IA : La photo ne correspond pas au titre.'] })
    const down = await publish(await createProduct('Article 4'), { title: 'Chargeur rapide PANNE test' })
    expect(down.body.listing).toMatchObject({ status: 'review', reasons: ['Vérification automatique indisponible : vérification humaine nécessaire.'] })
  })

  it('refuse les données invalides et les commerçants étrangers', async () => {
    const productId = await createProduct('Article 5')
    expect((await publish(productId, { category: 'armes' })).body).toEqual({ error: 'Choisissez une catégorie.' })
    expect((await publish(productId, { newPhotos: [{ mimeType: 'application/pdf', data: 'AAAA' }] })).status).toBe(422)
    expect((await publish(productId, { keepPhotos: ['autre/11111111-1111-4111-8111-111111111111.jpg'] })).body).toEqual({ error: 'Photo invalide.' })
    const bob = await call('jeton-bob', 'POST', `/api/business/${shop}/listings`, { productId, title: 'Intrus', category: 'autres' })
    expect(bob.status).toBe(403)
  })

  it('laisse l’administration vérifier, publier ou refuser, et certifier un vendeur', async () => {
    const cookie = await adminCookie()
    expect((await call('', 'GET', '/api/admin/moderation?status=review')).status).toBe(401)
    const queue = await call('', 'GET', '/api/admin/moderation?status=review', undefined, base, { cookie })
    expect(queue.body.listings.map((/** @type {any} */ item) => item.title).sort()).toEqual(['Chargeur rapide PANNE test', 'Douteux lot de téléphones', 'Pistolet d’alarme'])
    const pistol = queue.body.listings.find((/** @type {any} */ item) => item.title === 'Pistolet d’alarme')
    const charger = queue.body.listings.find((/** @type {any} */ item) => item.title.startsWith('Chargeur'))
    expect((await call('', 'POST', `/api/admin/moderation/${pistol.id}`, { status: 'rejected', revision: pistol.revision, reason: 'Arme' }, base, { cookie })).body.listing).toMatchObject({ status: 'rejected', reasons: ['Administration : Arme'] })
    expect((await call('', 'POST', `/api/admin/moderation/${charger.id}`, { status: 'published', revision: charger.revision }, base, { cookie })).body.listing.status).toBe('published')
    expect((await call('', 'GET', '/api/marketplace/search?q=chargeur')).body.total).toBe(1)
    await call('', 'POST', `/api/admin/sellers/${shop}/verified`, { verified: true }, base, { cookie })
    expect((await call('', 'GET', '/api/marketplace/search?q=chargeur')).body.items[0].sellerVerified).toBe(true)
  })

  it('remet en contrôle une annonce modifiée et accepte les signalements', async () => {
    const own = (await call('jeton-alice', 'GET', `/api/business/${shop}/listings`)).body.listings
    const tecno = own.find((/** @type {any} */ item) => item.title === 'Tecno Spark 20 neuf')
    const edited = await publish(tecno.productId, { title: 'Tecno Spark 20 neuf, garantie', keepPhotos: [tecno.photos[0].path], newPhotos: [] })
    expect(edited.body.listing).toMatchObject({ status: 'published', revision: 2, photos: [tecno.photos[0]] })
    expect((await call('', 'POST', `/api/marketplace/listings/${tecno.id}/report`, { reason: 'spam' })).status).toBe(422)
    for (let index = 0; index < 3; index += 1) expect((await call('', 'POST', `/api/marketplace/listings/${tecno.id}/report`, { reason: 'scam', details: 'Prix suspect' })).status).toBe(201)
    expect((await call('', 'GET', `/api/marketplace/listings/${tecno.id}`)).status).toBe(404)
    expect((await call('jeton-alice', 'POST', `/api/business/${shop}/listings/${tecno.id}/withdraw`)).body.listing.status).toBe('withdrawn')
  })

  it('sans clé de modération, laisse les annonces en attente de l’administration', async () => {
    const { body } = await publish(await createProduct('Article 6'), { title: 'Bouilloire électrique', category: 'electromenager', subcategory: null, newPhotos: [] }, baseWithoutKey)
    expect(body).toMatchObject({ moderation: 'unavailable', listing: { status: 'pending' } })
    expect((await call('', 'GET', '/api/admin/moderation', undefined, baseWithoutKey)).status).toBe(401)
  })
})
