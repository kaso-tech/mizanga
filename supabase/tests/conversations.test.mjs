// @vitest-environment node
// Conversations enregistrées sur le compte : chacun les siennes, assistants rattachés à un commerce du membre.
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createTestDatabase, createUser, errorOf } from './database.mjs'

/** @type {import('@electric-sql/pglite').PGlite} */
let db
let alice = ''
let bob = ''
let shop = ''

/** @param {string | null} userId @param {string} sql @param {unknown[]} [params] */
const queryAs = (userId, sql, params = []) => asUser(db, userId, async () => /** @type {any[]} */ ((await db.query(sql, params)).rows))
const insert = (/** @type {string} */ userId, /** @type {string} */ id, kind = 'general', business = /** @type {string | null} */ (null)) => queryAs(userId, "insert into public.conversations (id, kind, business_id, title, messages) values ($1, $2, $3, 'Titre', '[]') returning id", [id, kind, business])

beforeAll(async () => {
  db = await createTestDatabase()
  alice = await createUser(db, 'alice@example.test')
  bob = await createUser(db, 'bob@example.test')
  shop = (await queryAs(alice, "insert into public.businesses (name) values ('Boutique Awa') returning id"))[0].id
}, 60_000)

describe('conversations enregistrées sur le compte', () => {
  it('garde les conversations de chacun pour lui seul', async () => {
    await insert(alice, 'conversation-alice-1')
    await insert(bob, 'conversation-bob-1')
    expect((await queryAs(alice, 'select id from public.conversations')).map((row) => row.id)).toEqual(['conversation-alice-1'])
    expect(await queryAs(bob, "update public.conversations set title = 'Piraté' where id = 'conversation-alice-1' returning id")).toEqual([])
    expect(await queryAs(bob, "delete from public.conversations where id = 'conversation-alice-1' returning id")).toEqual([])
    expect(await errorOf(queryAs(bob, "insert into public.conversations (user_id, id) values ($1, 'conversation-usurpee')", [alice]))).toMatch(/row-level security/)
    // Même identifiant chez deux personnes : deux conversations distinctes.
    await insert(bob, 'conversation-alice-1')
    expect((await queryAs(alice, "select title from public.conversations where id = 'conversation-alice-1'"))).toHaveLength(1)
  })

  it('rattache une conversation d’assistant à un commerce dont on est membre', async () => {
    await insert(alice, 'conversation-commerce-1', 'commerce', shop)
    expect(await errorOf(insert(bob, 'conversation-commerce-2', 'commerce', shop))).toMatch(/row-level security/)
    expect(await errorOf(insert(alice, 'conversation-sans-commerce', 'elevage'))).toMatch(/check constraint/)
    expect(await errorOf(insert(alice, 'conversation-generale-liee', 'general', shop))).toMatch(/check constraint/)
    expect(await errorOf(insert(alice, 'conversation-x', 'peche', shop))).toMatch(/check constraint/)
  })

  it('refuse les visiteurs et les identifiants invalides', async () => {
    expect(await errorOf(queryAs(null, 'select * from public.conversations'))).toMatch(/permission denied/)
    expect(await errorOf(insert(alice, "x'; drop table"))).toMatch(/check constraint/)
  })
})
