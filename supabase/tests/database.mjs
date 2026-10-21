// Base PostgreSQL de test (PGlite, en mémoire) avec ce que fournit Supabase, puis nos migrations.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const supabaseDir = fileURLToPath(new URL('..', import.meta.url))

/** Applique la simulation de Supabase puis toutes les migrations, dans l’ordre de leur nom. */
export async function createTestDatabase() {
  const db = new PGlite()
  await db.exec(readFileSync(join(supabaseDir, 'tests', 'supabase-shim.sql'), 'utf8'))
  const migrationsDir = join(supabaseDir, 'migrations')
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
  }
  return db
}

/** Crée un compte (comme le ferait Supabase Auth) et renvoie son identifiant. @param {PGlite} db @param {string} email */
export async function createUser(db, email) {
  const { rows } = await db.query('insert into auth.users (email) values ($1) returning id', [email])
  return /** @type {{ id: string }} */ (rows[0]).id
}

/**
 * Exécute `work` avec l’identité d’un utilisateur connecté (rôle authenticated et jeton simulé),
 * ou d’un visiteur anonyme si `userId` est null, puis revient au superutilisateur.
 * @template T
 * @param {PGlite} db @param {string | null} userId @param {(db: PGlite) => Promise<T>} work
 */
export async function asUser(db, userId, work) {
  await db.exec(userId ? 'set role authenticated' : 'set role anon')
  await db.query("select set_config('request.jwt.claims', $1, false)", [userId ? JSON.stringify({ sub: userId, role: 'authenticated' }) : ''])
  try {
    return await work(db)
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claims', '', false)")
  }
}

/** Message d’erreur PostgreSQL d’une opération censée échouer (ou null si elle a réussi). @param {Promise<unknown>} operation */
export async function errorOf(operation) {
  try {
    await operation
    return null
  } catch (error) {
    return /** @type {Error} */ (error).message
  }
}
