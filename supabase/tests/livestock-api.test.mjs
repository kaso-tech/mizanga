// @vitest-environment node
// Onglet Élevage de bout en bout : serveur → base PostgreSQL (PGlite, RLS) → moteur d’IA simulé.
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiHandler } from '../../server/chat-handler.mjs'
import { createTestDatabase, createUser } from './database.mjs'
import { createPgliteLivestockStore } from './pglite-livestock.mjs'
import { createPgliteBusinessStore } from './pglite-store.mjs'

/** @type {import('node:http').Server} */
let server
let base = ''
/** @type {Record<string, { id: string, email: string }>} */
const tokens = {}
/** @type {any[]} */
const requests = []
let farm = ''
let poultry = ''

const today = new Date().toISOString().slice(0, 10)
const day = (/** @type {number} */ offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

/** @type {import('../../server/ai/provider.mjs').AiProvider} */
const provider = {
  name: 'gemini',
  configured: true,
  models: { standard: 'gemini-test', lite: 'gemini-lite-test' },
  async *streamReply(request) {
    requests.push(request)
    if (request.messages.at(-1)?.content.startsWith('J’ai perdu')) {
      yield { text: 'Voici la fiche à vérifier. Si d’autres poulets meurent, contactez un vétérinaire.' }
      yield { functionCall: { name: 'proposer_evenement_elevage', args: { lot: 'poulets bande 1', type: 'mortalite', nombre: 3, cause: 'inconnue', montant: 500 } } }
      yield { functionCall: { name: 'proposer_soin', args: { lot: 'Bovins', type: 'vaccination', produit: 'Pasteurellose', date_prevue: day(10), numero_animal: 'bf-001' } } }
      yield { functionCall: { name: 'proposer_evenement_elevage', args: { lot: 'Bovins', type: 'vente', numero_animal: 'BF-001', montant: 400000 } } }
      yield { functionCall: { name: 'proposer_creation_lot', args: { nom: 'Porcs 2026', espece: 'porcs', suivi: 'groupe', effectif: 12 } } }
      return
    }
    yield { text: 'Votre mortalité est de 2 %.' }
  },
  generateTitle: async () => null,
}

beforeAll(async () => {
  const db = await createTestDatabase()
  tokens['jeton-alice'] = { id: await createUser(db, 'alice@example.test'), email: 'alice@example.test' }
  tokens['jeton-bob'] = { id: await createUser(db, 'bob@example.test'), email: 'bob@example.test' }
  const handler = createApiHandler({ provider, verifyToken: async (token) => tokens[token] ?? null, businessStore: createPgliteBusinessStore(db), livestockStore: createPgliteLivestockStore(db) })
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
  const text = await response.text()
  return { status: response.status, body: /** @type {any} */ (response.headers.get('content-type')?.includes('ndjson') ? text.trim().split('\n').map((line) => JSON.parse(line)) : JSON.parse(text)) }
}
const api = (/** @type {string} */ path) => `/api/business/${farm}/livestock${path}`

describe('onglet Élevage', () => {
  it('crée des lots ; les bovins sont suivis un par un par défaut', async () => {
    farm = (await call('jeton-alice', 'POST', '/api/business', { name: 'Ferme Awa' })).body.business.id
    const created = await call('jeton-alice', 'POST', api('/herds'), { name: '  Poulets bande 1 ', species: 'poultry', initialCount: 200, startedOn: day(-20) })
    expect(created.status).toBe(201)
    expect(created.body.herd).toMatchObject({ name: 'Poulets bande 1', species: 'poultry', tracking: 'group', headcount: 200, startedOn: day(-20) })
    poultry = created.body.herd.id
    const cattle = await call('jeton-alice', 'POST', api('/herds'), { name: 'Bovins', species: 'cattle' })
    expect(cattle.body.herd).toMatchObject({ tracking: 'individual', headcount: 0 })
    expect((await call('jeton-alice', 'POST', api('/herds'), { name: 'X', species: 'chameau' })).status).toBe(422)
    expect((await call('jeton-bob', 'POST', api('/herds'), { name: 'Intrus', species: 'pig' })).status).toBe(403)
    expect((await call('jeton-bob', 'GET', api('/herds'))).body.herds).toEqual([])
    expect((await call('jeton-alice', 'GET', api('/herds'))).body.herds.map((/** @type {any} */ herd) => herd.name)).toEqual(['Bovins', 'Poulets bande 1'])
  })

  it('tient le journal, les animaux, les soins et les résultats', async () => {
    const herds = (await call('jeton-alice', 'GET', api('/herds'))).body.herds
    const cattle = herds.find((/** @type {any} */ herd) => herd.name === 'Bovins')
    expect((await call('jeton-alice', 'POST', api('/events'), { herdId: cattle.id, kind: 'purchase', amount: 350000, animal: { tag: 'BF-001', sex: 'female' } })).status).toBe(201)
    const death = await call('jeton-alice', 'POST', api('/events'), { herdId: poultry, kind: 'death', quantity: 4, cause: 'Chaleur', occurredOn: day(-3) })
    expect(death.body.event).toMatchObject({ herdName: 'Poulets bande 1', kind: 'death', quantity: 4, headcountDelta: -4, cause: 'Chaleur', occurredOn: day(-3) })
    await call('jeton-alice', 'POST', api('/events'), { herdId: poultry, kind: 'feed', amount: 45000, note: '3 sacs' })
    await call('jeton-alice', 'POST', api('/events'), { herdId: poultry, kind: 'sale', quantity: 50, amount: 150000 })
    expect((await call('jeton-alice', 'POST', api('/events'), { herdId: poultry, kind: 'sale', quantity: 500, amount: 1 })).body.error).toMatch(/Effectif insuffisant/)
    expect((await call('jeton-alice', 'POST', api('/events'), { herdId: poultry, kind: 'birth', quantity: 1.5 })).status).toBe(422)

    const animals = (await call('jeton-alice', 'GET', api('/animals'))).body.animals
    expect(animals).toEqual([expect.objectContaining({ herdId: cattle.id, tag: 'BF-001', sex: 'female', status: 'present' })])

    const planned = await call('jeton-alice', 'POST', api('/health'), { herdId: poultry, kind: 'vaccination', product: 'Newcastle', dueOn: day(-1) })
    expect(planned.body.record).toMatchObject({ herdName: 'Poulets bande 1', status: 'planned', dueOn: day(-1) })
    const done = await call('jeton-alice', 'PATCH', api(`/health/${planned.body.record.id}`), { status: 'done', doneOn: today, cost: 6000 })
    expect(done.body.record).toMatchObject({ status: 'done', doneOn: today, cost: 6000 })
    expect((await call('jeton-alice', 'POST', api('/health'), { herdId: poultry, kind: 'vaccination', product: 'Gumboro' })).status).toBe(422)

    const events = (await call('jeton-alice', 'GET', api(`/events?from=${day(-30)}&to=${today}`))).body.events
    expect(events.map((/** @type {any} */ event) => event.kind).sort()).toEqual(['death', 'feed', 'purchase', 'sale', 'start'])

    const summary = await call('jeton-alice', 'GET', api(`/summary?from=${day(-30)}&to=${today}`))
    const row = summary.body.herds.find((/** @type {any} */ item) => item.herdId === poultry)
    // 4 morts sur 200 → 2 % ; coûts 45 000 + 6 000 = 51 000 ; marge 150 000 − 51 000 = 99 000.
    expect(row).toMatchObject({ openingHeadcount: 200, closingHeadcount: 146, deaths: 4, sales: 50, mortalityRate: 2, feedCost: 45000, healthCost: 6000, totalCost: 51000, salesRevenue: 150000, estimatedMargin: 99000 })

    // Annulation : effectif rétabli.
    const cancelled = await call('jeton-alice', 'POST', api(`/events/${death.body.event.id}/cancel`), { reason: 'Erreur' })
    expect(cancelled.body.event).toMatchObject({ status: 'cancelled', cancelReason: 'Erreur' })
    expect((await call('jeton-alice', 'GET', api('/herds'))).body.herds.find((/** @type {any} */ herd) => herd.id === poultry).headcount).toBe(150)
  })

  it('l’assistant reçoit les chiffres de l’élevage, la prudence vétérinaire, et prépare des fiches', async () => {
    const { status, body: lines } = await call('jeton-alice', 'POST', api('/assistant'), { messages: [{ role: 'user', content: 'J’ai perdu 3 poulets ce matin' }] })
    expect(status).toBe(200)
    const sent = requests.at(-1)
    expect(sent.webSearch).toBe(false)
    expect(sent.functions.map((/** @type {any} */ fn) => fn.name)).toEqual(['proposer_creation_lot', 'proposer_evenement_elevage', 'proposer_soin'])
    expect(sent.instructions).toContain('- Poulets bande 1 : Volailles, 150 animaux, suivi en groupe')
    expect(sent.instructions).toContain('- BF-001 (Bovins, femelle)')
    expect(sent.instructions).toContain('Ne donne jamais de dose, de posologie')
    expect(sent.instructions).toContain('ventes 150000 ; marge estimée 99000')
    expect(sent.instructions).not.toContain('3 sacs') // les notes ne sont pas transmises

    expect(lines[0].context.herds).toHaveLength(2)
    const { proposals } = lines.find((/** @type {any} */ line) => line.proposals)
    const cattle = (await call('jeton-alice', 'GET', api('/herds'))).body.herds.find((/** @type {any} */ herd) => herd.name === 'Bovins')
    const animal = (await call('jeton-alice', 'GET', api('/animals'))).body.animals[0]
    expect(proposals.map((/** @type {any} */ proposal) => proposal.values)).toEqual([
      { herdId: poultry, herdName: 'Poulets bande 1', kind: 'death', quantity: 3, amount: null, cause: 'inconnue', occurredOn: null, animalId: null, animalTag: null, sex: null, note: null },
      { herdId: cattle.id, herdName: 'Bovins', kind: 'vaccination', product: 'Pasteurellose', dueOn: day(10), doneOn: null, cost: null, animalId: animal.id, animalTag: 'bf-001', note: null },
      { herdId: cattle.id, herdName: 'Bovins', kind: 'sale', quantity: null, amount: 400000, cause: null, occurredOn: null, animalId: animal.id, animalTag: 'BF-001', sex: null, note: null },
      { name: 'Porcs 2026', species: 'pig', tracking: 'group', initialCount: 12, startedOn: null },
    ])
    // Rien n’est enregistré par l’assistant.
    expect((await call('jeton-alice', 'GET', api('/herds'))).body.herds).toHaveLength(2)
    // Limite du jour commune aux assistants de l’entreprise.
    expect((await call('jeton-alice', 'GET', api('/assistant'))).body.quota).toMatchObject({ used: 1 })
    expect((await call('jeton-alice', 'GET', `/api/business/${farm}/assistant`)).body.quota).toMatchObject({ used: 1 })
    expect((await call('jeton-bob', 'POST', api('/assistant'), { messages: [{ role: 'user', content: 'Bonjour' }] })).status).toBe(403)
  })
})
