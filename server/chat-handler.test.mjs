// @vitest-environment node
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiHandler } from './chat-handler.mjs'

/** @type {{ status: number, events: unknown[] }} */
let upstreamReply = { status: 200, events: [] }
/** @type {{ url?: string, headers?: import('node:http').IncomingHttpHeaders, body?: any }} */
let lastUpstreamRequest = {}

/** Faux Gemini : enregistre la requête et répond en SSE, un événement « data: » par entrée. */
const fakeGemini = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  lastUpstreamRequest = { url: req.url, headers: req.headers, body: JSON.parse(raw) }
  if (req.url?.endsWith(':generateContent')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'réflexion', thought: true }, { text: '« Photosynthèse expliquée. »\nligne en trop' }] } }] }))
    return
  }
  if (upstreamReply.status !== 200) {
    res.writeHead(upstreamReply.status, { 'Content-Type': 'application/json' }).end('{}')
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  for (const event of upstreamReply.events) res.write(`data: ${JSON.stringify(event)}\r\n\r\n`)
  res.end()
})

/** @type {import('node:http').Server[]} */
const servers = []

/** @param {Parameters<typeof createApiHandler>[0]} config */
async function startApi(config) {
  const handler = createApiHandler(config)
  const server = createServer((req, res) => void handler(req, res))
  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const address = /** @type {import('node:net').AddressInfo} */ (server.address())
  return `http://127.0.0.1:${address.port}`
}

/** @param {unknown} body */
const post = (/** @type {string} */ base, body) => fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

let geminiBase = ''
const textEvent = (/** @type {string} */ text, thought = false) => ({ candidates: [{ content: { parts: [{ text, thought }] } }] })
const validBody = {
  messages: [
    { role: 'user', content: 'Bonjour' },
    { role: 'assistant', content: 'Bonjour !' },
    { role: 'user', content: 'Explique ɛ et ʋ' },
  ],
  preferences: { responseLanguage: 'moore-standard', userWritingMode: 'informal' },
}

beforeAll(async () => {
  await new Promise((resolve) => fakeGemini.listen(0, '127.0.0.1', () => resolve(undefined)))
  geminiBase = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (fakeGemini.address()).port}/v1beta`
})

afterAll(() => {
  fakeGemini.close()
  for (const server of servers) server.close()
})

describe('API Mizanga', () => {
  it('annonce le moteur disponible', async () => {
    const demo = await startApi({})
    expect(await (await fetch(`${demo}/api/health`)).json()).toEqual({ engine: 'demo', model: null })
    const gemini = await startApi({ apiKey: 'cle', model: 'gemini-test' })
    expect(await (await fetch(`${gemini}/api/health`)).json()).toEqual({ engine: 'gemini', model: 'gemini-test' })
  })

  it('refuse /api/chat sans clé configurée', async () => {
    const base = await startApi({})
    const response = await post(base, validBody)
    expect(response.status).toBe(503)
  })

  it('refuse une demande mal formée', async () => {
    const base = await startApi({ apiKey: 'cle', apiBase: geminiBase })
    expect((await post(base, { messages: [] })).status).toBe(400)
    expect((await post(base, { messages: [{ role: 'assistant', content: 'seul' }] })).status).toBe(400)
    expect((await post(base, { messages: [{ role: 'system', content: 'x' }] })).status).toBe(400)
  })

  it('relaie la conversation vers Gemini et diffuse la réponse en NDJSON', async () => {
    upstreamReply = { status: 200, events: [textEvent('réflexion interne', true), textEvent('Première '), textEvent('partie, ɛ ʋ.')] }
    const base = await startApi({ apiKey: 'cle-secrete', model: 'gemini-test', apiBase: geminiBase })
    const response = await post(base, validBody)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')
    const lines = (await response.text()).trim().split('\n').map((line) => JSON.parse(line))
    expect(lines).toEqual([{ text: 'Première ' }, { text: 'partie, ɛ ʋ.' }])

    expect(lastUpstreamRequest.url).toBe('/v1beta/models/gemini-test:streamGenerateContent?alt=sse')
    expect(lastUpstreamRequest.headers?.['x-goog-api-key']).toBe('cle-secrete')
    expect(lastUpstreamRequest.body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Bonjour' }] },
      { role: 'model', parts: [{ text: 'Bonjour !' }] },
      { role: 'user', parts: [{ text: 'Explique ɛ et ʋ' }] },
    ])
    const instruction = lastUpstreamRequest.body.systemInstruction.parts[0].text
    expect(instruction).toContain('Réponds en mooré, dans l’orthographe standardisée')
    expect(instruction).toContain('écriture informelle')
    expect(instruction).toContain('ne prétends jamais maîtriser')
  })

  it('traduit un dépassement de quota en message clair', async () => {
    upstreamReply = { status: 429, events: [] }
    const base = await startApi({ apiKey: 'cle', apiBase: geminiBase })
    const response = await post(base, validBody)
    expect(response.status).toBe(429)
    expect(/** @type {{ error: string }} */ (await response.json()).error).toContain('limite d’utilisation gratuite')
  })

  it('limite le nombre de demandes par visiteur', async () => {
    upstreamReply = { status: 200, events: [textEvent('ok')] }
    const base = await startApi({ apiKey: 'cle', apiBase: geminiBase, rateLimit: { windowMs: 60_000, maxRequests: 1 } })
    expect((await post(base, validBody)).status).toBe(200)
    expect((await post(base, validBody)).status).toBe(429)
  })

  it('propose un titre court et nettoyé', async () => {
    const base = await startApi({ apiKey: 'cle', model: 'gemini-test', apiBase: geminiBase })
    const response = await fetch(`${base}/api/title`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Explique la photosynthèse' }) })
    expect(await response.json()).toEqual({ title: 'Photosynthèse expliquée' })
    expect(lastUpstreamRequest.url).toBe('/v1beta/models/gemini-test:generateContent')
  })
})
