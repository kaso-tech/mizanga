// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createSupabaseLivestockStore } from './store.mjs'

const session = { token: 'jeton', userId: 'u1' }
const business = '11111111-1111-4111-8111-111111111111'

describe('élevage dans Supabase (API REST)', () => {
  it('enregistre un événement par la fonction contrôlée puis le relit avec le nom du lot', async () => {
    /** @type {Array<{ url: string, method: string, body: unknown, authorization: string }>} */
    const calls = []
    const fetchImpl = /** @type {typeof fetch} */ (async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined, authorization: /** @type {Record<string, string>} */ (init?.headers ?? {}).Authorization })
      if (String(url).includes('rpc/record_livestock_event')) return Response.json({ id: 'e1' })
      return Response.json([{ id: 'e1', herd_id: 'h1', animal_id: null, kind: 'death', quantity: 2, headcount_delta: -2, amount: 0, cause: 'Chaleur', note: null, occurred_on: '2026-10-20', status: 'recorded', cancel_reason: null, created_at: '2026-10-20T08:00:00Z', herd: { name: 'Poulets' }, animal: null }])
    })
    const store = createSupabaseLivestockStore({ supabaseUrl: 'https://exemple.supabase.co', publishableKey: 'cle' }, { fetchImpl })
    const event = await store.recordEvent(session, business, { herdId: 'h1', kind: 'death', quantity: 2, amount: 0, occurredOn: '2026-10-20', cause: 'Chaleur', note: null, animalId: null, animal: null })
    expect(event).toMatchObject({ id: 'e1', herdName: 'Poulets', kind: 'death', quantity: 2, headcountDelta: -2, occurredOn: '2026-10-20', cause: 'Chaleur' })
    expect(calls[0]).toMatchObject({ url: 'https://exemple.supabase.co/rest/v1/rpc/record_livestock_event', method: 'POST', authorization: 'Bearer jeton' })
    expect(calls[0].body).toMatchObject({ p_business_id: business, p_herd_id: 'h1', p_kind: 'death', p_quantity: 2, p_animal: null })
    expect(calls[1].url).toContain('livestock_events?select=')
    expect(calls[1].url).toContain('herd:livestock_herds!livestock_events_herd_id_fkey(name)')
  })

  it('traduit un refus de la base en message pour l’éleveur', async () => {
    const fetchImpl = /** @type {typeof fetch} */ (async () => Response.json({ code: 'GL409', message: 'Effectif insuffisant dans « Poulets » : il reste 3 animaux.' }, { status: 400 }))
    const store = createSupabaseLivestockStore({ supabaseUrl: 'https://exemple.supabase.co', publishableKey: 'cle' }, { fetchImpl })
    await expect(store.recordEvent(session, business, { herdId: 'h1', kind: 'sale', quantity: 9, amount: 1, occurredOn: null, cause: null, note: null, animalId: null, animal: null })).rejects.toMatchObject({ status: 409, message: 'Effectif insuffisant dans « Poulets » : il reste 3 animaux.' })
  })
})
