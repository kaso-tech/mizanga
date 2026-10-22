// @vitest-environment node
// Étape 5 : limite quotidienne de l’assistant Business et suivi de la consommation de l’IA.
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createTestDatabase, createUser, errorOf } from './database.mjs'

/** @type {import('@electric-sql/pglite').PGlite} */
let db
let alice = ''
let bob = ''
let shop = ''

/** @param {string} userId @param {string} sql @param {unknown[]} [params] */
const queryAs = (userId, sql, params = []) => asUser(db, userId, async () => /** @type {any[]} */ ((await db.query(sql, params)).rows))
const quota = async (/** @type {string} */ userId) => (await queryAs(userId, 'select used, daily_limit from public.ai_quota($1)', [shop]))[0]
const begin = async (/** @type {string} */ userId) => (await queryAs(userId, 'select public.begin_ai_request($1) as id', [shop]))[0].id
/** @param {string} userId @param {unknown} id @param {string} status */
const finish = (userId, id, status, tokens = [1200, 300], cost = 0) => queryAs(userId, 'select public.finish_ai_request($1, $2, $3, $4, $5, $6, $7)', [id, status, 'gemini', 'gemini-flash-latest', tokens[0], tokens[1], cost])

beforeAll(async () => {
  db = await createTestDatabase()
  alice = await createUser(db, 'alice@example.test')
  bob = await createUser(db, 'bob@example.test')
  shop = (await queryAs(alice, "insert into public.businesses (name) values ('Boutique Awa') returning id"))[0].id
  // Limite réduite pour le test : 3 questions par jour sur la formule « test ».
  await db.query("update public.plans set daily_ai_requests = 3 where id = 'test'")
}, 60_000)

describe('consommation de l’IA', () => {
  it('compte les questions du jour et enregistre jetons et coût', async () => {
    expect(await quota(alice)).toEqual({ used: 0, daily_limit: 3 })
    const id = await begin(alice)
    expect(await quota(alice)).toEqual({ used: 1, daily_limit: 3 })
    await finish(alice, id, 'completed', [1500, 420], 37)
    const [row] = await queryAs(alice, 'select feature, provider, model, input_tokens, output_tokens, estimated_cost_micro_usd, status, business_id from public.ai_usage where id = $1', [id])
    expect(row).toEqual({ feature: 'business_assistant', provider: 'gemini', model: 'gemini-flash-latest', input_tokens: 1500, output_tokens: 420, estimated_cost_micro_usd: 37, status: 'completed', business_id: shop })
    expect(await errorOf(finish(alice, id, 'completed'))).toBe('Demande introuvable ou déjà terminée.')
  })

  it('ne compte pas une question dont le moteur a échoué', async () => {
    const id = await begin(alice)
    await finish(alice, id, 'failed', [0, 0])
    expect(await quota(alice)).toEqual({ used: 1, daily_limit: 3 })
  })

  it('refuse au-delà de la limite du jour', async () => {
    await begin(alice)
    await begin(alice)
    expect(await errorOf(begin(alice))).toBe('Limite du jour atteinte (3 questions). Elle sera renouvelée demain.')
    expect(await quota(alice)).toEqual({ used: 3, daily_limit: 3 })
  })

  it('prend la limite de la formule de l’abonnement du commerce', async () => {
    await db.query("insert into public.plans (id, name, daily_ai_requests, max_businesses) values ('pro-test', 'Pro (test)', 10, 3)")
    await db.query("update public.subscriptions set plan_id = 'pro-test' where business_id = $1", [shop])
    expect(await quota(alice)).toEqual({ used: 3, daily_limit: 10 })
    await begin(alice)
    await db.query("update public.subscriptions set plan_id = 'test' where business_id = $1", [shop])
  })

  it('isole les utilisateurs : rien chez un commerce dont on n’est pas membre, rien sur les lignes des autres', async () => {
    expect(await errorOf(begin(bob))).toBe('Accès refusé à cette entreprise.')
    expect(await errorOf(quota(bob))).toBe('Accès refusé à cette entreprise.')
    const pending = await begin(alice).catch(() => null)
    expect(pending).toBeNull() // Alice a atteint sa limite (3) : rien à réserver.
    const [last] = await queryAs(alice, "select id from public.ai_usage where user_id = $1 and status = 'pending' order by id desc limit 1", [alice])
    expect(await errorOf(finish(bob, last.id, 'completed'))).toBe('Demande introuvable ou déjà terminée.')
    expect(await queryAs(bob, 'select * from public.ai_usage')).toEqual([])
  })

  it('n’autorise ni écriture directe ni appel anonyme', async () => {
    expect(await errorOf(queryAs(alice, "insert into public.ai_usage (user_id, feature, provider, model) values ($1, 'chat', 'x', 'y')", [alice]))).toMatch(/permission denied/)
    expect(await errorOf(queryAs(alice, 'update public.ai_usage set input_tokens = 0'))).toMatch(/permission denied/)
    expect(await errorOf(queryAs(alice, 'delete from public.ai_usage'))).toMatch(/permission denied/)
    expect(await errorOf(asUser(db, null, () => db.query('select public.begin_ai_request($1)', [shop])))).toMatch(/permission denied/)
    expect(await errorOf(queryAs(alice, "select public.begin_ai_request($1, 'chat')", [shop]))).toBe('Fonction d’IA inconnue.')
  })
})
