// @vitest-environment node
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiHandler } from '../chat-handler.mjs'
import { createTokenVerifier, isSecretKey, readAuthConfig } from './supabase-auth.mjs'

// Faux service d’authentification Supabase : seul le jeton « jeton-valide » est accepté.
let authCalls = 0
const fakeSupabase = createServer((req, res) => {
  authCalls++
  const valid = req.url === '/auth/v1/user' && req.headers.apikey === 'cle-publique' && req.headers.authorization === 'Bearer jeton-valide'
  res.writeHead(valid ? 200 : 401, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(valid ? { id: 'utilisateur-1', email: 'awa@example.test' } : { message: 'invalid JWT' }))
})
/** @type {import('node:http').Server[]} */
const servers = []
let supabaseUrl = ''

beforeAll(async () => {
  await new Promise((resolve) => fakeSupabase.listen(0, '127.0.0.1', () => resolve(undefined)))
  supabaseUrl = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (fakeSupabase.address()).port}`
})
afterAll(() => {
  fakeSupabase.close()
  for (const server of servers) server.close()
})

/** @param {Parameters<typeof createApiHandler>[0]} config */
async function startApi(config) {
  const handler = createApiHandler(config)
  const server = createServer((req, res) => void handler(req, res))
  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  return `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
}

const jwtWithRole = (/** @type {string} */ role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`

describe('configuration des comptes', () => {
  it('lit l’adresse et la clé publique, ou rien si elles sont absentes', () => {
    expect(readAuthConfig({})).toBeNull()
    expect(readAuthConfig({ SUPABASE_URL: 'https://abc.supabase.co/', SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_x ' })).toEqual({ supabaseUrl: 'https://abc.supabase.co', publishableKey: 'sb_publishable_x' })
  })

  it('refuse une configuration incomplète, une adresse non HTTPS ou une clé secrète', () => {
    expect(() => readAuthConfig({ SUPABASE_URL: 'https://abc.supabase.co' })).toThrow(/incomplète/)
    expect(() => readAuthConfig({ SUPABASE_URL: 'http://abc.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'k' })).toThrow(/https/)
    expect(() => readAuthConfig({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toThrow(/clé secrète/)
    expect(() => readAuthConfig({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_PUBLISHABLE_KEY: jwtWithRole('service_role') })).toThrow(/clé secrète/)
    expect(isSecretKey(jwtWithRole('anon'))).toBe(false)
  })
})

describe('vérification des connexions', () => {
  it('accepte un jeton valide, refuse les autres et garde la réponse une minute', async () => {
    let clock = 0
    const verify = createTokenVerifier({ supabaseUrl, publishableKey: 'cle-publique' }, { now: () => clock })
    authCalls = 0
    expect(await verify('jeton-valide')).toEqual({ id: 'utilisateur-1', email: 'awa@example.test' })
    expect(await verify('jeton-valide')).toEqual({ id: 'utilisateur-1', email: 'awa@example.test' })
    expect(authCalls).toBe(1)
    clock = 61_000
    await verify('jeton-valide')
    expect(authCalls).toBe(2)
    expect(await verify('jeton-pirate')).toBeNull()
    expect(await verify('')).toBeNull()
  })

  it('annonce la configuration publique et vérifie le compte par /api/me', async () => {
    const auth = { supabaseUrl, publishableKey: 'cle-publique' }
    const base = await startApi({ auth })
    expect(/** @type {any} */ (await (await fetch(`${base}/api/health`)).json()).auth).toEqual(auth)
    const ok = await fetch(`${base}/api/me`, { headers: { Authorization: 'Bearer jeton-valide' } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ user: { id: 'utilisateur-1', email: 'awa@example.test' } })
    expect((await fetch(`${base}/api/me`, { headers: { Authorization: 'Bearer jeton-pirate' } })).status).toBe(401)
    expect((await fetch(`${base}/api/me`)).status).toBe(401)
  })

  it('signale que les comptes ne sont pas configurés, ou que Supabase est injoignable', async () => {
    const without = await startApi({})
    expect(/** @type {any} */ (await (await fetch(`${without}/api/health`)).json()).auth).toBeUndefined()
    expect((await fetch(`${without}/api/me`, { headers: { Authorization: 'Bearer x' } })).status).toBe(503)

    const unreachable = await startApi({ auth: { supabaseUrl: 'http://127.0.0.1:1', publishableKey: 'k' } })
    const response = await fetch(`${unreachable}/api/me`, { headers: { Authorization: 'Bearer x' } })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Supabase est injoignable.' })
  })
})
