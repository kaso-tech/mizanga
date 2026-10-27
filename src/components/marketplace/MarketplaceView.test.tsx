import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alertsStore, compareStore, favoritesStore } from '../../app/marketSaved'
import { MarketplaceView } from './MarketplaceView'

/** Texte sans espaces insécables, pour comparer les montants. */
const plain = (text: string | null) => (text ?? '').replace(/[\u00a0\u202f]/g, ' ')

const catalog = {
  categories: [{ id: 'telephones', label: 'Téléphones et accessoires', subcategories: [{ id: 'smartphones', label: 'Smartphones' }], attributes: [{ key: 'ram_go', label: 'Mémoire vive (RAM)', type: 'number', unit: 'Go', better: 'higher' }, { key: 'double_sim', label: 'Double SIM', type: 'boolean' }] }],
  conditions: { new: 'Neuf', used: 'Occasion', refurbished: 'Reconditionné' },
  reportReasons: ['forbidden', 'scam', 'counterfeit', 'wrong_info', 'other'],
}
const card = { sellerRating: 4.5, sellerReviews: 2, id: 'l1', title: 'Tecno Spark 20', category: 'telephones', subcategory: 'smartphones', condition: 'new', attributes: { ram_go: 8 }, photo: '/photos/b1/a.png', price: 48000, currency: 'XOF', unit: 'pièce', city: 'Ouagadougou', sellerId: 'b1', sellerName: 'Awa Téléphones', sellerVerified: true, sameCity: true, deliversToCity: false, publishedAt: '2026-10-22T08:00:00Z' }
const stats = { rating: 4.5, reviewCount: 2, memberSince: '2026-10-01T00:00:00Z', activeListings: 3 }
const reviews = [{ id: 'r1', rating: 5, comment: 'Téléphone conforme, très bon accueil.', createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' }, { id: 'r2', rating: 4, comment: null, createdAt: '2026-10-21T00:00:00Z', updatedAt: '2026-10-21T00:00:00Z' }]
const detail = { ...card, description: 'Neuf, garantie 6 mois.', photos: ['/photos/b1/a.png'], inStock: true, seller: { id: 'b1', name: 'Awa Téléphones', city: 'Ouagadougou', whatsapp: '22670123456', phone: null, verified: true, deliversEverywhere: false, deliveryCities: ['Koudougou'], description: null, stats } }

const card2 = { ...card, id: 'l2', title: 'Itel A70', attributes: { ram_go: 3 }, price: 39000, sellerId: 'b2', sellerName: 'Ali Mobile', sellerVerified: false, city: 'Bobo-Dioulasso' }
const detail2 = { ...card2, description: '', photos: [], inStock: true, seller: { id: 'b2', name: 'Ali Mobile', city: 'Bobo-Dioulasso', whatsapp: null, phone: '22676000000', verified: false, deliversEverywhere: true, deliveryCities: [], description: null } }

function fakeServer({ total = 2, price = 48000, sponsored = [] as unknown[] }: { total?: number; price?: number; sponsored?: unknown[] } = {}) {
  const requests: Array<{ url: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url === '/api/marketplace/categories') return Response.json(catalog)
    if (url.startsWith('/api/marketplace/search')) return Response.json({ total, items: url.includes('page=2') ? [{ ...card, id: 'l3', title: 'Samsung A15' }] : [card, card2], sponsored: url.includes('page=2') ? [] : sponsored })
    if (url === '/api/marketplace/listings/l1') return Response.json({ listing: { ...detail, price } })
    if (url === '/api/marketplace/listings/l2') return Response.json({ listing: detail2 })
    if (url === '/api/marketplace/listings/l1/report') return Response.json({ reported: true }, { status: 201 })
    if (url === '/api/marketplace/sellers/b1') return Response.json({ seller: detail.seller, listings: [card], reviews })
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
    expect(await screen.findByRole('region', { name: 'Nouveautés' })).toHaveTextContent('Tecno Spark 20')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Que cherchez-vous ?' }), 'tecno')
    await userEvent.type(screen.getByLabelText('Ma ville'), 'Ouagadougou')
    await userEvent.type(screen.getByLabelText('Budget maximum'), '50 000')
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await waitFor(() => expect(requests.some((request) => request.url === '/api/marketplace/search?q=tecno&city=Ouagadougou&maxPrice=50000')).toBe(true))
    expect(window.location.search).toBe('?q=tecno&city=Ouagadougou&maxPrice=50000')
    expect(screen.getByText('2 annonces · d’abord à Ouagadougou')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Téléphones et accessoires' }))
    await waitFor(() => expect(window.location.search).toContain('category=telephones'))
    expect(screen.getByRole('navigation', { name: 'Sous-catégories' })).toHaveTextContent('Smartphones')
    expect(screen.getByRole('list', { name: 'Filtres actifs' })).toHaveTextContent('Téléphones et accessoires')

    await userEvent.click(within(screen.getByRole('list', { name: 'Annonces' })).getByRole('link', { name: /Tecno Spark 20/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Tecno Spark 20' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/marketplace/annonce/l1')
    const whatsapp = screen.getByRole('link', { name: /WhatsApp/ })
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/22670123456\?text=Bonjour/)
    expect(decodeURIComponent(whatsapp.getAttribute('href') ?? '')).toContain('« Tecno Spark 20 »')
    expect(screen.getByRole('link', { name: 'Appeler +226 70 12 34 56' })).toHaveAttribute('href', 'tel:+22670123456')
    expect(screen.getByText('Mémoire vive (RAM)').closest('div')).toHaveTextContent('8 Go')
    expect(screen.getByText(/livre aussi à Koudougou/)).toBeInTheDocument()
    expect(screen.getAllByText('Vendeur vérifié').length).toBeGreaterThan(0)
    // Annonces similaires (d’autres vendeurs de la même catégorie).
    expect(await screen.findByRole('region', { name: 'Annonces similaires' })).toHaveTextContent('Itel A70')

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
    window.history.replaceState({}, '', '/marketplace?sort=recent')
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
    window.history.replaceState({}, '', '/marketplace?sort=recent')
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
    window.history.replaceState({}, '', '/marketplace?sort=recent')
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

  it('propose de se connecter pour garder les alertes sur le compte et recevoir les notifications', async () => {
    fakeServer()
    const onSignIn = vi.fn()
    window.history.replaceState({}, '', '/marketplace/alertes')
    const { rerender } = render(<MarketplaceView onNotify={() => {}} account={{ signedIn: false, savedApi: null, onSignIn }} />)
    const panel = await screen.findByRole('region', { name: 'Notifications du téléphone' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Se connecter' }))
    expect(onSignIn).toHaveBeenCalled()
    // Connecté, sur un navigateur sans notifications (comme ici) : il le dit.
    rerender(<MarketplaceView onNotify={() => {}} account={{ signedIn: true, savedApi: null, onSignIn }} />)
    expect(await screen.findByText(/Ce navigateur ne permet pas les notifications/)).toBeInTheDocument()
  })

  it('montre la note et les statistiques du vendeur, ses avis, et laisse donner le sien', async () => {
    fakeServer()
    const onNotify = vi.fn()
    const savedApi = {
      myReview: vi.fn(async () => null),
      saveReview: vi.fn(async (_id: string, review: { rating: number; comment: string }) => ({ id: 'r3', ...review, status: 'review' as const, revision: 1, updatedAt: '2026-10-27T00:00:00Z' })),
      deleteReview: vi.fn(async () => ({})),
    }
    window.history.replaceState({}, '', '/marketplace/vendeur/b1')
    render(<MarketplaceView onNotify={onNotify} account={{ signedIn: true, savedApi: savedApi as never, onSignIn: () => {} }} />)
    const facts = await screen.findByRole('list', { name: 'Le vendeur en bref' })
    expect(facts).toHaveTextContent('4,5 · 2 avis')
    expect(facts).toHaveTextContent('Sur Gilli depuis oct. 2026')
    expect(facts).toHaveTextContent('3 annonces en ligne')
    expect(facts).toHaveTextContent('Identité vérifiée par Gilli')
    const list = screen.getByRole('list', { name: 'Avis' })
    expect(list).toHaveTextContent('Téléphone conforme, très bon accueil.')
    expect(within(list).getAllByText('Client Gilli')).toHaveLength(2)
    // La fiche d’annonce du vendeur montre aussi sa note.
    expect(screen.getByRole('list', { name: 'Annonces du vendeur' })).toHaveTextContent('4,5 (2 avis)')

    await userEvent.click(screen.getByRole('button', { name: 'Donner mon avis' }))
    const dialog = screen.getByRole('dialog', { name: 'Donner mon avis' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publier mon avis' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choisissez une note de 1 à 5 étoiles.')
    await userEvent.click(within(dialog).getByLabelText('4 étoiles : Bien'))
    await userEvent.type(within(dialog).getByLabelText('Commentaire (facultatif)'), 'Livraison rapide.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publier mon avis' }))
    await waitFor(() => expect(savedApi.saveReview).toHaveBeenCalledWith('b1', { rating: 4, comment: 'Livraison rapide.' }))
    expect(onNotify).toHaveBeenCalledWith('Merci : votre avis sera publié après vérification.', 'success')
    expect(await screen.findByText('Votre avis sera visible après vérification par l’équipe Gilli.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifier mon avis' })).toBeInTheDocument()
  })

  it('déconnecté : « Donner mon avis » propose de se connecter', async () => {
    fakeServer()
    const onSignIn = vi.fn()
    window.history.replaceState({}, '', '/marketplace/vendeur/b1')
    render(<MarketplaceView onNotify={() => {}} account={{ signedIn: false, savedApi: null, onSignIn }} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Donner mon avis' }))
    expect(onSignIn).toHaveBeenCalled()
  })

  it('présente les annonces sponsorisées à part, marquées « Sponsorisé », sans toucher aux résultats', async () => {
    fakeServer({ sponsored: [{ ...card2, id: 'l9', title: 'Infinix Hot 40' }] })
    window.history.replaceState({}, '', '/marketplace?sort=recent')
    render(<MarketplaceView onNotify={() => {}} />)
    const block = await screen.findByRole('region', { name: 'Annonces sponsorisées' })
    expect(block).toHaveTextContent('Infinix Hot 40')
    expect(within(block).getByText('Sponsorisé')).toBeInTheDocument()
    expect(block).toHaveTextContent('le classement des résultats n’en tient pas compte')
    expect(within(screen.getByRole('list', { name: 'Annonces' })).queryByText('Infinix Hot 40')).not.toBeInTheDocument()
  })

  it('vitrine : catégories en tuiles, rubriques et « Voir tout »', async () => {
    const requests = fakeServer({ sponsored: [{ ...card2, id: 'l9', title: 'Infinix Hot 40' }] })
    render(<MarketplaceView onNotify={() => {}} />)
    expect(await screen.findByRole('region', { name: 'Sponsorisé' })).toHaveTextContent('Infinix Hot 40')
    expect(screen.getByRole('region', { name: 'Vendeurs vérifiés' })).toHaveTextContent('Tecno Spark 20')
    expect(screen.getByRole('region', { name: 'Petits prix' })).toBeInTheDocument()
    await waitFor(() => expect(requests.map((request) => request.url)).toEqual(expect.arrayContaining(['/api/marketplace/search?verified=1', '/api/marketplace/search?sort=price_asc'])))
    await userEvent.click(within(screen.getByRole('region', { name: 'Petits prix' })).getByRole('button', { name: /Voir tout/ }))
    expect(window.location.search).toBe('?sort=price_asc')
    expect(await screen.findByRole('list', { name: 'Annonces' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Accueil de la marketplace/ }))
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Catégories' })).getByRole('button', { name: 'Téléphones et accessoires' }))
    expect(window.location.search).toBe('?category=telephones')
  })

  it('suggère les catégories et les recherches récentes ; affiche en liste ; retire un filtre d’un toucher', async () => {
    fakeServer()
    render(<MarketplaceView onNotify={() => {}} />)
    const box = await screen.findByRole('searchbox', { name: 'Que cherchez-vous ?' })
    await userEvent.type(box, 'smartph')
    await userEvent.click(within(screen.getByRole('list', { name: 'Catégories suggérées' })).getByRole('button', { name: /Téléphones et accessoires/ }))
    expect(window.location.search).toBe('?category=telephones')

    const search = await screen.findByRole('searchbox', { name: 'Que cherchez-vous ?' })
    await userEvent.type(search, 'tecno{Enter}')
    await waitFor(() => expect(window.location.search).toBe('?q=tecno&category=telephones'))
    expect(JSON.parse(localStorage.getItem('gilli.marketplace.recent') ?? '[]')).toEqual(['tecno'])
    await userEvent.clear(await screen.findByRole('searchbox', { name: 'Que cherchez-vous ?' }))
    expect(within(screen.getByRole('list', { name: 'Recherches récentes' })).getByRole('button', { name: /tecno/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Affichage en liste' }))
    expect(screen.getByRole('list', { name: 'Annonces' })).toHaveClass('market-list')
    expect(localStorage.getItem('gilli.marketplace.view')).toBe('list')

    await userEvent.click(within(screen.getByRole('list', { name: 'Filtres actifs' })).getByRole('button', { name: 'Retirer le filtre : « tecno »' }))
    expect(window.location.search).toBe('?category=telephones')
  })

  it('page annonce : galerie plein écran, partage et barre de contact fixée en bas', async () => {
    fakeServer()
    const onNotify = vi.fn()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    window.history.replaceState({}, '', '/marketplace/annonce/l1')
    render(<MarketplaceView onNotify={onNotify} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Tecno Spark 20' })).toBeInTheDocument()
    const bar = screen.getByRole('region', { name: 'Contacter le vendeur' })
    expect(within(bar).getByRole('link', { name: /WhatsApp/ })).toBeInTheDocument()
    expect(plain(bar.textContent)).toContain('48 000 F CFA')

    await userEvent.click(screen.getByRole('button', { name: 'Voir les photos en plein écran' }))
    const viewer = screen.getByRole('dialog', { name: 'Photos : Tecno Spark 20' })
    expect(within(viewer).getByRole('img', { name: 'Photo 1 sur 1' })).toHaveAttribute('src', '/photos/b1/a.png')
    await userEvent.click(within(viewer).getByRole('button', { name: 'Fermer' }))

    await userEvent.click(screen.getByRole('button', { name: 'Partager l’annonce' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/marketplace/annonce/l1')))
    expect(onNotify).toHaveBeenCalledWith('Lien de l’annonce copié.', 'success')
  })
})
