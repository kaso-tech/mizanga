// @vitest-environment node
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiHandler } from './chat-handler.mjs'
import { buildSystemInstruction, nextMidnight, quotaResetTime } from './gemini.mjs'

/** @type {{ status: number, events: unknown[], body?: unknown }} */
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
    res.writeHead(upstreamReply.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(upstreamReply.body ?? {}))
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

  it('traduit un dépassement de quota en message clair, avec l’heure de réinitialisation', async () => {
    upstreamReply = { status: 429, events: [], body: { error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }] } } }
    const base = await startApi({ apiKey: 'cle', apiBase: geminiBase })
    const before = Date.now()
    const response = await post(base, validBody)
    expect(response.status).toBe(429)
    const body = /** @type {{ error: string, retryAt: string }} */ (await response.json())
    expect(body.error).toContain('limite d’utilisation gratuite')
    const delay = new Date(body.retryAt).getTime() - before
    expect(delay).toBeGreaterThanOrEqual(36_000)
    expect(delay).toBeLessThanOrEqual(40_000)
  })

  it('situe la réinitialisation d’un quota journalier à minuit, heure du Pacifique', () => {
    const daily = { error: { details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { retryDelay: '20s' }] } }
    expect(quotaResetTime(daily, null, new Date('2026-10-20T17:00:00Z'))?.toISOString()).toBe('2026-10-21T07:00:00.000Z')
    // Passage à l’heure d’hiver aux États-Unis le 1er novembre 2026.
    expect(nextMidnight(new Date('2026-10-31T20:00:00Z')).toISOString()).toBe('2026-11-01T07:00:00.000Z')
    expect(nextMidnight(new Date('2026-11-01T20:00:00Z')).toISOString()).toBe('2026-11-02T08:00:00.000Z')
    expect(quotaResetTime({}, '12', new Date('2026-10-20T17:00:00Z'))?.toISOString()).toBe('2026-10-20T17:00:12.000Z')
    expect(quotaResetTime({}, null)).toBeUndefined()
  })

  it('limite le nombre de demandes par visiteur', async () => {
    upstreamReply = { status: 200, events: [textEvent('ok')] }
    const base = await startApi({ apiKey: 'cle', apiBase: geminiBase, rateLimit: { windowMs: 60_000, maxRequests: 1 } })
    expect((await post(base, validBody)).status).toBe(200)
    const blocked = await post(base, validBody)
    expect(blocked.status).toBe(429)
    const { retryAt } = /** @type {{ retryAt: string }} */ (await blocked.json())
    expect(new Date(retryAt).getTime()).toBeGreaterThan(Date.now() + 50_000)
  })

  it('propose un titre court et nettoyé', async () => {
    const base = await startApi({ apiKey: 'cle', model: 'gemini-test', apiBase: geminiBase })
    const response = await fetch(`${base}/api/title`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Explique la photosynthèse' }) })
    expect(await response.json()).toEqual({ title: 'Photosynthèse expliquée' })
    expect(lastUpstreamRequest.url).toBe('/v1beta/models/gemini-test:generateContent')
  })

  it('transmet les fichiers joints à Gemini et refuse les formats non autorisés', async () => {
    upstreamReply = { status: 200, events: [textEvent('ok')] }
    const base = await startApi({ apiKey: 'cle', model: 'gemini-test', apiBase: geminiBase })
    const withFile = { messages: [{ role: 'user', content: 'Résume ce document', attachments: [{ name: 'cours.pdf', mimeType: 'application/pdf', data: 'QUFB' }] }] }
    expect((await post(base, withFile)).status).toBe(200)
    expect(lastUpstreamRequest.body.contents).toEqual([
      { role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'QUFB' } }, { text: 'Résume ce document' }] },
    ])

    const onlyFile = { messages: [{ role: 'user', content: '', attachments: [{ name: 'photo.png', mimeType: 'image/png', data: 'QUFB' }] }] }
    expect((await post(base, onlyFile)).status).toBe(200)

    const executable = { messages: [{ role: 'user', content: 'x', attachments: [{ name: 'a.exe', mimeType: 'application/x-msdownload', data: 'QUFB' }] }] }
    expect((await post(base, executable)).status).toBe(400)
    const notBase64 = { messages: [{ role: 'user', content: 'x', attachments: [{ name: 'a.png', mimeType: 'image/png', data: '<script>' }] }] }
    expect((await post(base, notBase64)).status).toBe(400)
  })

  it('active la recherche web à la demande et relaie les sources et suggestions Google', async () => {
    upstreamReply = {
      status: 200,
      events: [
        textEvent('Selon la météo, '),
        { candidates: [{ content: { parts: [{ text: 'il fera chaud.' }] }, groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://meteo.example.bf/ouaga', title: 'meteo.example.bf' } },
            { web: { uri: 'https://meteo.example.bf/ouaga', title: 'doublon' } },
            { web: { uri: 'javascript:alert(1)', title: 'piège' } },
          ],
          searchEntryPoint: { renderedContent: '<div class="chips">météo Ouagadougou</div>' },
        } }] },
      ],
    }
    const base = await startApi({ apiKey: 'cle', apiBase: geminiBase })
    const response = await post(base, { ...validBody, webSearch: true })
    const lines = (await response.text()).trim().split('\n').map((line) => JSON.parse(line))
    expect(lines).toEqual([
      { text: 'Selon la météo, ' },
      { text: 'il fera chaud.' },
      { sources: [{ title: 'meteo.example.bf', url: 'https://meteo.example.bf/ouaga' }], searchSuggestionsHtml: '<div class="chips">météo Ouagadougou</div>' },
    ])
    expect(lastUpstreamRequest.body.tools).toEqual([{ google_search: {} }])

    upstreamReply = { status: 200, events: [textEvent('ok')] }
    await (await post(base, validBody)).text()
    expect(lastUpstreamRequest.body.tools).toBeUndefined()
  })

  it('ajoute les instructions personnelles, bornées et après les règles de Mizanga', async () => {
    upstreamReply = { status: 200, events: [textEvent('ok')] }
    const base = await startApi({ apiKey: 'cle', apiBase: geminiBase })
    await (await post(base, { ...validBody, preferences: { ...validBody.preferences, customInstructions: `  Je suis enseignant à Koudougou.${'x'.repeat(2000)}` } })).text()
    const instruction = lastUpstreamRequest.body.systemInstruction.parts[0].text
    expect(instruction).toContain('Instructions personnelles de l’utilisateur')
    expect(instruction).toContain('Je suis enseignant à Koudougou.')
    expect(instruction.indexOf('ne prétends jamais maîtriser')).toBeLessThan(instruction.indexOf('Je suis enseignant'))
    expect(instruction.length).toBeLessThan(buildSystemInstruction(validBody.preferences).length + 1700)
    expect(buildSystemInstruction({ customInstructions: '   ' })).not.toContain('Instructions personnelles')
  })
})
