// @vitest-environment node
// Sécurité de l’espace Business : un commerçant ne doit jamais lire ni modifier les données d’un autre,
// même en appelant la base directement avec son propre jeton (ce que la clé publique Supabase permet).
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createTestDatabase, createUser, errorOf } from './database.mjs'

/** @type {import('@electric-sql/pglite').PGlite} */
let db
let alice = ''
let bob = ''
let carla = ''
let aliceShop = ''
let bobShop = ''
let aliceProduct = ''
let aliceSale = ''

const count = async (/** @type {string} */ sql, /** @type {unknown[]} */ params = []) => /** @type {{ n: number }} */ ((await db.query(`select count(*)::int as n from (${sql}) as rows`, params)).rows[0]).n

beforeAll(async () => {
  db = await createTestDatabase()
  alice = await createUser(db, 'alice@example.test')
  bob = await createUser(db, 'bob@example.test')
  carla = await createUser(db, 'carla@example.test')

  aliceShop = await asUser(db, alice, async () => /** @type {{ id: string }} */ ((await db.query("insert into public.businesses (name) values ('Boutique d’Alice') returning id")).rows[0]).id)
  bobShop = await asUser(db, bob, async () => /** @type {{ id: string }} */ ((await db.query("insert into public.businesses (name) values ('Boutique de Bob') returning id")).rows[0]).id)
  aliceProduct = await asUser(db, alice, async () => /** @type {{ id: string }} */ ((await db.query("insert into public.products (business_id, name, purchase_price, sale_price) values ($1, 'Riz 25 kg', 15000, 17500) returning id", [aliceShop])).rows[0]).id)

  // Carla est employée d’Alice (ajoutée par le serveur : les membres ne s’ajoutent pas eux-mêmes).
  await db.query("insert into public.business_members (business_id, user_id, role) values ($1, $2, 'staff')", [aliceShop, carla])

  // Une vente et son mouvement de stock, écrits comme le feront les fonctions de l’étape 4.
  aliceSale = /** @type {{ id: string }} */ ((await db.query('insert into public.sales (business_id, total_amount, total_cost, created_by) values ($1, 17500, 15000, $2) returning id', [aliceShop, alice])).rows[0]).id
  await db.query('insert into public.sale_items (business_id, sale_id, product_id, quantity, unit_price, unit_cost, line_total, line_cost) values ($1, $2, $3, 1, 17500, 15000, 17500, 15000)', [aliceShop, aliceSale, aliceProduct])
  await db.query("insert into public.stock_movements (business_id, product_id, kind, quantity_delta, unit_cost, sale_id, created_by) values ($1, $2, 'sale', -1, 15000, $3, $4)", [aliceShop, aliceProduct, aliceSale, alice])
  await db.query("insert into public.expenses (business_id, amount, category, created_by) values ($1, 2000, 'transport', $2)", [aliceShop, alice])
  await db.query("insert into public.ai_usage (user_id, feature, provider, model, input_tokens, output_tokens) values ($1, 'business_assistant', 'gemini', 'test', 100, 50), ($2, 'chat', 'gemini', 'test', 10, 5)", [alice, bob])
  await db.query("insert into public.subscriptions (business_id, plan_id) values ($1, 'test')", [aliceShop])
}, 60_000)

describe('comptes et entreprises', () => {
  it('crée un profil à l’inscription ; chacun ne voit et ne modifie que le sien', async () => {
    expect(await count('select * from public.profiles')).toBe(3)
    await asUser(db, alice, async () => {
      expect(await count('select * from public.profiles')).toBe(1)
      await db.query("update public.profiles set display_name = 'Alice' where id = $1", [alice])
      const updated = await db.query("update public.profiles set display_name = 'Piraté' where id = $1", [bob])
      expect(updated.affectedRows).toBe(0)
    })
    expect((await db.query('select display_name from public.profiles where id = $1', [bob])).rows[0]).toEqual({ display_name: null })
  })

  it('fait du créateur le propriétaire ; les autres ne voient pas l’entreprise', async () => {
    expect((await db.query('select user_id, role from public.business_members where business_id = $1 order by role', [aliceShop])).rows).toEqual([
      { user_id: alice, role: 'owner' },
      { user_id: carla, role: 'staff' },
    ])
    await asUser(db, bob, async () => {
      expect(await count('select * from public.businesses')).toBe(1)
      expect(await count('select * from public.businesses where id = $1', [aliceShop])).toBe(0)
      expect(await count('select * from public.business_members where business_id = $1', [aliceShop])).toBe(0)
    })
  })

  it('empêche de créer une entreprise au nom d’un autre ou de s’ajouter comme membre', async () => {
    await asUser(db, bob, async () => {
      expect(await errorOf(db.query("insert into public.businesses (name, created_by) values ('Usurpée', $1)", [alice]))).toMatch(/permission denied/)
      expect(await errorOf(db.query("insert into public.business_members (business_id, user_id, role) values ($1, $2, 'owner')", [aliceShop, bob]))).toMatch(/permission denied/)
    })
  })

  it('réserve la modification et la suppression de l’entreprise au propriétaire', async () => {
    await asUser(db, carla, async () => {
      expect((await db.query("update public.businesses set name = 'Renommée' where id = $1", [aliceShop])).affectedRows).toBe(0)
      expect((await db.query('delete from public.businesses where id = $1', [aliceShop])).affectedRows).toBe(0)
    })
    await asUser(db, bob, async () => {
      expect((await db.query('delete from public.businesses where id = $1', [aliceShop])).affectedRows).toBe(0)
    })
    expect(await count('select * from public.businesses where id = $1', [aliceShop])).toBe(1)
  })
})

describe('produits et stock', () => {
  it('isole les produits entre entreprises', async () => {
    await asUser(db, bob, async () => {
      expect(await count('select * from public.products')).toBe(0)
      expect((await db.query('update public.products set sale_price = 1 where id = $1', [aliceProduct])).affectedRows).toBe(0)
      expect((await db.query('delete from public.products where id = $1', [aliceProduct])).affectedRows).toBe(0)
      expect(await errorOf(db.query("insert into public.products (business_id, name) values ($1, 'Intrus')", [aliceShop]))).toMatch(/row-level security/)
    })
    await asUser(db, carla, async () => {
      expect(await count('select * from public.products')).toBe(1)
    })
    expect((await db.query('select sale_price from public.products where id = $1', [aliceProduct])).rows[0]).toEqual({ sale_price: 17500 })
  })

  it('interdit de changer la quantité en stock directement (seulement par les mouvements)', async () => {
    await asUser(db, alice, async () => {
      expect(await errorOf(db.query('update public.products set quantity = 999 where id = $1', [aliceProduct]))).toMatch(/permission denied/)
      expect(await errorOf(db.query("insert into public.products (business_id, name, quantity) values ($1, 'Sucre', 50)", [aliceShop]))).toMatch(/permission denied/)
      expect(await errorOf(db.query('update public.products set business_id = $1 where id = $2', [bobShop, aliceProduct]))).toMatch(/permission denied/)
      expect(await errorOf(db.query("insert into public.stock_movements (business_id, product_id, kind, quantity_delta) values ($1, $2, 'adjustment', 10)", [aliceShop, aliceProduct]))).toMatch(/permission denied/)
    })
  })

  it('réserve la suppression d’un produit au propriétaire', async () => {
    await asUser(db, carla, async () => {
      expect((await db.query('delete from public.products where id = $1', [aliceProduct])).affectedRows).toBe(0)
    })
  })

  it('refuse de rattacher une vente au produit d’une autre entreprise', async () => {
    const bobProduct = /** @type {{ id: string }} */ ((await db.query("insert into public.products (business_id, name) values ($1, 'Huile') returning id", [bobShop])).rows[0]).id
    expect(await errorOf(db.query('insert into public.sale_items (business_id, sale_id, product_id, quantity, unit_price, unit_cost, line_total, line_cost) values ($1, $2, $3, 1, 1, 1, 1, 1)', [aliceShop, aliceSale, bobProduct]))).toMatch(/foreign key/)
  })
})

describe('ventes, dépenses, IA et abonnements', () => {
  it('isole ventes, lignes et mouvements ; personne ne les écrit directement', async () => {
    await asUser(db, alice, async () => {
      expect(await count('select * from public.sales')).toBe(1)
      expect(await count('select * from public.sale_items')).toBe(1)
      expect(await count('select * from public.stock_movements')).toBe(1)
      expect(await errorOf(db.query('insert into public.sales (business_id) values ($1)', [aliceShop]))).toMatch(/permission denied/)
      expect(await errorOf(db.query('update public.sales set total_amount = 0 where id = $1', [aliceSale]))).toMatch(/permission denied/)
    })
    await asUser(db, bob, async () => {
      expect(await count('select * from public.sales')).toBe(0)
      expect(await count('select * from public.sale_items')).toBe(0)
      expect(await count('select * from public.stock_movements')).toBe(0)
    })
  })

  it('isole les dépenses ; un employé ajoute mais ne supprime pas', async () => {
    await asUser(db, bob, async () => {
      expect(await count('select * from public.expenses')).toBe(0)
      expect(await errorOf(db.query('insert into public.expenses (business_id, amount) values ($1, 100)', [aliceShop]))).toMatch(/row-level security/)
      expect((await db.query('update public.expenses set amount = 1 where business_id = $1', [aliceShop])).affectedRows).toBe(0)
    })
    await asUser(db, carla, async () => {
      const inserted = await db.query("insert into public.expenses (business_id, amount, category) values ($1, 500, 'emballages') returning created_by", [aliceShop])
      expect(inserted.rows[0]).toEqual({ created_by: carla })
      expect(await errorOf(db.query('insert into public.expenses (business_id, amount, created_by) values ($1, 1, $2)', [aliceShop, alice]))).toMatch(/permission denied/)
      expect((await db.query('delete from public.expenses where business_id = $1', [aliceShop])).affectedRows).toBe(0)
      expect(await count('select * from public.expenses')).toBe(2)
    })
    await asUser(db, alice, async () => {
      expect(await errorOf(db.query('insert into public.expenses (business_id, amount) values ($1, 0)', [aliceShop]))).toMatch(/check constraint/)
    })
  })

  it('montre à chacun sa seule consommation IA, sans pouvoir l’écrire', async () => {
    await asUser(db, alice, async () => {
      expect((await db.query('select feature from public.ai_usage')).rows).toEqual([{ feature: 'business_assistant' }])
      expect(await errorOf(db.query("insert into public.ai_usage (user_id, feature, provider, model) values ($1, 'chat', 'x', 'y')", [alice]))).toMatch(/permission denied/)
    })
  })

  it('montre les formules ; l’abonnement seulement aux membres de l’entreprise', async () => {
    await asUser(db, bob, async () => {
      expect(await count('select * from public.plans')).toBe(1)
      expect(await count('select * from public.subscriptions')).toBe(0)
      expect(await errorOf(db.query("insert into public.subscriptions (business_id, plan_id) values ($1, 'test')", [bobShop]))).toMatch(/permission denied/)
    })
    await asUser(db, carla, async () => {
      expect(await count('select * from public.subscriptions')).toBe(1)
    })
  })

  it('n’expose pas les fonctions internes aux utilisateurs connectés', async () => {
    await asUser(db, alice, async () => {
      for (const fn of ['handle_new_user', 'add_business_owner', 'set_updated_at']) {
        expect(await errorOf(db.query(`select public.${fn}()`)), fn).toMatch(/permission denied/)
      }
      expect((await db.query('select public.is_business_member($1) as member', [bobShop])).rows[0]).toEqual({ member: false })
    })
  })

  it('ne donne rien aux visiteurs non connectés', async () => {
    await asUser(db, null, async () => {
      for (const table of ['profiles', 'businesses', 'business_members', 'products', 'sales', 'sale_items', 'stock_movements', 'expenses', 'ai_usage', 'plans', 'subscriptions']) {
        expect(await errorOf(db.query(`select * from public.${table}`)), table).toMatch(/permission denied/)
      }
      expect(await errorOf(db.query('select public.is_business_member($1)', [aliceShop]))).toMatch(/permission denied/)
    })
  })
})
