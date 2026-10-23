// Serveur des tests de bout en bout (navigateur) : l’application compilée (dist) et son serveur réel,
// avec une vraie base PostgreSQL en mémoire (PGlite, mêmes migrations et règles RLS que Supabase),
// un faux service de connexion (Supabase Auth) et un faux moteur Gemini. Aucun service extérieur.
//   pnpm build && node e2e/server.mjs   (ports : E2E_PORT, puis les deux suivants)
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiHandler } from '../server/chat-handler.mjs'
import { createTestDatabase } from '../supabase/tests/database.mjs'
import { createPgliteMarketplace } from '../supabase/tests/pglite-marketplace.mjs'
import { createPgliteBusinessStore } from '../supabase/tests/pglite-store.mjs'
import { createPgliteLivestockStore } from '../supabase/tests/pglite-livestock.mjs'
import { createPgliteAgricultureStore } from '../supabase/tests/pglite-agriculture.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const appPort = Number(process.env.E2E_PORT ?? 4173)
const authPort = appPort + 1
const geminiPort = appPort + 2

/** Code de connexion accepté pour toute adresse e-mail. */
export const LOGIN_CODE = '123456'

const db = await createTestDatabase()
const MODERATION_KEY = 'cle-de-moderation-des-tests-de-bout-en-bout'
await db.query('select public.set_moderation_key($1)', [MODERATION_KEY])
const marketplace = createPgliteMarketplace(db, { photoBaseUrl: '/photos' })
/** Mot de passe de la console d’administration pendant les tests. */
export const ADMIN_PASSWORD = 'mot-de-passe-admin-e2e'
/** Identifiant stable d’un compte de test, dérivé de son adresse. @param {string} email */
const userIdOf = (email) => {
  const hex = createHash('sha256').update(email).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
/** @param {string} email */
const ensureUser = async (email) => {
  const id = userIdOf(email)
  await db.query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [id, email])
  return { id, email }
}
const tokenOf = (/** @type {string} */ email) => `jeton:${email}`
const emailOf = (/** @type {string} */ token) => (token.startsWith('jeton:') ? token.slice(6) : null)

/** @param {import('node:http').IncomingMessage} req */
const readBody = async (req) => {
  let body = ''
  for await (const chunk of req) body += chunk
  return body
}

// Faux Supabase Auth : envoi du code (sans e-mail), vérification du code, profil.
createServer(async (req, res) => {
  const body = await readBody(req)
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
  /** @param {number} status @param {unknown} json */
  const send = (status, json) => res.writeHead(status, { 'Content-Type': 'application/json', ...cors }).end(JSON.stringify(json))
  if (req.method === 'OPTIONS') return void res.writeHead(204, cors).end()
  const url = req.url ?? ''
  const sessionFor = async (/** @type {string} */ email) => {
    const user = await ensureUser(email)
    return { access_token: tokenOf(email), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r:${email}`, user: { ...user, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }
  }
  if (url.startsWith('/auth/v1/otp')) return send(200, {})
  if (url.startsWith('/auth/v1/verify')) {
    const { token, email } = JSON.parse(body)
    if (token !== LOGIN_CODE) return send(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
    return send(200, await sessionFor(email))
  }
  if (url.startsWith('/auth/v1/user')) {
    const email = emailOf((req.headers.authorization ?? '').replace(/^Bearer /, ''))
    return email ? send(200, (await sessionFor(email)).user) : send(401, { msg: 'invalid' })
  }
  if (url.startsWith('/auth/v1/logout')) return send(204, {})
  send(404, {})
}).listen(authPort, '127.0.0.1')

// Faux Gemini : cite la ligne « Aujourd’hui » des données reçues, en plusieurs fragments.
createServer(async (req, res) => {
  const payload = JSON.parse((await readBody(req)) || '{}')
  // Réponse structurée (modération des annonces) : « Douteux » dans le titre → à vérifier.
  if (payload.generationConfig?.responseMimeType === 'application/json') {
    const text = payload.contents?.at(-1)?.parts?.at(-1)?.text ?? ''
    const verdict = text.includes('Douteux') ? { conforme: false, raisons: ['La photo ne correspond pas au titre.'] } : { conforme: true, raisons: [] }
    return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(verdict) }] } }] }))
  }
  if ((req.url ?? '').endsWith(':generateContent')) {
    return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Conversation de test' }] } }] }))
  }
  const instructions = payload.systemInstruction?.parts?.[0]?.text ?? ''
  const today = instructions.split('\n').find((/** @type {string} */ line) => line.startsWith('- Aujourd’hui')) ?? 'Bonjour, je suis Gilli.'
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const lastParts = payload.contents?.at(-1)?.parts ?? []
  // Assistant Élevage : « J’ai perdu 2 poulets… » → fiche de mortalité pour le premier lot de volailles.
  if (lastParts.some((/** @type {any} */ part) => part.text?.startsWith('J’ai perdu'))) {
    const herd = /^- (.+?) : Volailles,/m.exec(instructions)?.[1] ?? 'Poulets'
    const call = { functionCall: { name: 'proposer_evenement_elevage', args: { lot: herd, type: 'mortalite', nombre: 2, cause: 'inconnue' } } }
    res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Voici la fiche à vérifier. Si d’autres poulets meurent, contactez un vétérinaire.' }, call] } }], usageMetadata: { promptTokenCount: 1600, candidatesTokenCount: 25 } })}\n\n`)
    return void res.end()
  }
  // Assistant Agriculture : « J’ai vendu 2 sacs… » → fiche de vente pour la première culture listée.
  if (lastParts.some((/** @type {any} */ part) => part.text?.startsWith('J’ai vendu'))) {
    const crop = /^- (.+? — .+?) : saison/m.exec(instructions)?.[1] ?? 'Maïs'
    const call = { functionCall: { name: 'proposer_operation_agricole', args: { culture: crop, type: 'vente', quantite: 2, unite: 'sac', poids_unite_kg: 100, montant: 50000 } } }
    res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Voici la fiche de vente à vérifier.' }, call] } }], usageMetadata: { promptTokenCount: 1600, candidatesTokenCount: 25 } })}\n\n`)
    return void res.end()
  }
  // « Vends 2 Savon, et 1500 de transport » : fiches de vente et de dépense.
  if (lastParts.some((/** @type {any} */ part) => part.text?.startsWith('Vends'))) {
    const calls = [
      { functionCall: { name: 'proposer_vente', args: { lignes: [{ produit: 'savon', quantite: 2 }], client: 'Mariam' } } },
      { functionCall: { name: 'proposer_depense', args: { montant: 1500, categorie: 'Transport' } } },
    ]
    res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Voici les fiches à vérifier.' }, ...calls] } }], usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 30 } })}\n\n`)
    return void res.end()
  }
  // « Enregistre… » avec une photo : le modèle prépare une fiche de produit (prix de vente laissé vide).
  if (lastParts.some((/** @type {any} */ part) => part.text?.startsWith('Enregistre')) && lastParts.some((/** @type {any} */ part) => part.inlineData)) {
    const call = { functionCall: { name: 'proposer_creation_produit', args: { nom: 'Huile Dinor 5 L', unite: 'bidon', prix_achat: 9000, quantite_initiale: 12 } } }
    res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'J’ai préparé la fiche : vérifiez-la.' }, call] } }], usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 20 } })}\n\n`)
    return void res.end()
  }
  const words = `D’après vos chiffres : ${today.replace(/^- /, '')}`.split(/(?<= )/)
  for (const [index, word] of words.entries()) {
    res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: word }] } }], usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: index + 1 } })}\n\n`)
  }
  res.end()
}).listen(geminiPort, '127.0.0.1')

const handler = createApiHandler({
  apiKey: 'cle-de-test',
  apiBase: `http://127.0.0.1:${geminiPort}/v1beta`,
  auth: { supabaseUrl: `http://127.0.0.1:${authPort}`, publishableKey: 'sb_publishable_test' },
  verifyToken: async (token) => {
    const email = emailOf(token)
    return email ? ensureUser(email) : null
  },
  businessStore: createPgliteBusinessStore(db),
  livestockStore: createPgliteLivestockStore(db),
  agricultureStore: createPgliteAgricultureStore(db),
  marketplace,
  moderationKey: MODERATION_KEY,
  adminPassword: ADMIN_PASSWORD,
  // Pas de limite par visiteur gênante pendant les tests (tous les navigateurs partagent 127.0.0.1).
  rateLimit: { windowMs: 60_000, maxRequests: 1000 },
})

/** @type {Record<string, string>} */
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff' }
createServer(async (req, res) => {
  if ((req.url ?? '').startsWith('/api/')) return void handler(req, res)
  if ((req.url ?? '').startsWith('/photos/')) {
    const photo = marketplace.photos.files.get(decodeURIComponent((req.url ?? '').slice('/photos/'.length)))
    if (!photo) return void res.writeHead(404).end()
    return void res.writeHead(200, { 'Content-Type': photo.mimeType }).end(photo.bytes)
  }
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  try {
    if (path.includes('..') || path.endsWith('/')) throw new Error('page')
    const file = await readFile(join(root, 'dist', path))
    res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' }).end(file)
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(await readFile(join(root, 'dist', 'index.html')))
  }
}).listen(appPort, '127.0.0.1', () => console.log(`[e2e] http://127.0.0.1:${appPort}`))
