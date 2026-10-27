// @vitest-environment node
// Avis sur les vendeurs de bout en bout : serveur → PostgreSQL (PGlite, RLS) → contrôle automatique →
// console d’administration ; note et statistiques publiques du vendeur.
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiHandler } from '../../server/chat-handler.mjs'
import { createTestDatabase, createUser } from './database.mjs'
import { createPgliteBusinessStore } from './pglite-store.mjs'
import { createPgliteMarketplace } from './pglite-marketplace.mjs'

const KEY = 'cle-de-moderation-de-test-tres-longue'
const ADMIN_PASSWORD = 'mot-de-passe-admin-test'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** @type {import('node:http').Server} */
let server
let base = ''
let shop = ''
let listingId = ''
/** @type {Record<string, { id: string, email: string }>} */
const tokens = {}

/** @type {import('../../server/ai/provider.mjs').AiProvider} */
const provider = {
  name: 'gemini',
  configured: true,
  models: { standard: 'gemini-test', lite: 'gemini-lite-test' },
  async *streamReply() { yield { text: '' } },
  generateTitle: async () => null,
  generateJson: async () => ({ conforme: true, raisons: [] }),
}

/** @param {string} token @param {string} method @param {string} path @param {unknown} [body] @param {Record<string, string>} [headers] */
async function call(token, method, path, body, headers = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, body: /** @type {any} */ (await response.json()), headers: response.headers }
}
const seller = async () => (await call('', 'GET', `/api/marketplace/sellers/${shop}`)).body

beforeAll(async () => {
  const db = await createTestDatabase()
  await db.query('select public.set_moderation_key($1)', [KEY])
  for (const name of ['awa', 'ali', 'bob', 'eve', 'zoe']) tokens[`jeton-${name}`] = { id: await createUser(db, `${name}@example.test`), email: `${name}@example.test` }
  const handler = createApiHandler({ provider, verifyToken: async (token) => tokens[token] ?? null, businessStore: createPgliteBusinessStore(db), marketplace: createPgliteMarketplace(db), moderationKey: KEY, adminEmail: 'admin@gilli.test', adminPassword: ADMIN_PASSWORD })
  server = createServer((req, res) => void handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
  shop = (await call('jeton-awa', 'POST', '/api/business', { name: 'Awa Téléphones' })).body.business.id
  await call('jeton-awa', 'PUT', `/api/business/${shop}/seller`, { displayName: 'Awa Téléphones', city: 'Ouagadougou', whatsapp: '70 12 34 56' })
  const product = (await call('jeton-awa', 'POST', `/api/business/${shop}/products`, { name: 'Tecno Spark 20', unit: 'pièce', purchasePrice: 40000, salePrice: 48000, initialQuantity: 2 })).body.product.id
  listingId = (await call('jeton-awa', 'POST', `/api/business/${shop}/listings`, { productId: product, title: 'Tecno Spark 20', description: 'Garantie 6 mois.', category: 'telephones', subcategory: 'smartphones', condition: 'new', attributes: { ram_go: 8 }, newPhotos: [{ mimeType: 'image/png', data: PNG }] })).body.listing.id
}, 90_000)
afterAll(() => server.close())

describe('avis sur les vendeurs', () => {
  it('publie un avis correct et met à jour la note, sans révéler son auteur', async () => {
    const before = await seller()
    expect(before.seller.stats).toMatchObject({ rating: null, reviewCount: 0, activeListings: 1 })
    expect(Date.parse(before.seller.stats.memberSince)).not.toBeNaN()

    const saved = await call('jeton-ali', 'PUT', `/api/marketplace/sellers/${shop}/review`, { rating: 5, comment: '  Très bon vendeur, téléphone conforme à l’annonce.  ' })
    expect(saved).toMatchObject({ status: 200, body: { review: { rating: 5, comment: 'Très bon vendeur, téléphone conforme à l’annonce.', status: 'published' } } })
    await call('jeton-bob', 'PUT', `/api/marketplace/sellers/${shop}/review`, { rating: 4 })
    const after = await seller()
    expect(after.seller.stats).toMatchObject({ rating: 4.5, reviewCount: 2 })
    expect(after.reviews).toHaveLength(2)
    expect(JSON.stringify(after.reviews)).not.toMatch(/ali|bob|user/i)
    expect((await call('jeton-ali', 'GET', `/api/marketplace/sellers/${shop}/review`)).body.review).toMatchObject({ rating: 5, status: 'published' })
    expect((await call('jeton-eve', 'GET', `/api/marketplace/sellers/${shop}/review`)).body.review).toBeNull()

    // La note suit les fiches d’annonce et la page annonce.
    const search = (await call('', 'GET', '/api/marketplace/search?q=tecno')).body.items[0]
    expect(search).toMatchObject({ sellerRating: 4.5, sellerReviews: 2 })
    expect((await call('', 'GET', `/api/marketplace/listings/${listingId}`)).body.listing.seller.stats).toMatchObject({ rating: 4.5, reviewCount: 2, activeListings: 1 })
  })

  it('un compte, un avis (modifiable, supprimable) ; jamais sur son propre commerce ; connexion requise', async () => {
    const changed = await call('jeton-ali', 'PUT', `/api/marketplace/sellers/${shop}/review`, { rating: 3, comment: 'Livraison en retard.' })
    expect(changed.body.review).toMatchObject({ rating: 3, status: 'published', revision: 2 })
    expect((await seller()).seller.stats).toMatchObject({ rating: 3.5, reviewCount: 2 })

    expect(await call('jeton-awa', 'PUT', `/api/marketplace/sellers/${shop}/review`, { rating: 5 })).toMatchObject({ status: 403, body: { error: 'Vous ne pouvez pas donner un avis sur votre propre commerce.' } })
    expect((await call('', 'PUT', `/api/marketplace/sellers/${shop}/review`, { rating: 5 })).status).toBe(401)
    expect((await call('jeton-eve', 'PUT', `/api/marketplace/sellers/${shop}/review`, { rating: 6 })).status).toBe(422)
    expect((await call('jeton-eve', 'PUT', `/api/marketplace/sellers/${shop}/review`, { rating: 4, comment: 'x'.repeat(501) })).status).toBe(422)
    expect((await call('jeton-eve', 'PUT', '/api/marketplace/sellers/6f1c2b8e-0000-4000-8000-000000000000/review', { rating: 4 })).status).toBe(422)

    await call('jeton-ali', 'DELETE', `/api/marketplace/sellers/${shop}/review`)
    expect((await seller()).seller.stats).toMatchObject({ rating: 4, reviewCount: 1 })
  })

  it('envoie un avis suspect en vérification ; l’administration le publie ou le masque', async () => {
    const suspect = await call('jeton-eve', 'PUT', `/api/marketplace/sellers/${shop}/review`, { rating: 1, comment: 'Arnaque, appelez-moi au 70 11 22 33' })
    expect(suspect.body.review.status).toBe('review')
    expect((await seller()).seller.stats.reviewCount).toBe(1)

    const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@gilli.test', password: ADMIN_PASSWORD }) })
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
    expect((await call('', 'GET', '/api/admin/reviews?status=review')).status).toBe(401)
    const queue = (await call('', 'GET', '/api/admin/reviews?status=review', undefined, { Cookie: cookie })).body.reviews
    expect(queue).toMatchObject([{ rating: 1, comment: 'Arnaque, appelez-moi au 70 11 22 33', sellerName: 'Awa Téléphones', reasons: ['Numéro de téléphone dans le commentaire.'] }])
    const published = await call('', 'POST', `/api/admin/reviews/${queue[0].id}`, { status: 'published', revision: queue[0].revision }, { Cookie: cookie })
    expect(published.body.review.status).toBe('published')
    expect((await seller()).seller.stats).toMatchObject({ rating: 2.5, reviewCount: 2 })
    await call('', 'POST', `/api/admin/reviews/${queue[0].id}`, { status: 'hidden', revision: queue[0].revision }, { Cookie: cookie })
    expect((await seller()).seller.stats.reviewCount).toBe(1)

    const insult = await call('jeton-zoe', 'PUT', `/api/marketplace/sellers/${shop}/review`, { rating: 1, comment: 'Quel connard' })
    expect(insult.body.review.status).toBe('review')
  })
})
