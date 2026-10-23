// @vitest-environment node
// Adresses /api/conversations de bout en bout : serveur de Gilli → base PostgreSQL (PGlite) avec RLS.
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiHandler } from '../../server/chat-handler.mjs'
import { createTestDatabase, createUser } from './database.mjs'
import { createPgliteBusinessStore } from './pglite-store.mjs'

/** @type {import('node:http').Server} */
let server
let base = ''
/** @type {Record<string, { id: string, email: string }>} */
const tokens = {}

beforeAll(async () => {
  const db = await createTestDatabase()
  tokens['jeton-alice'] = { id: await createUser(db, 'alice@example.test'), email: 'alice@example.test' }
  tokens['jeton-bob'] = { id: await createUser(db, 'bob@example.test'), email: 'bob@example.test' }
  const handler = createApiHandler({ verifyToken: async (token) => tokens[token] ?? null, businessStore: createPgliteBusinessStore(db) })
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
  return { status: response.status, body: /** @type {any} */ (await response.json()) }
}

const message = { id: 'm1', role: 'user', content: 'Bonjour', createdAt: '2026-10-23T10:00:00.000Z', attachments: [{ id: 'a1', name: 'photo.jpg', mimeType: 'image/jpeg', size: 1200, data: 'AAAA' }] }
const conversation = (/** @type {Record<string, unknown>} */ changes = {}) => ({ title: 'Salutations', favorite: false, messages: [message], createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T10:00:05.000Z', ...changes })

describe('conversations enregistrées sur le compte', () => {
  let shop = ''

  it('exige une connexion', async () => {
    expect((await call('', 'GET', '/api/conversations')).status).toBe(401)
  })

  it('enregistre, liste et relit une conversation sans le contenu des fichiers joints', async () => {
    const saved = await call('jeton-alice', 'PUT', '/api/conversations/conversation-0001', conversation())
    expect(saved.status).toBe(200)
    expect(saved.body.conversation).toMatchObject({ id: 'conversation-0001', kind: 'general', businessId: null, title: 'Salutations' })
    const list = await call('jeton-alice', 'GET', '/api/conversations')
    expect(list.body.conversations).toHaveLength(1)
    expect(list.body.conversations[0].messages).toBeUndefined()
    const read = await call('jeton-alice', 'GET', '/api/conversations/conversation-0001')
    expect(read.body.conversation.messages[0].attachments[0]).toEqual({ id: 'a1', name: 'photo.jpg', mimeType: 'image/jpeg', size: 1200 })
  })

  it('garde la version la plus récente', async () => {
    const newer = await call('jeton-alice', 'PUT', '/api/conversations/conversation-0001', conversation({ title: 'Renommée', updatedAt: '2026-10-23T11:00:00.000Z' }))
    expect(newer.status).toBe(200)
    const older = await call('jeton-alice', 'PUT', '/api/conversations/conversation-0001', conversation({ title: 'Ancienne copie' }))
    expect(older.status).toBe(409)
    expect(older.body.conversation.title).toBe('Renommée')
  })

  it('renomme et met en favori sans toucher aux messages, et garde le titre quand il est omis', async () => {
    const patched = await call('jeton-alice', 'PATCH', '/api/conversations/conversation-0001', { title: '  Nouveau titre ', favorite: true })
    expect(patched.body.conversation).toMatchObject({ title: 'Nouveau titre', favorite: true })
    const { title: _title, favorite: _favorite, ...withoutTitle } = conversation({ updatedAt: '2026-10-23T12:00:00.000Z' })
    expect((await call('jeton-alice', 'PUT', '/api/conversations/conversation-0001', withoutTitle)).body.conversation).toMatchObject({ title: 'Nouveau titre', favorite: true })
    expect((await call('jeton-alice', 'PATCH', '/api/conversations/conversation-0001', { favorite: 'oui' })).status).toBe(422)
    expect((await call('jeton-bob', 'PATCH', '/api/conversations/conversation-0001', { title: 'Piraté' })).status).toBe(404)
  })

  it('ne montre ni ne supprime les conversations des autres', async () => {
    expect((await call('jeton-bob', 'GET', '/api/conversations')).body.conversations).toEqual([])
    expect((await call('jeton-bob', 'GET', '/api/conversations/conversation-0001')).status).toBe(404)
    await call('jeton-bob', 'DELETE', '/api/conversations/conversation-0001')
    expect((await call('jeton-alice', 'GET', '/api/conversations/conversation-0001')).status).toBe(200)
  })

  it('rattache les conversations d’assistant à un commerce du membre', async () => {
    shop = (await call('jeton-alice', 'POST', '/api/business', { name: 'Boutique Awa' })).body.business.id
    const saved = await call('jeton-alice', 'PUT', '/api/conversations/assistant-0001', conversation({ kind: 'commerce', businessId: shop }))
    expect(saved.status).toBe(200)
    expect((await call('jeton-bob', 'PUT', '/api/conversations/assistant-0002', conversation({ kind: 'commerce', businessId: shop }))).status).toBe(403)
    expect((await call('jeton-alice', 'PUT', '/api/conversations/assistant-0003', conversation({ kind: 'elevage' }))).status).toBe(422)
    expect((await call('jeton-alice', 'PUT', '/api/conversations/assistant-0004', conversation({ kind: 'peche', businessId: shop }))).status).toBe(422)
    // Une conversation ne change pas d’espace.
    expect((await call('jeton-alice', 'PUT', '/api/conversations/assistant-0001', conversation({ updatedAt: '2026-10-24T00:00:00.000Z' }))).status).toBe(409)
  })

  it('refuse les données invalides et supprime', async () => {
    expect((await call('jeton-alice', 'PUT', '/api/conversations/court', conversation())).status).toBe(404)
    expect((await call('jeton-alice', 'PUT', '/api/conversations/conversation-0009', conversation({ messages: 'texte' }))).status).toBe(422)
    expect((await call('jeton-alice', 'PUT', '/api/conversations/conversation-0009', conversation({ updatedAt: 'hier' }))).status).toBe(422)
    expect((await call('jeton-alice', 'DELETE', '/api/conversations/conversation-0001')).body).toEqual({ deleted: true })
    expect((await call('jeton-alice', 'GET', '/api/conversations')).body.conversations.map((/** @type {any} */ item) => item.id)).toEqual(['assistant-0001'])
  })
})
