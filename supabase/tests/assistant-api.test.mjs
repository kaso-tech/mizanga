// @vitest-environment node
// Assistant Business de bout en bout : serveur → base PostgreSQL (PGlite, RLS) → moteur d’IA simulé.
// On vérifie ce que le modèle reçoit (chiffres exacts, rien de personnel), la limite du jour et le suivi.
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { UpstreamError } from '../../server/ai/errors.mjs'
import { createApiHandler } from '../../server/chat-handler.mjs'
import { asUser, createTestDatabase, createUser } from './database.mjs'
import { createPgliteBusinessStore } from './pglite-store.mjs'

/** @type {import('node:http').Server} */
let server
let base = ''
/** @type {import('@electric-sql/pglite').PGlite} */
let db
/** @type {Record<string, { id: string, email: string }>} */
const tokens = {}
/** @type {any[]} */
const requests = []
let failNext = false
let shop = ''

/** @type {import('../../server/ai/provider.mjs').AiProvider} */
const provider = {
  name: 'gemini',
  configured: true,
  models: { standard: 'gemini-test', lite: 'gemini-lite-test' },
  async *streamReply(request) {
    requests.push(request)
    if (failNext) {
      failNext = false
      throw new UpstreamError('Le moteur est momentanément indisponible. Réessayez plus tard.', 503)
    }
    if (request.messages.at(-1)?.content.startsWith('Annule')) {
      const reference = /\[([0-9a-f]{8})\]/.exec(request.instructions ?? '')?.[1]
      yield { functionCall: { name: 'proposer_annulation_vente', args: { reference, motif: 'Erreur de saisie' } } }
      yield { functionCall: { name: 'proposer_depense', args: { montant: 5000, categorie: 'Abonnement Wi-Fi' } } }
      return
    }
    if (request.messages.at(-1)?.content.startsWith('Enregistre')) {
      yield { text: 'Voici les fiches à vérifier.' }
      yield { functionCall: { name: 'proposer_creation_produit', args: { nom: 'Huile Dinor 5 L', unite: 'bidon', prix_achat: 9000, prix_vente: 10500, quantite_initiale: 12 } } }
      yield { functionCall: { name: 'proposer_mouvement_stock', args: { produit: 'riz 25kg', type: 'achat', quantite: 5, cout_unitaire: 14500 } } }
      yield { usage: { inputTokens: 2500, outputTokens: 100 } }
      return
    }
    yield { text: 'Votre marge brute du jour est de ' }
    yield { text: '4 075 F CFA.' }
    yield { usage: { inputTokens: 2000, outputTokens: 400 } }
  },
  generateTitle: async () => null,
}

beforeAll(async () => {
  db = await createTestDatabase()
  await db.query("update public.plans set daily_ai_requests = 5 where id = 'test'")
  tokens['jeton-alice'] = { id: await createUser(db, 'alice@example.test'), email: 'alice@example.test' }
  tokens['jeton-bob'] = { id: await createUser(db, 'bob@example.test'), email: 'bob@example.test' }
  const alice = tokens['jeton-alice'].id
  const run = (/** @type {string} */ sql, /** @type {unknown[]} */ params = []) => asUser(db, alice, async () => /** @type {any[]} */ ((await db.query(sql, params)).rows))
  shop = (await run("insert into public.businesses (name, timezone) values ('Boutique Awa', 'UTC') returning id"))[0].id
  const rice = (await run("select id from public.create_product($1, 'Riz 25 kg', 'sac', 15000, 17500, 9, 10)", [shop]))[0].id
  const sugar = (await run("select id from public.create_product($1, 'Sucre', 'kg', 600, 750, 0, 4)", [shop]))[0].id
  await run("select public.create_product($1, 'Savon', 'unité', 250, 300, 0, 0)", [shop])
  await run("select public.record_sale($1, $2::jsonb, 'Mariam Ouédraogo', 'Paiera vendredi')", [shop, JSON.stringify([{ product_id: rice, quantity: 2, unit_price: 17000 }, { product_id: sugar, quantity: 0.5 }])])
  await run("select public.record_expense($1, 6500, 'Transport', 'Taxi-moto pour Mariam', null)", [shop])

  const handler = createApiHandler({
    provider,
    verifyToken: async (token) => tokens[token] ?? null,
    businessStore: createPgliteBusinessStore(db),
    aiPricing: { inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 },
  })
  server = createServer((req, res) => void handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
}, 60_000)
afterAll(() => server.close())

/** @param {string} token @param {unknown} body */
async function ask(token, body) {
  const response = await fetch(`${base}/api/business/${shop}/assistant`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, lines: response.headers.get('content-type')?.includes('ndjson') ? text.trim().split('\n').map((line) => JSON.parse(line)) : [JSON.parse(text)] }
}
const question = { messages: [{ role: 'user', content: 'Comment s’est passée ma journée ?' }] }
const quota = async () => /** @type {any} */ (await (await fetch(`${base}/api/business/${shop}/assistant`, { headers: { Authorization: 'Bearer jeton-alice' } })).json()).quota

describe('assistant Business', () => {
  it('répond à partir des chiffres calculés par la base, sans recherche web', async () => {
    expect(await quota()).toMatchObject({ used: 0, limit: 5 })
    const { status, lines } = await ask('jeton-alice', question)
    expect(status).toBe(200)
    const [first, ...rest] = lines
    expect(first.quota).toMatchObject({ used: 1, limit: 5 })
    expect(first.context.periods[0]).toMatchObject({ key: 'today', summary: { revenue: 34375, costOfGoodsSold: 30300, grossMargin: 4075, expenses: 6500, estimatedResult: -2425, salesCount: 1 } })
    expect(first.context.stock).toMatchObject({ productCount: 3, value: 8 * 15000 + 3.5 * 600 })
    expect(first.context.stock.products.map((/** @type {any} */ product) => [product.name, product.level])).toEqual([['Savon', 'out'], ['Riz 25 kg', 'low'], ['Sucre', 'ok']])
    expect(rest).toEqual([{ text: 'Votre marge brute du jour est de ' }, { text: '4 075 F CFA.' }, { done: true, quota: { used: 1, limit: 5, resetsAt: first.quota.resetsAt } }])

    const sent = requests.at(-1)
    expect(sent.webSearch).toBe(false)
    expect(sent.messages).toEqual(question.messages)
    expect(sent.instructions).toContain('- Aujourd’hui (')
    expect(sent.instructions).toContain('chiffre d’affaires 34375 ; coût des produits vendus 30300 ; marge brute 4075 ; dépenses 6500 ; résultat estimé -2425')
    expect(sent.instructions).toContain('- Riz 25 kg : 2 sac vendu(s), chiffre d’affaires 34000, marge brute 4000.')
    expect(sent.instructions).toContain('- Transport : 6500.')
    expect(sent.instructions).toContain('- Savon : 0 unité (rupture)')
    expect(sent.instructions).toContain('N’invente jamais un chiffre')
  })

  it('ne transmet au modèle ni noms de clients, ni notes, ni descriptions, ni identifiants, ni e-mails', async () => {
    const sent = requests.at(-1).instructions
    for (const secret of ['Mariam', 'Paiera vendredi', 'Taxi-moto', 'alice@example.test', tokens['jeton-alice'].id, shop]) expect(sent).not.toContain(secret)
  })

  it('enregistre la consommation (jetons et coût estimé) et ne compte pas une réponse échouée', async () => {
    const [row] = await asUser(db, tokens['jeton-alice'].id, async () => (await db.query("select provider, model, input_tokens, output_tokens, estimated_cost_micro_usd, status from public.ai_usage where status <> 'pending' order by id desc limit 1")).rows)
    // 2 000 × 0,30 + 400 × 2,50 = 600 + 1 000 = 1 600 millionièmes de dollar.
    expect(row).toEqual({ provider: 'gemini', model: 'gemini-test', input_tokens: 2000, output_tokens: 400, estimated_cost_micro_usd: 1600, status: 'completed' })

    failNext = true
    const failed = await ask('jeton-alice', question)
    expect(failed.lines.at(-1)).toEqual({ error: 'Le moteur est momentanément indisponible. Réessayez plus tard.' })
    expect(await quota()).toMatchObject({ used: 1 })
  })

  it('prépare des fiches à confirmer à partir d’une photo, sans rien enregistrer', async () => {
    const photo = { name: 'huile.jpg', mimeType: 'image/jpeg', data: 'AAAA' }
    const older = { name: 'ancienne.png', mimeType: 'image/png', data: 'BBBB' }
    const { status, lines } = await ask('jeton-alice', { messages: [
      { role: 'user', content: 'Regarde', attachments: [older] },
      { role: 'assistant', content: 'Je vois un savon.' },
      { role: 'user', content: 'Enregistre cette huile : achat 9000, vente 10500, 12 bidons. Et 5 sacs de riz reçus à 14500.', attachments: [photo] },
    ] })
    expect(status).toBe(200)
    const sent = requests.at(-1)
    expect(sent.functions.map((/** @type {any} */ fn) => fn.name)).toEqual(['proposer_creation_produit', 'proposer_mouvement_stock', 'proposer_vente', 'proposer_depense', 'proposer_annulation_vente'])
    expect(sent.messages[0].attachments).toBeUndefined()
    expect(sent.messages[2].attachments).toEqual([photo])
    const proposals = lines.find((line) => line.proposals)?.proposals
    expect(proposals).toEqual([
      { id: expect.any(String), action: 'create_product', values: { name: 'Huile Dinor 5 L', unit: 'bidon', purchasePrice: 9000, salePrice: 10500, initialQuantity: 12, alertThreshold: null } },
      { id: expect.any(String), action: 'stock_movement', values: { productId: expect.any(String), productName: 'riz 25kg', kind: 'purchase', quantity: 5, unitCost: 14500, note: null } },
    ])
    expect(lines.at(-1)).toMatchObject({ done: true })
    // Rien n’est écrit tant que le commerçant n’a pas confirmé.
    const products = await asUser(db, tokens['jeton-alice'].id, async () => (await db.query('select name, quantity from public.products order by name')).rows)
    expect(products.map((/** @type {any} */ row) => row.name)).not.toContain('Huile Dinor 5 L')
    expect(products.find((/** @type {any} */ row) => row.name === 'Riz 25 kg')).toMatchObject({ quantity: '8.000' })
  })

  it('montre les ventes récentes au modèle (sans client) et prépare une annulation et une dépense', async () => {
    const { lines } = await ask('jeton-alice', { messages: [{ role: 'user', content: 'Annule la vente de ce matin et ajoute 5000 de Wi-Fi' }] })
    const sent = requests.at(-1).instructions
    expect(sent).toMatch(/- \[[0-9a-f]{8}\] \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} : 34375 ; 2 sac Riz 25 kg, 0\.5 kg Sucre\./)
    expect(sent).toContain('L’utilisateur est le propriétaire.')
    expect(sent).not.toContain('Mariam')
    const [cancel, expense] = lines.find((line) => line.proposals).proposals
    const [sale] = await asUser(db, tokens['jeton-alice'].id, async () => (await db.query('select id from public.sales')).rows)
    expect(cancel.values).toMatchObject({ saleId: /** @type {any} */ (sale).id, reason: 'Erreur de saisie', sale: { totalAmount: 34375, status: 'completed' } })
    expect(expense.values).toEqual({ amount: 5000, category: 'Abonnement Wi-Fi', description: null, spentOn: null })
    expect((await asUser(db, tokens['jeton-alice'].id, async () => (await db.query("select status from public.sales")).rows))).toEqual([{ status: 'completed' }])
  })

  it('refuse les fichiers qui ne sont pas des photos', async () => {
    const pdf = { name: 'facture.pdf', mimeType: 'application/pdf', data: 'AAAA' }
    expect(await ask('jeton-alice', { messages: [{ role: 'user', content: 'Lis ceci', attachments: [pdf] }] })).toEqual({ status: 422, lines: [{ error: 'Seules les photos (JPEG, PNG, WebP) sont acceptées.' }] })
    const many = Array.from({ length: 4 }, () => ({ name: 'p.jpg', mimeType: 'image/jpeg', data: 'AAAA' }))
    expect((await ask('jeton-alice', { messages: [{ role: 'user', content: '', attachments: many }] })).status).toBe(422)
  })

  it('refuse au-delà de la limite du jour', async () => {
    await ask('jeton-alice', question)
    await ask('jeton-alice', question)
    const refused = await ask('jeton-alice', question)
    expect(refused).toEqual({ status: 429, lines: [{ error: 'Limite du jour atteinte (5 questions). Elle sera renouvelée demain.' }] })
  })

  it('refuse les autres commerçants, les visiteurs et les questions invalides', async () => {
    const before = requests.length
    expect((await ask('jeton-bob', question)).status).toBe(403)
    expect((await ask('', question)).status).toBe(401)
    expect((await ask('jeton-alice', { messages: [{ role: 'assistant', content: 'x' }] })).status).toBe(422)
    expect((await ask('jeton-alice', { messages: [{ role: 'user', content: 'x'.repeat(4001) }] })).status).toBe(422)
    expect(requests.length).toBe(before)
  })
})
