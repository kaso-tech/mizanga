import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alertsStore, compareStore, favoritesStore } from '../../app/marketSaved'
import { MarketplaceView } from './MarketplaceView'

const catalog = {
  categories: [{ id: 'telephones', label: 'Téléphones et accessoires', subcategories: [{ id: 'smartphones', label: 'Smartphones' }], attributes: [{ key: 'ram_go', label: 'Mémoire vive (RAM)', type: 'number', unit: 'Go', better: 'higher' }, { key: 'double_sim', label: 'Double SIM', type: 'boolean' }] }],
  conditions: { new: 'Neuf', used: 'Occasion', refurbished: 'Reconditionné' },
  reportReasons: ['forbidden', 'scam', 'counterfeit', 'wrong_info', 'other'],
}
const card = { id: 'l1', title: 'Tecno Spark 20', category: 'telephones', subcategory: 'smartphones', condition: 'new', attributes: { ram_go: 8 }, photo: '/photos/b1/a.png', price: 48000, currency: 'XOF', unit: 'pièce', city: 'Ouagadougou', sellerId: 'b1', sellerName: 'Awa Téléphones', sellerVerified: true, sameCity: true, deliversToCity: false, publishedAt: '2026-10-22T08:00:00Z' }
const detail = { ...card, description: 'Neuf, garantie 6 mois.', photos: ['/photos/b1/a.png'], inStock: true, seller: { id: 'b1', name: 'Awa Téléphones', city: 'Ouagadougou', whatsapp: '22670123456', phone: null, verified: true, deliversEverywhere: false, deliveryCities: ['Koudougou'], description: null } }

const card2 = { ...card, id: 'l2', title: 'Itel A70', attributes: { ram_go: 3 }, price: 39000, sellerId: 'b2', sellerName: 'Ali Mobile', sellerVerified: false, city: 'Bobo-Dioulasso' }
const detail2 = { ...card2, description: '', photos: [], inStock: true, seller: { id: 'b2', name: 'Ali Mobile', city: 'Bobo-Dioulasso', whatsapp: null, phone: '22676000000', verified: false, deliversEverywhere: true, deliveryCities: [], description: null } }

function fakeServer({ total = 2, price = 48000 }: { total?: number; price?: number } = {}) {
  const requests: Array<{ url: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url === '/api/marketplace/categories') return Response.json(catalog)
    if (url.startsWith('/api/marketplace/search')) return Response.json({ total, items: url.includes('page=2') ? [{ ...card, id: 'l3', title: 'Samsung A15' }] : [card, card2] })
    if (url === '/api/marketplace/listings/l1') return Response.json({ listing: { ...detail, price } })
    if (url === '/api/marketplace/listings/l2') return Response.json({ listing: detail2 })
    if (url === '/api/marketplace/listings/l1/report') return Response.json({ reported: true }, { status: 201 })
    if (url === '/api/marketplace/sellers/b1') return Response.json({ seller: detail.seller, listings: [card] })
    return Response.json({ error: 'Introuvable.' }, { status: 404 })
  }))
  return requests
}

beforeEach(() => {
  window.history.replaceState({}, '', '/marketplace')
  localStorage.clear()
  for (const store of [favoritesStore, compareStore, alertsStore]) store.reset()
})
afterEach(() => vi.unstubAllGlobals())

describe('marketplace publique', () => {
  it('recherche avec ville et budget, met l’adresse à jour et ouvre une annonce', async () => {
    const requests = fakeServer()
    const onNotify = vi.fn()
    render(<MarketplaceView onNotify={onNotify} />)
    expect(await screen.findByText('Tecno Spark 20')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Que cherchez-vous ?' }), 'tecno')
    await userEvent.type(screen.getByLabelText('Ma ville'), 'Ouagadougou')
    await userEvent.type(screen.getByLabelText('Budget maximum'), '50 000')
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await waitFor(() => expect(requests.some((request) => request.url === '/api/marketplace/search?q=tecno&city=Ouagadougou&maxPrice=50000')).toBe(true))
    expect(window.location.search).toBe('?q=tecno&city=Ouagadougou&maxPrice=50000')
    expect(screen.getByText('2 annonces · d’abord à Ouagadougou')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Téléphones et accessoires' }))
    await waitFor(() => expect(window.location.search).toContain('category=telephones'))
    expect(screen.getByLabelText('Sous-catégorie')).toBeInTheDocument()

    await userEvent.click(within(screen.getByRole('list', { name: 'Annonces' })).getByRole('link', { name: /Tecno Spark 20/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Tecno Spark 20' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/marketplace/annonce/l1')
    const whatsapp = screen.getByRole('link', { name: /WhatsApp/ })
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/22670123456\?text=Bonjour/)
    expect(decodeURIComponent(whatsapp.getAttribute('href') ?? '')).toContain('« Tecno Spark 20 »')
    expect(screen.getByRole('link', { name: 'Appeler +226 70 12 34 56' })).toHaveAttribute('href', 'tel:+22670123456')
    expect(screen.getByText('Mémoire vive (RAM)').closest('div')).toHaveTextContent('8 Go')
    expect(screen.getByText(/livre aussi à Koudougou/)).toBeInTheDocument()
    expect(screen.getByText('Vendeur vérifié')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Signaler l’annonce' }))
    const dialog = screen.getByRole('dialog', { name: 'Signaler l’annonce' })
    await userEvent.selectOptions(within(dialog).getByLabelText('Motif'), 'scam')
    await userEvent.type(within(dialog).getByLabelText('Précision (facultatif)'), 'Prix trop bas')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Envoyer le signalement' }))
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('Merci : votre signalement a été transmis.', 'success'))
    expect(requests.find((request) => request.url.endsWith('/report'))?.body).toEqual({ reason: 'scam', details: 'Prix trop bas' })

    await userEvent.click(screen.getByRole('button', { name: /Awa Téléphones/ }))
    expect(await screen.findByRole('list', { name: 'Annonces du vendeur' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/marketplace/vendeur/b1')
  })

  it('ouvre directement une annonce depuis un lien partagé, et revient à l’accueil', async () => {
    fakeServer()
    window.history.replaceState({}, '', '/marketplace/annonce/l1')
    render(<MarketplaceView onNotify={() => {}} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Tecno Spark 20' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Marketplace' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/marketplace')
  })

  it('trie, filtre par caractéristiques et vendeurs vérifiés, et charge la suite', async () => {
    const requests = fakeServer({ total: 30 })
    render(<MarketplaceView onNotify={() => {}} />)
    await screen.findByText('Tecno Spark 20')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Trier' }), 'price_asc')
    await waitFor(() => expect(window.location.search).toBe('?sort=price_asc'))
    await userEvent.click(screen.getByRole('button', { name: 'Téléphones et accessoires' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Filtres' }))
    const panel = screen.getByRole('form', { name: 'Filtres' })
    await userEvent.type(within(panel).getByLabelText('Mémoire vive (RAM) minimum (Go)'), '4')
    await userEvent.click(within(panel).getByLabelText('Double SIM'))
    await userEvent.click(within(panel).getByLabelText('Vendeurs vérifiés seulement'))
    await userEvent.click(within(panel).getByRole('button', { name: 'Appliquer' }))
    await waitFor(() => expect(requests.at(-1)?.url).toBe('/api/marketplace/search?category=telephones&sort=price_asc&verified=1&a_ram_go=4&a_double_sim=1'))
    expect(window.location.search).toBe('?category=telephones&sort=price_asc&verified=1&a_ram_go=4&a_double_sim=1')
    expect(await screen.findByRole('button', { name: 'Filtres (3)' })).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Voir plus d’annonces (28 de plus)' }))
    expect(await screen.findByText('Samsung A15')).toBeInTheDocument()
    expect(requests.at(-1)?.url).toContain('page=2')
  })

  it('garde les favoris sur l’appareil et signale un prix qui a baissé', async () => {
    fakeServer({ price: 45000 })
    const onNotify = vi.fn()
    render(<MarketplaceView onNotify={onNotify} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter aux favoris : Tecno Spark 20' }))
    expect(onNotify).toHaveBeenCalledWith('Ajouté à vos favoris.', 'success')
    expect(screen.getByRole('button', { name: 'Retirer des favoris : Tecno Spark 20' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('gilli.marketplace.favorites') ?? '[]')[0]).toMatchObject({ id: 'l1', price: 48000 })

    await userEvent.click(screen.getByRole('tab', { name: /Favoris/ }))
    expect(window.location.pathname).toBe('/marketplace/favoris')
    const favorites = screen.getByRole('list', { name: 'Favoris' })
    expect(await within(favorites).findByText(/Prix baissé/)).toBeInTheDocument()
    expect(favorites).toHaveTextContent('45 000')
    await userEvent.click(within(favorites).getByRole('button', { name: 'Retirer des favoris : Tecno Spark 20' }))
    expect(screen.getByText(/Aucun favori pour l’instant/)).toBeInTheDocument()
  })

  it('compare 2 annonces : le moins cher et la meilleure caractéristique sont indiqués', async () => {
    fakeServer()
    const onNotify = vi.fn()
    render(<MarketplaceView onNotify={onNotify} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Comparer : Tecno Spark 20' }))
    const bar = screen.getByRole('region', { name: 'Comparaison' })
    expect(within(bar).getByRole('button', { name: 'Comparer' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Comparer : Itel A70' }))
    expect(bar).toHaveTextContent('2 / 3 à comparer')
    await userEvent.click(within(bar).getByRole('button', { name: 'Comparer' }))
    expect(window.location.pathname + window.location.search).toBe('/marketplace/comparer?ids=l1,l2')
    const table = await screen.findByRole('table')
    const row = (name: string) => within(table).getByRole('row', { name: new RegExp(`^${name}`) })
    expect(row('Prix').querySelectorAll('td')[1]).toHaveTextContent('Le moins cher')
    expect(row('Prix').querySelectorAll('td')[0]).not.toHaveTextContent('Le moins cher')
    expect(row('Mémoire vive').querySelectorAll('td')[0]).toHaveTextContent('8 GoLe plus élevé')
    expect(row('Vendeur').querySelectorAll('td')[0]).toHaveTextContent('Vérifié')
    expect(row('Ville').querySelectorAll('td')[1]).toHaveTextContent('livre partout')

    await userEvent.click(within(table).getByRole('button', { name: 'Retirer de la comparaison : Itel A70' }))
    expect(window.location.search).toBe('?ids=l1')
    expect(await screen.findByText(/Choisissez au moins 2 annonces/)).toBeInTheDocument()
  })

  it('crée une alerte pour une recherche et la rouvre avec les nouveautés', async () => {
    const requests = fakeServer()
    const onNotify = vi.fn()
    window.history.replaceState({}, '', '/marketplace?q=tecno&maxPrice=50000')
    render(<MarketplaceView onNotify={onNotify} />)
    await screen.findByText('Tecno Spark 20')
    await userEvent.click(screen.getByRole('button', { name: 'Créer une alerte' }))
    expect(onNotify).toHaveBeenCalledWith('Alerte créée : les nouvelles annonces vous seront signalées dans l’onglet Alertes.', 'success')
    await userEvent.click(screen.getByRole('button', { name: 'Créer une alerte' }))
    expect(onNotify).toHaveBeenLastCalledWith('Vous suivez déjà cette recherche.', 'info')

    // Une annonce publiée depuis : l’alerte l’indique.
    alertsStore.set(alertsStore.get().map((alert) => ({ ...alert, seenAt: '2026-10-21T00:00:00.000Z', newCount: 1 })))
    await userEvent.click(screen.getByRole('tab', { name: /Alertes/ }))
    const alerts = screen.getByRole('list', { name: 'Alertes' })
    await userEvent.click(within(alerts).getByRole('button', { name: /tecno · ≤ 50 000 F.*1 nouvelle annonce/ }))
    await waitFor(() => expect(requests.at(-1)?.url).toBe('/api/marketplace/search?q=tecno&maxPrice=50000&sort=recent'))
    expect(await screen.findAllByText('Nouveau')).toHaveLength(2)
    expect(alertsStore.get()[0].newCount).toBe(0)
  })
})
