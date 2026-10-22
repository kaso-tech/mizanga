import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketplaceView } from './MarketplaceView'

const catalog = {
  categories: [{ id: 'telephones', label: 'Téléphones et accessoires', subcategories: [{ id: 'smartphones', label: 'Smartphones' }], attributes: [{ key: 'ram_go', label: 'Mémoire vive (RAM)', type: 'number', unit: 'Go' }] }],
  conditions: { new: 'Neuf', used: 'Occasion', refurbished: 'Reconditionné' },
  reportReasons: ['forbidden', 'scam', 'counterfeit', 'wrong_info', 'other'],
}
const card = { id: 'l1', title: 'Tecno Spark 20', category: 'telephones', subcategory: 'smartphones', condition: 'new', attributes: { ram_go: 8 }, photo: '/photos/b1/a.png', price: 48000, currency: 'XOF', unit: 'pièce', city: 'Ouagadougou', sellerId: 'b1', sellerName: 'Awa Téléphones', sellerVerified: true, sameCity: true, deliversToCity: false, publishedAt: '2026-10-22T08:00:00Z' }
const detail = { ...card, description: 'Neuf, garantie 6 mois.', photos: ['/photos/b1/a.png'], inStock: true, seller: { id: 'b1', name: 'Awa Téléphones', city: 'Ouagadougou', whatsapp: '22670123456', phone: null, verified: true, deliversEverywhere: false, deliveryCities: ['Koudougou'], description: null } }

function fakeServer() {
  const requests: Array<{ url: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url === '/api/marketplace/categories') return Response.json(catalog)
    if (url.startsWith('/api/marketplace/search')) return Response.json({ total: 1, items: [card] })
    if (url === '/api/marketplace/listings/l1') return Response.json({ listing: detail })
    if (url === '/api/marketplace/listings/l1/report') return Response.json({ reported: true }, { status: 201 })
    if (url === '/api/marketplace/sellers/b1') return Response.json({ seller: detail.seller, listings: [card] })
    return Response.json({ error: 'Introuvable.' }, { status: 404 })
  }))
  return requests
}

beforeEach(() => { window.history.replaceState({}, '', '/marketplace') })
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
    expect(screen.getByText('1 annonce · d’abord à Ouagadougou')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Téléphones et accessoires' }))
    await waitFor(() => expect(window.location.search).toContain('category=telephones'))
    expect(screen.getByLabelText('Sous-catégorie')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: /Tecno Spark 20/ }))
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
})
