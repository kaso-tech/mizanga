import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TermsView } from '../TermsView'
import { ModerationPanel } from './ModerationPanel'

const item = {
  id: 'l1', revision: 2, status: 'review', title: 'Pistolet d’alarme', description: 'Neuf', category: 'autres', subcategory: null, condition: 'new', attributes: {},
  photos: ['/photos/b1/a.png'], reasons: ['Mot lié à des produits interdits (armes, munitions ou explosifs) : « pistolet ».'], moderatedBy: 'auto', updatedAt: '2026-10-22T08:00:00Z',
  price: 15000, currency: 'XOF', businessId: 'b1', businessName: 'Boutique', seller: { name: 'Awa', city: 'Ouagadougou', whatsapp: '22670123456', phone: null, verified: false },
  reports: [{ reason: 'forbidden', details: 'Arme', createdAt: '2026-10-22T09:00:00Z' }],
}

afterEach(() => vi.unstubAllGlobals())

describe('modération de la marketplace (console)', () => {
  it('affiche les annonces à vérifier et envoie la décision avec la révision examinée', async () => {
    const requests: Array<{ url: string; body?: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.startsWith('/api/admin/moderation?status=review')) return Response.json({ listings: requests.filter((request) => request.url.includes('/moderation/l1')).length ? [] : [item] })
      if (url.startsWith('/api/admin/moderation?')) return Response.json({ listings: [] })
      return Response.json({ ok: true })
    }))
    const onNotify = vi.fn()
    render(<ModerationPanel onNotify={onNotify} />)
    const card = (await screen.findByText('Pistolet d’alarme')).closest('li') as HTMLElement
    expect(within(card).getByText(/« pistolet »/)).toBeInTheDocument()
    expect(within(card).getByText('Produit interdit : Arme')).toBeInTheDocument()
    expect(within(card).getByText(/WhatsApp \+226 70 12 34 56/)).toBeInTheDocument()
    await userEvent.type(within(card).getByLabelText(/Motif communiqué/), 'Arme')
    await userEvent.click(within(card).getByRole('button', { name: 'Refuser' }))
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('Annonce refusée.', 'success'))
    expect(requests.find((request) => request.url === '/api/admin/moderation/l1')?.body).toEqual({ revision: 2, status: 'rejected', reason: 'Arme' })
    expect(await screen.findByText('Aucune annonce dans cette liste.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Publiées' }))
    await waitFor(() => expect(requests.at(-1)?.url).toBe('/api/admin/moderation?status=published'))
  })

  it('modère les avis des clients signalés par le contrôle automatique', async () => {
    const review = { id: 'r1', revision: 1, rating: 1, comment: 'Appelez-moi au 70 11 22 33', status: 'review', reasons: ['Numéro de téléphone dans le commentaire.'], updatedAt: '2026-10-27T08:00:00Z', businessId: 'b1', sellerName: 'Awa Téléphones' }
    const requests: Array<{ url: string; body?: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.startsWith('/api/admin/moderation?')) return Response.json({ listings: [] })
      if (url === '/api/admin/reviews?status=review') return Response.json({ reviews: requests.some((request) => request.url === '/api/admin/reviews/r1') ? [] : [review] })
      if (url.startsWith('/api/admin/reviews?')) return Response.json({ reviews: [] })
      return Response.json({ ok: true })
    }))
    const onNotify = vi.fn()
    render(<ModerationPanel onNotify={onNotify} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Avis des clients' }))
    const list = await screen.findByRole('list', { name: 'Avis à modérer' })
    expect(list).toHaveTextContent('Awa Téléphones')
    expect(list).toHaveTextContent('Numéro de téléphone dans le commentaire.')
    expect(within(list).getByRole('img', { name: '1,0 sur 5' })).toBeInTheDocument()
    await userEvent.click(within(list).getByRole('button', { name: 'Masquer' }))
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('Avis masqué.', 'success'))
    expect(requests.find((request) => request.url === '/api/admin/reviews/r1')?.body).toEqual({ revision: 1, status: 'hidden' })
    expect(await screen.findByText('Aucun avis dans cette liste.')).toBeInTheDocument()
  })

  it('les conditions d’utilisation listent les produits interdits', () => {
    render(<TermsView />)
    for (const text of [/armes, munitions, explosifs/, /drogues et stupéfiants/, /médicaments/, /êtres humains, les organes/, /espèces animales et végétales protégées/]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })
})
