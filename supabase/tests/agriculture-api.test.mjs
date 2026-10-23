// @vitest-environment node
// Onglet Agriculture de bout en bout : serveur → base PostgreSQL (PGlite, RLS) → moteur d’IA simulé.
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiHandler } from '../../server/chat-handler.mjs'
import { createTestDatabase, createUser } from './database.mjs'
import { createPgliteAgricultureStore } from './pglite-agriculture.mjs'
import { createPgliteBusinessStore } from './pglite-store.mjs'

/** @type {import('node:http').Server} */
let server
let base = ''
/** @type {Record<string, { id: string, email: string }>} */
const tokens = {}
/** @type {any[]} */
const requests = []
let farm = ''
let plot = ''
let maize = ''

const today = new Date().toISOString().slice(0, 10)
const year = Number(today.slice(0, 4))
const day = (/** @type {number} */ offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

/** @type {import('../../server/ai/provider.mjs').AiProvider} */
const provider = {
  name: 'gemini',
  configured: true,
  models: { standard: 'gemini-test', lite: 'gemini-lite-test' },
  async *streamReply(request) {
    requests.push(request)
    if (request.messages.at(-1)?.content.startsWith('J’ai récolté')) {
      yield { text: 'Voici les fiches à vérifier.' }
      yield { functionCall: { name: 'proposer_operation_agricole', args: { culture: 'maïs', type: 'recolte', quantite: 12, unite: 'sac', poids_unite_kg: 100, montant: 5000 } } }
      yield { functionCall: { name: 'proposer_operation_agricole', args: { culture: 'Maïs — Champ 1', type: 'intrant', type_intrant: 'engrais', produit: 'Urée', quantite: 2, unite: 'sac', montant: 36000 } } }
      yield { functionCall: { name: 'proposer_travail_prevu', args: { culture: 'Maïs', type_travail: 'sarclage', libelle: 'Deuxième sarclage', date_prevue: day(5) } } }
      yield { functionCall: { name: 'proposer_culture', args: { parcelle: 'champ 1', culture: 'autre', nom_culture: 'Igname', saison: 'pluies', annee: year, surface: 0.25, unite_surface: 'ha' } } }
      yield { functionCall: { name: 'proposer_parcelle', args: { nom: 'Jardin du bas-fond', surface: 800, unite_surface: 'm2', acces: 'location' } } }
      return
    }
    yield { text: 'Votre rendement est de 1 200 kg/ha.' }
  },
  generateTitle: async () => null,
}

beforeAll(async () => {
  const db = await createTestDatabase()
  tokens['jeton-alice'] = { id: await createUser(db, 'alice@example.test'), email: 'alice@example.test' }
  tokens['jeton-bob'] = { id: await createUser(db, 'bob@example.test'), email: 'bob@example.test' }
  const handler = createApiHandler({ provider, verifyToken: async (token) => tokens[token] ?? null, businessStore: createPgliteBusinessStore(db), agricultureStore: createPgliteAgricultureStore(db) })
  server = createServer((req, res) => void handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
}, 60_000)
afterAll(() => server.close())

/** @param {string} token @param {string} method @param {string} path @param {unknown} [body] */
async function call(token, method, path, body) {
  const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, body: /** @type {any} */ (response.headers.get('content-type')?.includes('ndjson') ? text.trim().split('\n').map((line) => JSON.parse(line)) : JSON.parse(text)) }
}
const api = (/** @type {string} */ path) => `/api/business/${farm}/agriculture${path}`

describe('onglet Agriculture', () => {
  it('crée parcelles et cultures, surfaces converties en m²', async () => {
    farm = (await call('jeton-alice', 'POST', '/api/business', { name: 'Ferme Awa' })).body.business.id
    const created = await call('jeton-alice', 'POST', api('/plots'), { name: ' Champ 1 ', location: 'Koudougou', area: 2, areaUnit: 'ha', tenure: 'rented' })
    expect(created.status).toBe(201)
    expect(created.body.plot).toMatchObject({ name: 'Champ 1', areaM2: 20000, areaUnit: 'ha', tenure: 'rented' })
    plot = created.body.plot.id
    const crop = await call('jeton-alice', 'POST', api('/crops'), { plotId: plot, crop: 'maize', season: 'rainy', year, area: 1.5, sownOn: day(-90) })
    expect(crop.body.crop).toMatchObject({ cropLabel: 'Maïs', plotName: 'Champ 1', areaM2: 15000, stockKg: 0, status: 'active' })
    maize = crop.body.crop.id
    expect((await call('jeton-alice', 'POST', api('/crops'), { plotId: plot, crop: 'other', season: 'rainy', year, area: 1 })).body.error).toMatch(/nom de la culture/)
    expect((await call('jeton-alice', 'POST', api('/crops'), { plotId: plot, crop: 'rice', season: 'dry', year, area: 3 })).body.error).toMatch(/dépasse celle de la parcelle/)
    expect((await call('jeton-bob', 'POST', api('/plots'), { name: 'Intrus', area: 1 })).status).toBe(403)
    expect((await call('jeton-bob', 'GET', api('/plots'))).body.plots).toEqual([])
  })

  it('tient le journal, le stock de récolte, les travaux prévus et les résultats', async () => {
    await call('jeton-alice', 'POST', api('/operations'), { cropId: maize, kind: 'input', inputType: 'fertilizer', label: 'NPK', quantity: 3, unit: 'sac', amount: 54000, note: 'Payé à crédit' })
    await call('jeton-alice', 'POST', api('/operations'), { cropId: maize, kind: 'work', workType: 'weeding', amount: 20000 })
    const harvest = await call('jeton-alice', 'POST', api('/operations'), { cropId: maize, kind: 'harvest', quantity: 18, unit: 'sac', unitKg: 100 })
    expect(harvest.body.operation).toMatchObject({ cropLabel: 'Maïs', plotName: 'Champ 1', kind: 'harvest', quantity: 18, unit: 'sac', quantityKg: 1800, stockDelta: 1800 })
    await call('jeton-alice', 'POST', api('/operations'), { cropId: maize, kind: 'sale', quantity: 1000, amount: 250000 })
    expect((await call('jeton-alice', 'POST', api('/operations'), { cropId: maize, kind: 'sale', quantity: 1, unit: 'tonne', amount: 1 })).body.error).toMatch(/il reste 800 kg/)
    expect((await call('jeton-alice', 'POST', api('/operations'), { cropId: maize, kind: 'harvest', quantity: 1, unit: 'botte' })).status).toBe(422)

    const task = await call('jeton-alice', 'POST', api('/tasks'), { cropId: maize, workType: 'treatment', label: 'Traitement chenilles', dueOn: day(-1) })
    expect(task.body.task).toMatchObject({ cropLabel: 'Maïs', plotName: 'Champ 1', status: 'planned' })
    const done = await call('jeton-alice', 'PATCH', api(`/tasks/${task.body.task.id}`), { status: 'done', doneOn: today, amount: 6000 })
    expect(done.body.task).toMatchObject({ status: 'done', doneOn: today })

    const operations = (await call('jeton-alice', 'GET', api(`/operations?from=${day(-30)}&to=${today}`))).body.operations
    expect(operations.map((/** @type {any} */ operation) => operation.kind).sort()).toEqual(['harvest', 'input', 'sale', 'work', 'work'])

    const results = await call('jeton-alice', 'GET', api(`/results?year=${year}`))
    // 1 800 kg sur 1,5 ha → 1 200 kg/ha ; coûts 54 000 + 20 000 + 6 000 = 80 000 ; marge 250 000 − 80 000 = 170 000.
    expect(results.body.crops[0]).toMatchObject({ cropLabel: 'Maïs', harvestedKg: 1800, yieldKgPerHa: 1200, soldKg: 1000, stockKg: 800, inputCost: 54000, labourCost: 26000, totalCost: 80000, salesRevenue: 250000, estimatedMargin: 170000 })
    expect((await call('jeton-alice', 'GET', api('/results'))).status).toBe(422)

    const sale = operations.find((/** @type {any} */ operation) => operation.kind === 'sale')
    const cancelled = await call('jeton-alice', 'POST', api(`/operations/${sale.id}/cancel`), { reason: 'Erreur' })
    expect(cancelled.body.operation).toMatchObject({ status: 'cancelled', cancelReason: 'Erreur' })
    expect((await call('jeton-alice', 'GET', api(`/crops?year=${year}`))).body.crops[0].stockKg).toBe(1800)
  })

  it('l’assistant reçoit les chiffres de l’exploitation, la prudence sur les traitements, et prépare des fiches', async () => {
    const { status, body: lines } = await call('jeton-alice', 'POST', api('/assistant'), { messages: [{ role: 'user', content: 'J’ai récolté 12 sacs de maïs' }] })
    expect(status).toBe(200)
    const sent = requests.at(-1)
    expect(sent.webSearch).toBe(false)
    expect(sent.functions.map((/** @type {any} */ fn) => fn.name)).toEqual(['proposer_parcelle', 'proposer_culture', 'proposer_operation_agricole', 'proposer_travail_prevu'])
    expect(sent.instructions).toContain('- Champ 1 (Koudougou) : 2 ha, louée.')
    expect(sent.instructions).toContain('- Maïs — Champ 1 : saison des pluies')
    expect(sent.instructions).toContain('rendement 1200 kg/ha')
    expect(sent.instructions).toContain('ne donne jamais de dose')
    expect(sent.instructions).not.toContain('Payé à crédit') // les notes ne sont pas transmises

    expect(lines[0].context.plots).toHaveLength(1)
    const { proposals } = lines.find((/** @type {any} */ line) => line.proposals)
    expect(proposals.map((/** @type {any} */ proposal) => proposal.values)).toEqual([
      { cropId: maize, cropName: 'Maïs — Champ 1', kind: 'harvest', workType: null, inputType: null, label: null, quantity: 12, unit: 'sac', unitKg: 100, amount: null, occurredOn: null, note: null },
      { cropId: maize, cropName: 'Maïs — Champ 1', kind: 'input', workType: null, inputType: 'fertilizer', label: 'Urée', quantity: 2, unit: 'sac', unitKg: null, amount: 36000, occurredOn: null, note: null },
      { cropId: maize, cropName: 'Maïs — Champ 1', workType: 'weeding', label: 'Deuxième sarclage', dueOn: day(5) },
      { plotId: plot, plotName: 'Champ 1', crop: 'other', customLabel: 'Igname', season: 'rainy', year, area: 0.25, areaUnit: 'ha', sownOn: null, expectedHarvestOn: null },
      { name: 'Jardin du bas-fond', location: null, area: 800, areaUnit: 'm2', tenure: 'rented' },
    ])
    // Rien n’est enregistré par l’assistant.
    expect((await call('jeton-alice', 'GET', api('/plots'))).body.plots).toHaveLength(1)
    expect((await call('jeton-alice', 'GET', api('/assistant'))).body.quota).toMatchObject({ used: 1 })
    expect((await call('jeton-bob', 'POST', api('/assistant'), { messages: [{ role: 'user', content: 'Bonjour' }] })).status).toBe(403)
  })
})
