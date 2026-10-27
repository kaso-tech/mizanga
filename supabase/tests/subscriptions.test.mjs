// @vitest-environment node
// Étape 6 : abonnements en mode test (formule attribuée automatiquement, limites appliquées).
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createTestDatabase, createUser, errorOf } from './database.mjs'

/** @type {import('@electric-sql/pglite').PGlite} */
let db
let alice = ''
let bob = ''
let shop = ''

/** @param {string} userId @param {string} sql @param {unknown[]} [params] */
const queryAs = (userId, sql, params = []) => asUser(db, userId, async () => /** @type {any[]} */ ((await db.query(sql, params)).rows))
const createShop = async (/** @type {string} */ userId, /** @type {string} */ name) => (await queryAs(userId, 'insert into public.businesses (name) values ($1) returning id', [name]))[0].id
const subscriptionOf = async (/** @type {string} */ userId, /** @type {string} */ businessId) => (await queryAs(userId, 'select public.business_subscription($1) as s', [businessId]))[0].s

beforeAll(async () => {
  db = await createTestDatabase()
  alice = await createUser(db, 'alice@example.test')
  bob = await createUser(db, 'bob@example.test')
}, 60_000)

describe('abonnements (mode test)', () => {
  it('attribue la formule Gratuit à chaque nouveau commerce', async () => {
    shop = await createShop(alice, 'Boutique Awa')
    expect(await subscriptionOf(alice, shop)).toMatchObject({
      planId: 'test', planName: 'Gratuit', isTest: false, status: 'test', monthlyPrice: 0, currency: 'XOF',
      dailyAiRequests: 30, maxBusinesses: 1, maxListings: 5, maxPhotos: 3, activeListings: 0, currentPeriodEnd: null, aiUsedToday: 0,
    })
  })

  it('compte les questions du jour à l’assistant', async () => {
    await queryAs(alice, 'select public.begin_ai_request($1)', [shop])
    expect((await subscriptionOf(alice, shop)).aiUsedToday).toBe(1)
  })

  it('limite le nombre de commerces selon la formule', async () => {
    expect(await errorOf(createShop(alice, 'Deuxième boutique'))).toBe('Votre formule permet 1 commerce(s) : vous avez atteint cette limite.')
    // Une formule plus généreuse (changée par l’administrateur) lève la limite.
    await db.query("insert into public.plans (id, name, daily_ai_requests, max_businesses) values ('pro-test', 'Pro (test)', 200, 3)")
    await db.query("update public.subscriptions set plan_id = 'pro-test' where business_id = $1", [shop])
    const second = await createShop(alice, 'Deuxième boutique')
    expect((await subscriptionOf(alice, second)).planId).toBe('test')
    expect((await subscriptionOf(alice, shop))).toMatchObject({ planId: 'pro-test', dailyAiRequests: 200, maxBusinesses: 3 })
  })

  it('protège les abonnements : lecture par les membres seulement, aucune écriture par les utilisateurs', async () => {
    expect(await errorOf(subscriptionOf(bob, shop))).toBe('Accès refusé à cette entreprise.')
    expect(await queryAs(bob, 'select * from public.subscriptions')).toEqual([])
    expect(await errorOf(queryAs(alice, "update public.subscriptions set plan_id = 'pro-test'"))).toMatch(/permission denied/)
    expect(await errorOf(queryAs(alice, "insert into public.subscriptions (business_id, plan_id) values ($1, 'pro-test')", [shop]))).toMatch(/permission denied/)
    expect(await errorOf(queryAs(alice, "insert into public.plans (id, name, daily_ai_requests, max_businesses) values ('gratuit', 'x', 9999, 99)"))).toMatch(/permission denied/)
    expect(await errorOf(queryAs(alice, 'select public.allowed_businesses($1)', [alice]))).toMatch(/permission denied/)
    expect(await errorOf(asUser(db, null, () => db.query('select public.business_subscription($1)', [shop])))).toMatch(/permission denied/)
  })

  it('ne limite pas les opérations de l’administrateur dans la base', async () => {
    const { rows } = await db.query("insert into public.businesses (name, created_by) values ('Créé par l’administrateur', $1) returning id", [bob])
    expect(rows).toHaveLength(1)
  })
})
