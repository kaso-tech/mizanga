// @vitest-environment node
// Favoris, alertes et notifications du téléphone de bout en bout : serveur → PostgreSQL (PGlite, RLS)
// → envoi Web Push simulé (les clés VAPID sont réellement générées et gardées dans la base).
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiHandler } from '../../server/chat-handler.mjs'
import { createTestDatabase, createUser } from './database.mjs'
import { createPgliteBusinessStore } from './pglite-store.mjs'
import { createPgliteMarketplace } from './pglite-marketplace.mjs'

const KEY = 'cle-de-moderation-de-test-tres-longue'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const ALERT = '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d'
const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
const AUTH = 'tBHItJI5svbpez7KI4CCXg'

/** @type {import('node:http').Server} */
let server
let base = ''
let shop = ''
/** @type {Record<string, { id: string, email: string }>} */
const tokens = {}
/** @type {Array<{ endpoint: string, payload: any }>} */
const pushes = []
/** @type {import('@electric-sql/pglite').PGlite} */
let db

/** @type {import('../../server/ai/provider.mjs').AiProvider} */
const provider = {
  name: 'gemini',
  configured: true,
  models: { standard: 'gemini-test', lite: 'gemini-lite-test' },
  async *streamReply() { yield { text: '' } },
  generateTitle: async () => null,
  generateJson: async () => ({ conforme: true, raisons: [] }),
}

/** @param {string} token @param {string} method @param {string} path @param {unknown} [body] */
async function call(token, method, path, body) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, body: /** @type {any} */ (await response.json()) }
}

/** Publie un téléphone du commerce d’Awa ; renvoie l’annonce. @param {string} title @param {number} price @param {Record<string, unknown>} attributes */
async function publish(title, price, attributes) {
  const product = (await call('jeton-awa', 'POST', `/api/business/${shop}/products`, { name: title, unit: 'pièce', purchasePrice: price - 5000, salePrice: price, initialQuantity: 2 })).body.product.id
  const { body } = await call('jeton-awa', 'POST', `/api/business/${shop}/listings`, { productId: product, title, description: `${title}, garantie 6 mois.`, category: 'telephones', subcategory: 'smartphones', condition: 'new', attributes, newPhotos: [{ mimeType: 'image/png', data: PNG }] })
  expect(body.listing.status).toBe('published')
  return { ...body.listing, productId: product }
}

/** Les notifications partent après la réponse : on attend qu’elles soient envoyées. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

beforeAll(async () => {
  db = await createTestDatabase()
  await db.query('select public.set_moderation_key($1)', [KEY])
  tokens['jeton-awa'] = { id: await createUser(db, 'awa@example.test'), email: 'awa@example.test' }
  tokens['jeton-ali'] = { id: await createUser(db, 'ali@example.test'), email: 'ali@example.test' }
  tokens['jeton-bob'] = { id: await createUser(db, 'bob@example.test'), email: 'bob@example.test' }
  const handler = createApiHandler({
    provider,
    verifyToken: async (token) => tokens[token] ?? null,
    businessStore: createPgliteBusinessStore(db),
    marketplace: createPgliteMarketplace(db),
    moderationKey: KEY,
    async pushSender(subscription, payload) {
      if (subscription.endpoint.includes('expire')) throw Object.assign(new Error('Gone'), { statusCode: 410 })
      pushes.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) })
    },
  })
  server = createServer((req, res) => void handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
  shop = (await call('jeton-awa', 'POST', '/api/business', { name: 'Awa Téléphones' })).body.business.id
  await call('jeton-awa', 'PUT', `/api/business/${shop}/seller`, { displayName: 'Awa Téléphones', city: 'Ouagadougou', whatsapp: '70 12 34 56' })
}, 90_000)
afterAll(() => server.close())

describe('favoris et alertes sur le compte', () => {
  it('enregistre les favoris de chacun (invisibles pour les autres comptes)', async () => {
    const listing = await publish('Tecno Spark 20', 48000, { marque: 'Tecno', ram_go: 8 })
    expect((await call('jeton-ali', 'GET', '/api/saved')).body).toEqual({ favorites: [], alerts: [] })
    const saved = await call('jeton-ali', 'PUT', `/api/saved/favorites/${listing.id}`, { title: 'Tecno Spark 20', price: 48000, currency: 'XOF', photo: 'javascript:alert(1)', city: 'Ouagadougou', sellerName: 'Awa', sellerVerified: false, condition: 'new' })
    expect(saved.status).toBe(200)
    const { favorites } = (await call('jeton-ali', 'GET', '/api/saved')).body
    expect(favorites).toMatchObject([{ listingId: listing.id, snapshot: { title: 'Tecno Spark 20', price: 48000, photo: null } }])
    // Même favori renvoyé : mis à jour, pas en double.
    await call('jeton-ali', 'PUT', `/api/saved/favorites/${listing.id}`, { title: 'Tecno Spark 20', price: 45000 })
    expect((await call('jeton-ali', 'GET', '/api/saved')).body.favorites).toHaveLength(1)
    expect((await call('jeton-bob', 'GET', '/api/saved')).body.favorites).toEqual([])
    // Bob ne peut pas supprimer le favori d’Ali.
    await call('jeton-bob', 'DELETE', `/api/saved/favorites/${listing.id}`)
    expect((await call('jeton-ali', 'GET', '/api/saved')).body.favorites).toHaveLength(1)
    await call('jeton-ali', 'DELETE', `/api/saved/favorites/${listing.id}`)
    expect((await call('jeton-ali', 'GET', '/api/saved')).body.favorites).toEqual([])

    expect((await call('jeton-ali', 'PUT', '/api/saved/favorites/6f1c2b8e-0000-4000-8000-000000000000', { title: 'Inconnue', price: 1 })).status).toBe(404)
    expect((await call('jeton-ali', 'PUT', `/api/saved/favorites/${listing.id}`, { title: '', price: 1 })).status).toBe(422)
    expect((await call('', 'GET', '/api/saved')).status).toBe(401)
  })

  it('enregistre les alertes avec leurs filtres contrôlés, 10 au plus', async () => {
    const created = await call('jeton-ali', 'PUT', `/api/saved/alerts/${ALERT}`, { label: 'tecno · Téléphones · ≤ 50 000 F', filters: { q: 'tecno', category: 'telephones', maxPrice: 50000, attributes: { ram_go: '4' }, inconnu: 'x' }, seenAt: '2026-10-20T10:00:00Z' })
    expect(created.status).toBe(200)
    const { alerts } = (await call('jeton-ali', 'GET', '/api/saved')).body
    expect(alerts).toMatchObject([{ id: ALERT, label: 'tecno · Téléphones · ≤ 50 000 F', filters: { q: 'tecno', category: 'telephones', maxPrice: 50000, attributes: { ram_go: '4' } }, seenAt: '2026-10-20T10:00:00.000Z', notify: true }])
    expect(alerts[0].filters.inconnu).toBeUndefined()
    // Une consultation plus ancienne ne fait pas reculer la date (autre appareil en retard).
    await call('jeton-ali', 'PUT', `/api/saved/alerts/${ALERT}`, { label: 'tecno · Téléphones · ≤ 50 000 F', filters: { q: 'tecno', category: 'telephones', maxPrice: 50000, attributes: { ram_go: '4' } }, seenAt: '2026-10-01T10:00:00Z' })
    expect((await call('jeton-ali', 'GET', '/api/saved')).body.alerts[0].seenAt).toBe('2026-10-20T10:00:00.000Z')

    expect((await call('jeton-ali', 'PUT', '/api/saved/alerts/6f1c2b8e-1111-4111-8111-111111111111', { label: 'Réseau 6G', filters: { category: 'telephones', attributes: { reseau: '6G' } } })).status).toBe(422)
    expect((await call('jeton-ali', 'PUT', '/api/saved/alerts/pas-un-uuid', { label: 'x', filters: {} })).status).toBe(404)
    for (let index = 1; index < 10; index += 1) {
      expect((await call('jeton-bob', 'PUT', `/api/saved/alerts/6f1c2b8e-2222-4222-8222-${String(index).padStart(12, '0')}`, { label: `Alerte ${index}`, filters: { q: `produit ${index}` } })).status).toBe(200)
    }
    expect((await call('jeton-bob', 'PUT', '/api/saved/alerts/6f1c2b8e-2222-4222-8222-000000000010', { label: 'Alerte 10', filters: {} })).status).toBe(200)
    const refused = await call('jeton-bob', 'PUT', '/api/saved/alerts/6f1c2b8e-2222-4222-8222-000000000011', { label: 'Alerte 11', filters: {} })
    expect(refused).toMatchObject({ status: 422, body: { error: 'Vous avez déjà 10 alertes : supprimez-en une d’abord.' } })
    // Bob ne peut ni lire ni écraser l’alerte d’Ali.
    expect((await call('jeton-bob', 'PUT', `/api/saved/alerts/${ALERT}`, { label: 'piratée', filters: {} })).status).toBeGreaterThanOrEqual(400)
    expect((await call('jeton-ali', 'GET', '/api/saved')).body.alerts[0].label).toBe('tecno · Téléphones · ≤ 50 000 F')
    for (let index = 1; index <= 10; index += 1) await call('jeton-bob', 'DELETE', `/api/saved/alerts/6f1c2b8e-2222-4222-8222-${String(index).padStart(12, '0')}`)
  })
})

describe('notifications du téléphone', () => {
  it('donne une clé publique VAPID stable, générée et gardée par le serveur', async () => {
    const first = (await call('', 'GET', '/api/push/key')).body.publicKey
    expect(first).toMatch(/^[A-Za-z0-9_-]{80,}$/)
    expect((await call('', 'GET', '/api/push/key')).body.publicKey).toBe(first)
  })

  it('notifie une seule fois les alertes satisfaites par une nouvelle annonce, sauf au vendeur lui-même', async () => {
    expect((await call('jeton-ali', 'POST', '/api/push/subscriptions', { endpoint: 'https://push.example.test/ali-telephone', keys: { p256dh: P256DH, auth: AUTH } })).status).toBe(201)
    expect((await call('jeton-ali', 'POST', '/api/push/subscriptions', { endpoint: 'https://push.example.test/expire-ancien', keys: { p256dh: P256DH, auth: AUTH } })).status).toBe(201)
    expect((await call('jeton-ali', 'POST', '/api/push/subscriptions', { endpoint: 'http://pas-https', keys: { p256dh: P256DH, auth: AUTH } })).status).toBe(422)
    // Awa suit aussi les Tecno : elle n’est pas notifiée de ses propres annonces.
    await call('jeton-awa', 'POST', '/api/push/subscriptions', { endpoint: 'https://push.example.test/awa', keys: { p256dh: P256DH, auth: AUTH } })
    await call('jeton-awa', 'PUT', '/api/saved/alerts/6f1c2b8e-3333-4333-8333-333333333333', { label: 'Mes Tecno', filters: { q: 'tecno' } })

    pushes.length = 0
    const matching = await publish('Tecno Pop 8 neuf', 45000, { marque: 'Tecno', ram_go: 6 })
    await settle()
    expect(pushes).toEqual([{ endpoint: 'https://push.example.test/ali-telephone', payload: { title: 'Nouvelle annonce : tecno · Téléphones · ≤ 50 000 F', body: 'Tecno Pop 8 neuf — 45 000 F CFA à Ouagadougou', url: `/marketplace/annonce/${matching.id}`, tag: `alerte-${ALERT}` } }])

    // Appareil disparu (410) : oublié, il ne reçoit plus rien.
    await settle()
    expect((await db.query('select endpoint from public.push_subscriptions order by endpoint')).rows.map((/** @type {any} */ row) => row.endpoint)).toEqual(['https://push.example.test/ali-telephone', 'https://push.example.test/awa'])
    pushes.length = 0
    await publish('Tecno Spark 10', 49000, { marque: 'Tecno', ram_go: 4 })
    await settle()
    expect(pushes.map((push) => push.endpoint)).toEqual(['https://push.example.test/ali-telephone'])

    // Ne correspond pas : trop de RAM demandée (3 Go), ou au-dessus du budget.
    pushes.length = 0
    await publish('Tecno Pop 5', 30000, { marque: 'Tecno', ram_go: 3 })
    await publish('Tecno Camon 30', 120000, { marque: 'Tecno', ram_go: 8 })
    await settle()
    expect(pushes).toEqual([])

    // Annonce modifiée puis republiée : pas de seconde notification.
    await call('jeton-awa', 'POST', `/api/business/${shop}/listings`, { productId: matching.productId, title: 'Tecno Pop 8 neuf, prix cassé', description: 'Garantie 6 mois.', category: 'telephones', subcategory: 'smartphones', condition: 'new', attributes: { marque: 'Tecno', ram_go: 6 }, keepPhotos: matching.photos.map((/** @type {any} */ photo) => photo.path) })
    await settle()
    expect(pushes).toEqual([])
  })

  it('désabonne l’appareil', async () => {
    expect((await call('jeton-ali', 'DELETE', '/api/push/subscriptions', { endpoint: 'https://push.example.test/ali-telephone' })).status).toBe(200)
    pushes.length = 0
    await publish('Tecno Spark 30C', 47000, { marque: 'Tecno', ram_go: 8 })
    await settle()
    expect(pushes).toEqual([])
  })
})
