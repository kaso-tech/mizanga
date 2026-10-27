// @vitest-environment node
// Monétisation de bout en bout : limites de la formule Gratuit, déclaration d’un paiement Mobile Money,
// confirmation dans la console (formule Pro, sponsorisation), fin de la période Pro, tarifs.
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
/** @type {import('@electric-sql/pglite').PGlite} */
let db
let base = ''
let shop = ''
let cookie = ''
/** @type {Record<string, { id: string, email: string }>} */
const tokens = {}
/** @type {string[]} */
const listings = []

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
  return { status: response.status, body: /** @type {any} */ (await response.json()) }
}
/** @param {string} method @param {string} path @param {unknown} [body] */
const admin = (method, path, body) => call('', method, path, body, { Cookie: cookie })
const subscription = async () => (await call('jeton-awa', 'GET', `/api/business/${shop}/subscription`)).body.subscription

/** Publie un produit ; renvoie la réponse. @param {string} name @param {number} photos */
async function publish(name, photos = 1) {
  const product = (await call('jeton-awa', 'POST', `/api/business/${shop}/products`, { name, unit: 'pièce', purchasePrice: 10000, salePrice: 15000, initialQuantity: 2 })).body.product.id
  const response = await call('jeton-awa', 'POST', `/api/business/${shop}/listings`, { productId: product, title: `${name} neuf`, description: 'Garantie 6 mois.', category: 'telephones', subcategory: 'smartphones', condition: 'new', attributes: {}, newPhotos: Array.from({ length: photos }, () => ({ mimeType: 'image/png', data: PNG })) })
  if (response.status === 201) listings.push(response.body.listing.id)
  return response
}

beforeAll(async () => {
  db = await createTestDatabase()
  await db.query('select public.set_moderation_key($1)', [KEY])
  for (const name of ['awa', 'bob']) tokens[`jeton-${name}`] = { id: await createUser(db, `${name}@example.test`), email: `${name}@example.test` }
  const handler = createApiHandler({ provider, verifyToken: async (token) => tokens[token] ?? null, businessStore: createPgliteBusinessStore(db), marketplace: createPgliteMarketplace(db), moderationKey: KEY, adminEmail: 'admin@gilli.test', adminPassword: ADMIN_PASSWORD })
  server = createServer((req, res) => void handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
  shop = (await call('jeton-awa', 'POST', '/api/business', { name: 'Awa Téléphones' })).body.business.id
  await call('jeton-awa', 'PUT', `/api/business/${shop}/seller`, { displayName: 'Awa Téléphones', city: 'Ouagadougou', whatsapp: '70 12 34 56' })
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@gilli.test', password: ADMIN_PASSWORD }) })
  cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
}, 90_000)
afterAll(() => server.close())

describe('formule Gratuit', () => {
  it('limite les annonces en ligne et les photos par annonce', async () => {
    for (let index = 1; index <= 5; index += 1) expect((await publish(`Téléphone ${index}`)).status).toBe(201)
    expect(await publish('Téléphone 6')).toMatchObject({ status: 409, body: { error: 'Votre formule Gratuit permet 5 annonce(s) en ligne : retirez-en une ou passez à la formule Pro.' } })
    expect((await publish('Téléphone 7', 4)).body.error).toBe('Votre formule Gratuit permet 3 photo(s) par annonce.')
    // Une annonce en ligne peut toujours être modifiée ; une annonce retirée libère une place.
    await call('jeton-awa', 'POST', `/api/business/${shop}/listings/${listings[0]}/withdraw`)
    expect((await publish('Téléphone 8')).status).toBe(201)
    expect(await subscription()).toMatchObject({ planId: 'test', planName: 'Gratuit', maxListings: 5, activeListings: 5, maxPhotos: 3, dailyAiRequests: 30 })
  })

  it('montre les formules, les offres de sponsorisation et les numéros de paiement', async () => {
    const pricing = await admin('PUT', '/api/admin/pricing', {
      plans: [{ id: 'pro', monthlyPrice: 6000, dailyAiRequests: 200, maxBusinesses: 3, maxListings: 100, maxPhotos: 5 }, { id: 'test', monthlyPrice: 999, dailyAiRequests: 30, maxBusinesses: 1, maxListings: 5, maxPhotos: 3 }],
      offers: [{ id: '7-jours', price: 2500 }],
      settings: { accountName: 'KasoTech', orangeMoney: '+226 70 00 00 01', moovMoney: '', instructions: 'Indiquez « Gilli » en motif.' },
    })
    expect(pricing.status).toBe(200)
    expect(pricing.body.pricing.plans.find((/** @type {any} */ plan) => plan.id === 'test').monthlyPrice).toBe(0) // la formule Gratuit reste gratuite
    expect((await admin('PUT', '/api/admin/pricing', { plans: [{ id: 'pro', monthlyPrice: 6000, dailyAiRequests: 200, maxBusinesses: 3, maxListings: 100, maxPhotos: 9 }] })).status).toBe(422)
    expect((await call('', 'PUT', '/api/admin/pricing', {})).status).toBe(401)
    const current = await subscription()
    expect(current.plans.map((/** @type {any} */ plan) => [plan.id, plan.monthlyPrice])).toEqual([['test', 0], ['pro', 6000]])
    expect(current.offers.map((/** @type {any} */ offer) => [offer.id, offer.days, offer.price])).toEqual([['3-jours', 3, 1000], ['7-jours', 7, 2500], ['30-jours', 30, 6000]])
    expect(current.payment).toEqual({ accountName: 'KasoTech', orangeMoney: '22670000001', moovMoney: null, instructions: 'Indiquez « Gilli » en motif.' })
  })
})

describe('paiements', () => {
  it('passe en Pro après confirmation du paiement : montant calculé par Gilli, référence unique', async () => {
    const declared = await call('jeton-awa', 'POST', `/api/business/${shop}/payments`, { kind: 'pro', months: 2, method: 'orange_money', payerPhone: '70 11 22 33', reference: 'PP251027.1234.A12345', amount: 1 })
    expect(declared).toMatchObject({ status: 201, body: { payment: { kind: 'pro', months: 2, amount: 12000, currency: 'XOF', status: 'pending' } } })
    expect((await call('jeton-awa', 'POST', `/api/business/${shop}/payments`, { kind: 'pro', months: 1, method: 'orange_money', payerPhone: '70 11 22 33', reference: 'AUTRE-REF-1' })).body.error).toBe('Un paiement pour la formule Pro est déjà en cours de vérification.')
    expect((await call('jeton-bob', 'POST', `/api/business/${shop}/payments`, { kind: 'pro', months: 1, method: 'orange_money', payerPhone: '70 11 22 33', reference: 'REF-BOB-1' })).status).toBe(403)
    expect((await call('jeton-awa', 'POST', `/api/business/${shop}/payments`, { kind: 'pro', months: 13, method: 'orange_money', payerPhone: '70 11 22 33', reference: 'REF-2' })).status).toBe(422)
    expect((await call('jeton-awa', 'POST', `/api/business/${shop}/payments`, { kind: 'pro', months: 1, method: 'wave', payerPhone: '70 11 22 33', reference: 'REF-2' })).status).toBe(422)

    const queue = (await admin('GET', '/api/admin/payments?status=pending')).body.payments
    expect(queue).toMatchObject([{ kind: 'pro', months: 2, amount: 12000, method: 'orange_money', payerPhone: '22670112233', reference: 'PP251027.1234.A12345', businessName: 'Awa Téléphones' }])
    expect((await admin('POST', `/api/admin/payments/${queue[0].id}`, { status: 'confirmed' })).body.payment.status).toBe('confirmed')
    expect((await admin('POST', `/api/admin/payments/${queue[0].id}`, { status: 'rejected' })).status).toBe(409)

    const pro = await subscription()
    expect(pro).toMatchObject({ planId: 'pro', planName: 'Pro', status: 'active', maxListings: 100, maxPhotos: 5, dailyAiRequests: 200, maxBusinesses: 3 })
    const days = (Date.parse(pro.currentPeriodEnd) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(55)
    expect(days).toBeLessThan(63)
    expect((await publish('Téléphone 9', 5)).status).toBe(201)

    // La même référence ne peut pas resservir.
    expect((await call('jeton-awa', 'POST', `/api/business/${shop}/payments`, { kind: 'pro', months: 1, method: 'orange_money', payerPhone: '70 11 22 33', reference: 'pp251027.1234.a12345' })).body.error).toBe('Cette référence de transaction a déjà été déclarée.')
  })

  it('à la fin de la période Pro, retombe sur la formule Gratuit sans retirer les annonces', async () => {
    await db.query("update public.subscriptions set current_period_end = now() - interval '1 day' where business_id = $1", [shop])
    expect(await subscription()).toMatchObject({ planId: 'test', planName: 'Gratuit', activeListings: 6, currentPeriodEnd: null })
    expect((await publish('Téléphone 10')).status).toBe(409)
    // Un nouveau paiement repart d’aujourd’hui.
    await call('jeton-awa', 'POST', `/api/business/${shop}/payments`, { kind: 'pro', months: 1, method: 'moov_money', payerPhone: '60 11 22 33', reference: 'MOOV-REF-42' })
    const [payment] = (await admin('GET', '/api/admin/payments?status=pending')).body.payments
    await admin('POST', `/api/admin/payments/${payment.id}`, { status: 'confirmed' })
    const days = (Date.parse((await subscription()).currentPeriodEnd) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(27)
    expect(days).toBeLessThan(32)
  })

  it('sponsorise une annonce : présentée à part en tête de la première page des recherches qu’elle satisfait', async () => {
    const target = listings[1]
    expect((await call('jeton-awa', 'POST', `/api/business/${shop}/payments`, { kind: 'sponsor', offerId: '7-jours', listingId: listings[0], method: 'orange_money', payerPhone: '70 11 22 33', reference: 'SPONSOR-RETIREE' })).body.error).toBe('Seule une annonce en ligne peut être sponsorisée.')
    const declared = await call('jeton-awa', 'POST', `/api/business/${shop}/payments`, { kind: 'sponsor', offerId: '7-jours', listingId: target, method: 'orange_money', payerPhone: '70 11 22 33', reference: 'SPONSOR-REF-1' })
    expect(declared.body.payment).toMatchObject({ kind: 'sponsor', offerId: '7-jours', amount: 2500, status: 'pending' })
    expect((await call('', 'GET', '/api/marketplace/search?q=telephone')).body.sponsored).toEqual([])

    const [payment] = (await admin('GET', '/api/admin/payments?status=pending')).body.payments
    expect(payment).toMatchObject({ kind: 'sponsor', days: 7, listingTitle: 'Téléphone 2 neuf' })
    await admin('POST', `/api/admin/payments/${payment.id}`, { status: 'confirmed' })

    const search = (await call('', 'GET', '/api/marketplace/search?q=telephone')).body
    expect(search.sponsored.map((/** @type {any} */ item) => item.id)).toEqual([target])
    expect(search.sponsored[0].photo).toMatch(/^\/photos\//)
    // Les résultats eux-mêmes ne changent pas : l’annonce n’y est ni dédoublée ni déplacée.
    expect(search.items.filter((/** @type {any} */ item) => item.id === target)).toHaveLength(1)
    expect((await call('', 'GET', '/api/marketplace/search?q=telephone&page=2')).body.sponsored).toEqual([])
    expect((await call('', 'GET', '/api/marketplace/search?q=moto')).body.sponsored).toEqual([])
    const sponsorships = (await subscription()).sponsorships
    expect(sponsorships).toMatchObject([{ listingId: target }])
    expect((Date.parse(sponsorships[0].endsAt) - Date.now()) / 86_400_000).toBeGreaterThan(6.9)
  })

  it('refuse un paiement avec un motif, visible du commerçant', async () => {
    await call('jeton-awa', 'POST', `/api/business/${shop}/payments`, { kind: 'sponsor', offerId: '3-jours', listingId: listings[2], method: 'orange_money', payerPhone: '70 11 22 33', reference: 'FAUSSE-REF-9' })
    const [payment] = (await admin('GET', '/api/admin/payments?status=pending')).body.payments
    await admin('POST', `/api/admin/payments/${payment.id}`, { status: 'rejected', note: 'Aucun paiement reçu avec cette référence.' })
    expect((await subscription()).payments[0]).toMatchObject({ kind: 'sponsor', status: 'rejected', adminNote: 'Aucun paiement reçu avec cette référence.' })
    expect((await admin('GET', '/api/admin/payments?status=rejected')).body.payments).toHaveLength(1)
  })
})
