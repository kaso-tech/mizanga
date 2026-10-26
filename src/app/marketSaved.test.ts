import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addAlert, alertsStore, checkAlerts, compareStore, favoritesStore, MAX_ALERTS, readFilters, toggleCompare, toggleFavorite } from './marketSaved'

const listing = (id: string, price = 48000) => ({ id, title: `Annonce ${id}`, price, currency: 'XOF', photo: '/photos/a.png', city: 'Ouagadougou', sellerName: 'Awa', sellerVerified: true, condition: 'new' })

beforeEach(() => {
  localStorage.clear()
  for (const store of [favoritesStore, compareStore, alertsStore]) store.reset()
})

describe('favoris, comparaison et alertes de la marketplace', () => {
  it('relit les favoris enregistrés en ignorant les données abîmées ou dangereuses', () => {
    localStorage.setItem('gilli.marketplace.favorites', JSON.stringify([
      { ...listing('l1'), savedAt: '2026-10-20T10:00:00Z', photo: 'javascript:alert(1)' },
      { id: 'l2', title: 'sans prix' },
      'n’importe quoi',
    ]))
    expect(favoritesStore.get()).toEqual([{ ...listing('l1'), photo: null, savedAt: '2026-10-20T10:00:00Z' }])
    expect(toggleFavorite(listing('l1'))).toBe(false)
    expect(toggleFavorite(listing('l3'))).toBe(true)
    expect(favoritesStore.get().map((item) => item.id)).toEqual(['l3'])
  })

  it('compare 3 annonces au plus', () => {
    expect(['l1', 'l2', 'l3'].map((id) => toggleCompare(listing(id)))).toEqual(['added', 'added', 'added'])
    expect(toggleCompare(listing('l4'))).toBe('full')
    expect(toggleCompare(listing('l2'))).toBe('removed')
    expect(compareStore.get().map((item) => item.id)).toEqual(['l1', 'l3'])
  })

  it('crée des alertes sans doublon (10 au plus) et compte les annonces publiées depuis la dernière visite', async () => {
    expect(addAlert({ q: 'tecno', maxPrice: 50000, sort: 'price_asc' }, 'tecno')).toBe('added')
    expect(addAlert({ q: 'tecno', maxPrice: 50000 }, 'tecno')).toBe('exists') // le tri ne compte pas
    for (let index = 1; index < MAX_ALERTS; index += 1) addAlert({ q: `produit ${index}` }, `produit ${index}`)
    expect(addAlert({ q: 'de trop' }, 'de trop')).toBe('full')

    const [first, second] = alertsStore.get()
    const count = vi.fn(async (filters: { q?: string; publishedAfter?: string }) => {
      if (filters.q === 'produit 1') throw new Error('hors connexion')
      return filters.q === 'tecno' ? 2 : 0
    })
    // Vérifiées à la création : rien n’est dû avant 15 minutes.
    await checkAlerts(count)
    expect(count).not.toHaveBeenCalled()
    await checkAlerts(count, Date.now() + 16 * 60_000)
    expect(count).toHaveBeenCalledTimes(MAX_ALERTS)
    expect(count).toHaveBeenCalledWith({ q: 'tecno', maxPrice: 50000, publishedAfter: first.seenAt })
    expect(alertsStore.get().map((alert) => alert.newCount)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    // L’alerte en échec garde sa date de vérification : elle sera réessayée.
    expect(alertsStore.get()[1].checkedAt).toBe(second.checkedAt)
  })

  it('ne garde que des filtres d’alerte bien formés', () => {
    expect(readFilters({ q: 'tecno', maxPrice: '50000', city: 42, attributes: { ram_go: '4', 'mal-formé': 'x', double_sim: 1 }, inconnu: 'x' }))
      .toEqual({ q: 'tecno', attributes: { ram_go: '4' } })
  })
})
