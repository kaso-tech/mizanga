// @vitest-environment node
import { createServer } from 'node:http'
import { afterAll, describe, expect, it } from 'vitest'
import { createApiHandler } from '../chat-handler.mjs'
import { UpstreamError } from './errors.mjs'
import { createAiProvider } from './provider.mjs'

/** @type {import('node:http').Server[]} */
const servers = []
afterAll(() => { for (const server of servers) server.close() })

/** @param {Parameters<typeof createApiHandler>[0]} config */
async function startApi(config) {
  const handler = createApiHandler(config)
  const server = createServer((req, res) => void handler(req, res))
  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  return `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
}

const chatBody = { messages: [{ role: 'user', content: 'Bonjour' }], preferences: {}, modelTier: 'lite' }

describe('service IA centralisé', () => {
  it('crée Gemini par défaut et refuse un fournisseur inconnu', () => {
    expect(createAiProvider({ apiKey: 'cle' })).toMatchObject({ name: 'gemini', configured: true, models: { standard: 'gemini-flash-latest', lite: 'gemini-flash-lite-latest' } })
    expect(createAiProvider({})).toMatchObject({ configured: false })
    expect(() => createAiProvider({ provider: 'qwen' })).toThrow(/Fournisseur d’IA inconnu : « qwen »/)
  })

  it('branche un autre fournisseur sans modifier le reste de l’application', async () => {
    /** @type {unknown[]} */
    const calls = []
    /** @type {import('./provider.mjs').AiProvider} */
    const provider = {
      name: 'autre',
      configured: true,
      models: { standard: 'modele-a', lite: 'modele-b' },
      async *streamReply(request) {
        calls.push({ tier: request.tier, messages: request.messages, hasSignal: Boolean(request.signal) })
        yield { text: 'Réponse ' }
        yield { text: 'remplaçable' }
      },
      async generateTitle({ text }) {
        return `Titre : ${text}`
      },
    }
    const base = await startApi({ provider })
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ engine: 'autre', liteModel: true })
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chatBody) })
    expect((await response.text()).trim().split('\n').map((line) => JSON.parse(line))).toEqual([{ text: 'Réponse ' }, { text: 'remplaçable' }])
    expect(calls).toEqual([{ tier: 'lite', messages: [{ role: 'user', content: 'Bonjour' }], hasSignal: true }])
    const title = await fetch(`${base}/api/title`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Bonjour' }) })
    expect(await title.json()).toEqual({ title: 'Titre : Bonjour' })
  })

  it('traduit les erreurs du fournisseur de la même façon', async () => {
    /** @type {import('./provider.mjs').AiProvider} */
    const provider = {
      name: 'autre',
      configured: true,
      models: { standard: 'a', lite: 'b' },
      // eslint-disable-next-line require-yield -- échoue avant le premier fragment
      async *streamReply() {
        throw new UpstreamError('La limite d’utilisation gratuite du moteur est atteinte.', 429)
      },
      generateTitle: async () => null,
    }
    const base = await startApi({ provider })
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chatBody) })
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'La limite d’utilisation gratuite du moteur est atteinte.', code: 'quota' })
  })
})
