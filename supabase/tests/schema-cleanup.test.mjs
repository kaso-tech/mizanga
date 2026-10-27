// @vitest-environment node
// Les anciens modules Élevage et Agriculture sont supprimés de la base, avec leurs conversations.
import { describe, expect, it } from 'vitest'
import { createTestDatabase } from './database.mjs'

describe('suppression des modules Élevage et Agriculture', () => {
  it('ne laisse ni table, ni fonction, et refuse les anciens types de conversation', async () => {
    const db = await createTestDatabase()
    const tables = await db.query("select table_name from information_schema.tables where table_schema = 'public' and (table_name like 'livestock%' or table_name like 'farm%')")
    expect(tables.rows).toEqual([])
    const functions = await db.query(`select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in
      ('business_today', 'create_herd', 'record_livestock_event', 'cancel_livestock_event', 'livestock_summary', 'record_farm_operation', 'cancel_farm_operation', 'complete_farm_task', 'farm_crop_results', 'check_crop_area')`)
    expect(functions.rows).toEqual([])
    const [check] = (await db.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conname = 'conversations_kind_check'")).rows
    expect(/** @type {any} */ (check).definition).not.toMatch(/elevage|agriculture/)
    expect(/** @type {any} */ (check).definition).toMatch(/general.*commerce/)
  }, 60_000)
})
