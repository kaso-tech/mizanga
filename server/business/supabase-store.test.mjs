// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseBusinessStore, toBusinessError } from './supabase-store.mjs'

const session = { token: 'jeton-utilisateur', userId: '11111111-1111-1111-1111-111111111111' }
const productRow = { id: 'p1', name: 'Riz', unit: 'sac', sku: null, quantity: 10, purchase_price: 15000, sale_price: 17500, alert_threshold: 3, archived: false, updated_at: '2026-10-22T08:00:00.000Z' }

/** Fausse API REST : renvoie `reply` et garde les requêtes reçues. @param {number} status @param {unknown} reply */
function fakeRest(status, reply) {
  const calls = /** @type {Array<{ url: string, init: RequestInit }>} */ ([])
  const fetchImpl = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(reply), { status, headers: { 'Content-Type': 'application/json' } })
  })
  return { calls, store: createSupabaseBusinessStore({ supabaseUrl: 'https://projet.supabase.co', publishableKey: 'cle-publique' }, { fetchImpl: /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchImpl)) }) }
}

describe('accès aux données Business par l’API REST de Supabase', () => {
  it('interroge la base avec le jeton de l’utilisateur et la clé publique', async () => {
    const { calls, store } = fakeRest(200, [{ role: 'owner', business: { id: 'b1', name: 'Boutique', currency: 'XOF', country_code: 'BF', timezone: 'Africa/Ouagadougou' } }])
    expect(await store.listBusinesses(session)).toEqual([{ id: 'b1', name: 'Boutique', currency: 'XOF', countryCode: 'BF', timezone: 'Africa/Ouagadougou', role: 'owner' }])
    expect(calls[0].url).toBe(`https://projet.supabase.co/rest/v1/business_members?select=role,business:businesses(id,name,currency,country_code,timezone)&user_id=eq.${session.userId}`)
    expect(calls[0].init.headers).toMatchObject({ apikey: 'cle-publique', Authorization: 'Bearer jeton-utilisateur' })
  })

  it('crée un produit par la fonction contrôlée et lit les produits actifs', async () => {
    const { calls, store } = fakeRest(200, productRow)
    const product = await store.createProduct(session, 'b1', { name: 'Riz', unit: 'sac', sku: null, purchasePrice: 15000, salePrice: 17500, alertThreshold: 3, initialQuantity: 10 })
    expect(product).toMatchObject({ id: 'p1', quantity: 10, purchasePrice: 15000 })
    expect(calls[0].url).toBe('https://projet.supabase.co/rest/v1/rpc/create_product')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ p_business_id: 'b1', p_name: 'Riz', p_unit: 'sac', p_purchase_price: 15000, p_sale_price: 17500, p_alert_threshold: 3, p_initial_quantity: 10, p_sku: null })

    const list = fakeRest(200, [productRow])
    await list.store.listProducts(session, 'b1', { includeArchived: false })
    expect(list.calls[0].url).toContain('products?select=id,name,unit,sku,quantity,purchase_price,sale_price,alert_threshold,archived,updated_at&business_id=eq.b1&archived=eq.false&order=name.asc')
  })

  it('modifie un produit en demandant la ligne modifiée, et signale un produit inaccessible', async () => {
    const { calls, store } = fakeRest(200, [productRow])
    await store.updateProduct(session, 'b1', 'p1', { sale_price: 18000 })
    expect(calls[0].init).toMatchObject({ method: 'PATCH', headers: { Prefer: 'return=representation' } })
    expect(calls[0].url).toContain('&id=eq.p1&business_id=eq.b1')
    await expect(fakeRest(200, []).store.updateProduct(session, 'b1', 'p1', { sale_price: 1 })).rejects.toMatchObject({ status: 404, message: 'Produit introuvable.' })
  })

  it('reprend les messages des fonctions contrôlées et traduit les autres erreurs', async () => {
    const { store } = fakeRest(400, { code: 'GL409', message: 'Stock insuffisant : il reste 2 sac.' })
    await expect(store.recordMovement(session, 'b1', 'p1', { kind: 'loss', quantity: 5, unitCost: null, note: null })).rejects.toMatchObject({ status: 409, message: 'Stock insuffisant : il reste 2 sac.' })
    expect(toBusinessError(403, { code: '42501', message: 'permission denied for table products' })).toMatchObject({ status: 403, message: 'Accès refusé.' })
    expect(toBusinessError(401, { code: 'PGRST303', message: 'JWT expired' })).toMatchObject({ status: 401, message: 'Votre session a expiré : reconnectez-vous.' })
    expect(toBusinessError(400, { code: '23514', message: 'violates check constraint' })).toMatchObject({ status: 422 })
    expect(toBusinessError(500, null)).toMatchObject({ status: 502 })
  })

  it('signale une base injoignable', async () => {
    const store = createSupabaseBusinessStore({ supabaseUrl: 'https://projet.supabase.co', publishableKey: 'k' }, { fetchImpl: async () => { throw new TypeError('fetch failed') } })
    await expect(store.listProducts(session, 'b1', { includeArchived: true })).rejects.toMatchObject({ status: 503 })
  })
})
