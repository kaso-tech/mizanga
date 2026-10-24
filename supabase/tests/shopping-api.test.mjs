// @vitest-environment node
// Assistant d’achat de bout en bout : serveur → marketplace (PGlite, annonces publiées) → moteur simulé.
// On vérifie la recherche demandée par le modèle, le classement calculé, les fiches envoyées au navigateur
// et ce que le modèle reçoit pour rédiger sa réponse.
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiHandler } from '../../server/chat-handler.mjs'
import { createTestDatabase, createUser } from './database.mjs'
import { createPgliteBusinessStore } from './pglite-store.mjs'
import { createPgliteMarketplace } from './pglite-marketplace.mjs'

const KEY = 'cle-de-moderation-de-test-tres-longue'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** @type {import('node:http').Server} */
let server
let base = ''
/** @type {Record<string, { id: string, email: string }>} */
const tokens = {}
/** @type {any[]} */
const requests = []
/** Recherche que le modèle simulé demande au prochain message. */
/** @type {Record<string, unknown> | null} */
let nextSearch = null

/** @type {import('../../server/ai/provider.mjs').AiProvider} */
const provider = {
  name: 'gemini',
  configured: true,
  models: { standard: 'gemini-test', lite: 'gemini-lite-test' },
  async *streamReply(request) {
    requests.push(request)
    if (request.functions?.length) {
      if (nextSearch) yield { functionCall: { name: 'rechercher_annonces', args: nextSearch } }
      else yield { text: 'Je suis là pour vous aider à trouver quoi acheter sur Gilli.' }
      return
    }
    yield { text: 'Voici ce que j’ai trouvé : [1] est le meilleur choix.' }
  },
  generateTitle: async () => null,
  generateJson: async () => ({ conforme: true, raisons: [] }),
}

beforeAll(async () => {
  const db = await createTestDatabase()
  await db.query('select public.set_moderation_key($1)', [KEY])
  tokens['jeton-awa'] = { id: await createUser(db, 'awa@example.test'), email: 'awa@example.test' }
  tokens['jeton-ali'] = { id: await createUser(db, 'ali@example.test'), email: 'ali@example.test' }
  const handler = createApiHandler({ provider, verifyToken: async (token) => tokens[token] ?? null, businessStore: createPgliteBusinessStore(db), marketplace: createPgliteMarketplace(db), moderationKey: KEY })
  server = createServer((req, res) => void handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`

  /** @param {string} token @param {string} method @param {string} path @param {unknown} [body] */
  const call = async (token, method, path, body) => /** @type {any} */ (await (await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })).json())
  /** @param {string} token @param {string} name @param {string} city @param {Array<{ title: string, price: number, attributes: Record<string, unknown> }>} items */
  const seller = async (token, name, city, items) => {
    const shop = (await call(token, 'POST', '/api/business', { name })).business.id
    await call(token, 'PUT', `/api/business/${shop}/seller`, { displayName: name, city, whatsapp: '70 12 34 56' })
    for (const item of items) {
      const product = (await call(token, 'POST', `/api/business/${shop}/products`, { name: item.title, unit: 'pièce', purchasePrice: item.price - 5000, salePrice: item.price, initialQuantity: 2 })).product.id
      const { listing } = await call(token, 'POST', `/api/business/${shop}/listings`, { productId: product, title: item.title, description: `${item.title}, garantie 6 mois.`, category: 'telephones', subcategory: 'smartphones', condition: 'new', attributes: item.attributes, newPhotos: [{ mimeType: 'image/png', data: PNG }] })
      expect(listing.status).toBe('published')
    }
  }
  await seller('jeton-awa', 'Awa Téléphones', 'Ouagadougou', [
    { title: 'Tecno Spark 20 Android', price: 48000, attributes: { marque: 'Tecno', ram_go: 8, double_sim: true } },
    { title: 'Itel A70 Android', price: 39000, attributes: { marque: 'Itel', ram_go: 3 } },
  ])
  await seller('jeton-ali', 'Ali Mobile', 'Bobo-Dioulasso', [
    { title: 'Samsung Galaxy A15 Android', price: 95000, attributes: { marque: 'Samsung', ram_go: 6, double_sim: true } },
  ])
}, 90_000)
afterAll(() => server.close())

/** @param {string} content */
async function ask(content) {
  const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content }], preferences: {} }) })
  return { status: response.status, lines: (await response.text()).trim().split('\n').map((line) => JSON.parse(line)) }
}

describe('assistant d’achat', () => {
  it('cherche dans la marketplace, classe les annonces dans le budget d’abord et envoie leurs fiches', async () => {
    nextSearch = { requete: 'android', categorie: 'telephones', budget_max: 50000, ville: 'Ouagadougou', criteres: [{ caracteristique: 'ram_go', minimum: 4 }] }
    const { status, lines } = await ask('J’ai 50 000 F, je veux un téléphone Android performant à Ouaga')
    expect(status).toBe(200)
    const [{ listings }, ...text] = lines
    expect(listings.map((/** @type {any} */ item) => [item.rank, item.title, item.price, item.score])).toEqual([
      // Budget (25) + RAM (35) + mots (10) + même ville (15) + récent (5) = 90 ; l’Itel n’a que 3 Go : 55.
      [1, 'Tecno Spark 20 Android', 48000, 90],
      [2, 'Itel A70 Android', 39000, 55],
    ])
    expect(listings[0]).toMatchObject({ sellerName: 'Awa Téléphones', city: 'Ouagadougou', whatsapp: '22670123456', overBudget: false, reasons: ['Dans votre budget (48 000 F CFA)', 'Mémoire vive (RAM) : 8 Go', 'À Ouagadougou'] })
    expect(listings[0].photo).toMatch(/^\/photos\//)
    expect(listings[1].warnings).toEqual(['Mémoire vive (RAM) : 3 Go (moins que demandé)'])
    expect(text).toEqual([{ text: 'Voici ce que j’ai trouvé : [1] est le meilleur choix.' }])

    const [first, second] = requests.slice(-2)
    expect(first.functions.map((/** @type {any} */ fn) => fn.name)).toEqual(['rechercher_annonces'])
    expect(first.webSearch).toBe(false)
    expect(second.functions).toBeUndefined()
    expect(second.instructions).toContain('[1] Tecno Spark 20 Android — 48000 F CFA')
    expect(second.instructions).toContain('Mémoire vive (RAM) : 8 Go')
    expect(second.instructions).not.toContain('Samsung') // au-dessus du budget, il n’est pas proposé
  })

  it('élargit pas à pas : d’abord sans les mots-clés (en gardant le budget), puis au-dessus du budget en le disant', async () => {
    nextSearch = { requete: 'samsung', categorie: 'telephones', budget_max: 50000 }
    const brand = await ask('Un Samsung à moins de 50 000 F')
    expect(brand.lines[0].listings.map((/** @type {any} */ item) => [item.title, item.overBudget])).toEqual([['Tecno Spark 20 Android', false], ['Itel A70 Android', false]])
    expect(requests.at(-1).instructions).toContain('Aucune annonce ne contenait les mots-clés : voici les annonces de la catégorie dans le budget.')

    nextSearch = { categorie: 'telephones', budget_max: 30000 }
    const budget = await ask('Un téléphone à moins de 30 000 F')
    // Les plus proches du budget d’abord.
    expect(budget.lines[0].listings.map((/** @type {any} */ item) => [item.price, item.overBudget])).toEqual([[39000, true], [48000, true], [95000, true]])
    expect(requests.at(-1).instructions).toContain('Aucune annonce dans le budget : voici les plus proches, au-dessus du budget')
  })

  it('sans résultat, ne cite aucun produit ; hors sujet, ne cherche pas', async () => {
    nextSearch = { categorie: 'electromenager' }
    const empty = await ask('Un réfrigérateur')
    expect(empty.lines.some((/** @type {any} */ line) => line.listings)).toBe(false)
    expect(requests.at(-1).instructions).toContain('Aucune annonce ne correspond pour le moment')

    nextSearch = null
    const offTopic = await ask('Rédige ma dissertation de philosophie')
    expect(offTopic.lines).toEqual([{ text: 'Je suis là pour vous aider à trouver quoi acheter sur Gilli.' }])
    expect(requests.at(-1).instructions).toContain('Hors sujet : tu ne traites que les achats.')
  })
})
