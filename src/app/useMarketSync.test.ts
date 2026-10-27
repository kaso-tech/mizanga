import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedApi } from '../services/savedApi'
import { addAlert, alertsStore, favoritesStore, toggleFavorite, type MarketAlert } from './marketSaved'
import { mergeSaved, useMarketSync } from './useMarketSync'

const UUID = '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d'
const card = (id: string) => ({ id, title: `Annonce ${id}`, price: 48000, currency: 'XOF', photo: null, city: 'Ouagadougou', sellerName: 'Awa', sellerVerified: false, condition: 'new' })
const alert = (changes: Partial<MarketAlert>): MarketAlert => ({ id: UUID, label: 'tecno', filters: { q: 'tecno' }, createdAt: '2026-10-20T10:00:00.000Z', seenAt: '2026-10-20T10:00:00.000Z', checkedAt: null, newCount: 0, notify: true, ...changes })

function fakeApi(remote: Awaited<ReturnType<SavedApi['list']>>) {
  return {
    list: vi.fn(async () => remote),
    saveFavorite: vi.fn(async () => ({})),
    deleteFavorite: vi.fn(async () => ({})),
    saveAlert: vi.fn(async () => ({})),
    deleteAlert: vi.fn(async () => ({})),
    subscribePush: vi.fn(async () => ({})),
    unsubscribePush: vi.fn(async () => ({})),
    myReview: vi.fn(async () => null),
    saveReview: vi.fn(async () => ({ id: 'r1', rating: 5, comment: null, status: 'published' as const, revision: 1, updatedAt: '2026-10-27T00:00:00.000Z' })),
    deleteReview: vi.fn(async () => ({})),
  } satisfies SavedApi
}

beforeEach(() => {
  localStorage.clear()
  favoritesStore.reset()
  alertsStore.reset()
})

describe('favoris et alertes sur le compte', () => {
  it('réunit l’appareil et le compte sans rien perdre ni doubler une recherche', () => {
    const merged = mergeSaved(
      { favorites: [{ ...card('l1'), savedAt: '2026-10-21T00:00:00.000Z' }], alerts: [alert({ id: 'ancien-identifiant', seenAt: '2026-10-25T10:00:00.000Z', newCount: 2 }), alert({ id: 'autre', label: 'riz', filters: { q: 'riz' } })] },
      { favorites: [{ listingId: 'l2', snapshot: { ...card('l2'), savedAt: '2026-10-19T00:00:00.000Z' }, createdAt: '2026-10-19T00:00:00.000Z' }, { listingId: 'l3', snapshot: {}, createdAt: '2026-10-19T00:00:00.000Z' }], alerts: [{ id: UUID, label: 'tecno', filters: { q: 'tecno' }, seenAt: '2026-10-22T10:00:00.000Z', notify: false, createdAt: '2026-10-20T10:00:00.000Z' }] },
    )
    expect(merged.favorites.map((item) => item.id)).toEqual(['l1', 'l2']) // l3 : fiche abîmée, ignorée
    expect(merged.uploadFavorites.map((item) => item.id)).toEqual(['l1'])
    // Même recherche : une seule alerte, celle du compte, avec la consultation la plus récente.
    expect(merged.alerts).toHaveLength(2)
    expect(merged.alerts[0]).toMatchObject({ id: UUID, seenAt: '2026-10-25T10:00:00.000Z', newCount: 2, notify: false })
    expect(merged.alerts[1].id).toMatch(/^[0-9a-f-]{36}$/) // identifiant de l’appareil remplacé par un UUID
    expect(merged.uploadAlerts.map((item) => item.label)).toEqual(['tecno', 'riz'])
  })

  it('à la connexion, réunit puis envoie chaque modification au compte', async () => {
    toggleFavorite(card('l1'))
    const api = fakeApi({ favorites: [{ listingId: 'l2', snapshot: card('l2'), createdAt: '2026-10-19T00:00:00.000Z' }], alerts: [] })
    const { unmount } = renderHook(() => useMarketSync(api, 'utilisateur-1'))
    await waitFor(() => expect(api.saveFavorite).toHaveBeenCalledWith('l1', expect.objectContaining({ id: 'l1', price: 48000 })))
    expect(favoritesStore.get().map((item) => item.id)).toEqual(['l1', 'l2'])
    expect(api.saveFavorite).toHaveBeenCalledTimes(1)

    toggleFavorite(card('l2'))
    await waitFor(() => expect(api.deleteFavorite).toHaveBeenCalledWith('l2'))
    expect(addAlert({ q: 'moto' }, 'moto')).toBe('added')
    await waitFor(() => expect(api.saveAlert).toHaveBeenCalledWith(expect.objectContaining({ label: 'moto', filters: { q: 'moto' }, notify: true })))
    unmount()
  })

  it('reste sur l’appareil si le compte est injoignable', async () => {
    toggleFavorite(card('l1'))
    const api = fakeApi({ favorites: [], alerts: [] })
    api.list.mockRejectedValueOnce(new Error('hors connexion'))
    renderHook(() => useMarketSync(api, 'utilisateur-1'))
    await waitFor(() => expect(api.list).toHaveBeenCalled())
    expect(favoritesStore.get().map((item) => item.id)).toEqual(['l1'])
    expect(api.saveFavorite).not.toHaveBeenCalled()
  })
})
