// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createSupabaseAgricultureStore } from './store.mjs'

const session = { token: 'jeton', userId: 'u1' }
const business = '11111111-1111-4111-8111-111111111111'

describe('agriculture dans Supabase (API REST)', () => {
  it('enregistre une récolte par la fonction contrôlée puis la relit avec la culture et la parcelle', async () => {
    /** @type {Array<{ url: string, body: unknown }>} */
    const calls = []
    const fetchImpl = /** @type {typeof fetch} */ (async (url, init) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (String(url).includes('rpc/record_farm_operation')) return Response.json({ id: 'o1' })
      return Response.json([{ id: 'o1', crop_id: 'c1', kind: 'harvest', work_type: null, input_type: null, label: null, quantity: '18', unit: 'sac', quantity_kg: '1800', stock_delta: '1800', amount: 0, note: null, occurred_on: '2026-10-20', status: 'recorded', cancel_reason: null, created_at: '2026-10-20T08:00:00Z', crop: { crop_label: 'Maïs', plot: { name: 'Champ 1' } } }])
    })
    const store = createSupabaseAgricultureStore({ supabaseUrl: 'https://exemple.supabase.co', publishableKey: 'cle' }, { fetchImpl })
    const operation = await store.recordOperation(session, business, { cropId: 'c1', kind: 'harvest', quantity: 18, unit: 'sac', unitKg: 100, amount: 0, occurredOn: null, workType: null, inputType: null, label: null, note: null })
    expect(operation).toMatchObject({ cropLabel: 'Maïs', plotName: 'Champ 1', quantity: 18, quantityKg: 1800, stockDelta: 1800 })
    expect(calls[0]).toMatchObject({ url: 'https://exemple.supabase.co/rest/v1/rpc/record_farm_operation', body: { p_business_id: business, p_crop_id: 'c1', p_kind: 'harvest', p_quantity: 18, p_unit: 'sac', p_unit_kg: 100 } })
    expect(calls[1].url).toContain('crop:farm_crops!farm_operations_crop_id_fkey(crop_label,plot:farm_plots!farm_crops_plot_id_fkey(name))')
  })

  it('marque un travail prévu comme fait par la fonction contrôlée', async () => {
    /** @type {string[]} */
    const urls = []
    const fetchImpl = /** @type {typeof fetch} */ (async (url) => {
      urls.push(String(url))
      if (String(url).includes('rpc/')) return Response.json({ id: 't1' })
      return Response.json([{ id: 't1', crop_id: 'c1', work_type: 'weeding', label: null, due_on: '2026-10-20', status: 'done', done_on: '2026-10-21', crop: { crop_label: 'Maïs', plot: { name: 'Champ 1' } } }])
    })
    const store = createSupabaseAgricultureStore({ supabaseUrl: 'https://exemple.supabase.co', publishableKey: 'cle' }, { fetchImpl })
    expect(await store.updateTask(session, business, 't1', { status: 'done', doneOn: '2026-10-21', amount: 5000 })).toMatchObject({ status: 'done', doneOn: '2026-10-21', cropLabel: 'Maïs' })
    expect(urls[0]).toContain('rpc/complete_farm_task')
  })
})
