// @vitest-environment node
// Test de préservation : enregistre (instantanés) les requêtes exactes envoyées au moteur et les réponses
// renvoyées au navigateur. Toute réorganisation du service IA doit laisser ces instantanés inchangés.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiHandler } from './chat-handler.mjs'

/** @type {Array<{ method?: string, url?: string, apiKey?: string | string[], contentType?: string | string[], body: unknown }>} */
let upstreamRequests = []
/** @type {{ status: number, sse?: unknown[], json?: unknown, headers?: Record<string, string> }} */
let upstreamReply = { status: 200, sse: [] }

const fakeEngine = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  upstreamRequests.push({ method: req.method, url: req.url, apiKey: req.headers['x-goog-api-key'], contentType: req.headers['content-type'], body: JSON.parse(raw) })
  if (upstreamReply.json !== undefined) {
    res.writeHead(upstreamReply.status, { 'Content-Type': 'application/json', ...upstreamReply.headers })
    res.end(JSON.stringify(upstreamReply.json))
    return
  }
  res.writeHead(upstreamReply.status, { 'Content-Type': 'text/event-stream', ...upstreamReply.headers })
  for (const event of upstreamReply.sse ?? []) res.write(`data: ${JSON.stringify(event)}\r\n\r\n`)
  res.end()
})

/** @type {import('node:http').Server[]} */
const servers = []
let engineBase = ''
let referenceDir = ''

beforeAll(async () => {
  await new Promise((resolve) => fakeEngine.listen(0, '127.0.0.1', () => resolve(undefined)))
  engineBase = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (fakeEngine.address()).port}/v1beta`
  referenceDir = mkdtempSync(join(tmpdir(), 'moore-preservation-'))
  writeFileSync(join(referenceDir, 'fiche.md'), '## Orthographe\nRègle fictive de test.')
  writeFileSync(join(referenceDir, 'lexique.csv'), 'statut;francais;moore;valide_par\nvalidé;eau;mot-fictif;AB')
})

afterAll(() => {
  fakeEngine.close()
  for (const server of servers) server.close()
  rmSync(referenceDir, { recursive: true, force: true })
})

async function startApi() {
  const handler = createApiHandler({ apiKey: 'cle-test', model: 'modele-standard', liteModel: 'modele-econome', apiBase: engineBase, referenceDir })
  const server = createServer((req, res) => void handler(req, res))
  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  return `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
}

/** @param {string} url @param {unknown} body */
const postJson = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Réponse renvoyée au navigateur : statut, type et corps (lignes NDJSON ou JSON). @param {Response} response */
async function browserView(response) {
  const text = await response.text()
  const contentType = response.headers.get('content-type')
  const body = contentType?.includes('ndjson') ? text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : JSON.parse(text || 'null')
  // L’heure de réinitialisation dépend de l’horloge : seule sa présence est figée.
  if (body && typeof body === 'object' && 'retryAt' in body) body.retryAt = '<date>'
  return { status: response.status, contentType, body }
}

const conversation = {
  messages: [
    { role: 'user', content: 'Bonjour ɛ ʋ', attachments: [{ name: 'photo.jpg', mimeType: 'image/jpeg', data: 'AAAA' }] },
    { role: 'assistant', content: 'Bonjour !' },
    { role: 'user', content: 'Quel temps fait-il à Ouagadougou ?' },
  ],
  preferences: { responseLanguage: 'moore-standard', userWritingMode: 'informal', customInstructions: 'Réponds brièvement.' },
}

describe('préservation du chatbot', () => {
  it('requête et réponse d’une conversation avec le modèle standard', async () => {
    upstreamRequests = []
    upstreamReply = {
      status: 200,
      sse: [
        { candidates: [{ content: { parts: [{ text: 'pensée', thought: true }, { text: 'Il fait ' }] } }] },
        { candidates: [{ content: { parts: [{ text: 'chaud.' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://meteo.example.bf', title: 'Météo' } }], searchEntryPoint: { renderedContent: '<p>suggestions</p>' } } }] },
      ],
    }
    const base = await startApi()
    const view = await browserView(await postJson(`${base}/api/chat`, conversation))
    expect({ upstream: upstreamRequests, browser: view }).toMatchSnapshot()
  })

  it('requête avec le modèle économe', async () => {
    upstreamRequests = []
    upstreamReply = { status: 200, sse: [{ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }] }
    const base = await startApi()
    await (await postJson(`${base}/api/chat`, { ...conversation, modelTier: 'lite' })).text()
    expect(upstreamRequests.map(({ url }) => url)).toMatchSnapshot()
  })

  it('requête et réponse d’un titre', async () => {
    upstreamRequests = []
    upstreamReply = { status: 200, json: { candidates: [{ content: { parts: [{ text: 'idée', thought: true }, { text: '« Météo à Ouaga. »\nsuite' }] } }] } }
    const base = await startApi()
    const view = await browserView(await postJson(`${base}/api/title`, { text: 'Quel temps fait-il à Ouagadougou ?' }))
    expect({ upstream: upstreamRequests, browser: view }).toMatchSnapshot()
  })

  it('erreurs du moteur traduites pour le navigateur', async () => {
    const base = await startApi()
    /** @type {Record<string, unknown>} */
    const views = {}
    for (const [name, reply] of /** @type {Array<[string, typeof upstreamReply]>} */ ([
      ['quota-journalier', { status: 429, json: { error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProject' }] }] } } }],
      ['quota-minute', { status: 429, json: { error: {} }, headers: { 'Retry-After': '30' } }],
      ['requete-refusee', { status: 400, json: {} }],
      ['modele-introuvable', { status: 404, json: {} }],
      ['cle-refusee', { status: 403, json: {} }],
      ['indisponible', { status: 503, json: {} }],
      ['bloque', { status: 200, sse: [{ promptFeedback: { blockReason: 'SAFETY' } }] }],
    ])) {
      upstreamReply = reply
      views[name] = await browserView(await postJson(`${base}/api/chat`, conversation))
    }
    expect(views).toMatchSnapshot()
  })
})
