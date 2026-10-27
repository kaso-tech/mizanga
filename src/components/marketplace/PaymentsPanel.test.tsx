import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaymentsPanel } from './PaymentsPanel'

const payment = { id: 'pay1', kind: 'pro', months: 2, offerId: null, days: null, amount: 10000, currency: 'XOF', method: 'orange_money', payerPhone: '22670112233', reference: 'PP251027.1234', status: 'pending', adminNote: null, createdAt: '2026-10-27T08:00:00Z', decidedAt: null, businessId: 'b1', businessName: 'Awa Téléphones', listingTitle: null }
const pricing = {
  plans: [
    { id: 'test', name: 'Gratuit', monthlyPrice: 0, currency: 'XOF', dailyAiRequests: 30, maxBusinesses: 1, maxListings: 5, maxPhotos: 3 },
    { id: 'pro', name: 'Pro', monthlyPrice: 5000, currency: 'XOF', dailyAiRequests: 200, maxBusinesses: 3, maxListings: 100, maxPhotos: 5 },
  ],
  offers: [{ id: '7-jours', days: 7, price: 2000, currency: 'XOF', active: true }],
  settings: { accountName: '', orangeMoney: null, moovMoney: null, instructions: '' },
}

afterEach(() => vi.unstubAllGlobals())

function fakeServer() {
  const requests: Array<{ url: string; method: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url === '/api/admin/payments?status=pending') return Response.json({ payments: requests.some((request) => request.url === '/api/admin/payments/pay1') ? [] : [payment] })
    if (url.startsWith('/api/admin/payments?')) return Response.json({ payments: [] })
    if (url === '/api/admin/pricing') return Response.json({ pricing: init?.body ? JSON.parse(String(init.body)) : pricing })
    return Response.json({ ok: true })
  }))
  return requests
}

describe('paiements et tarifs (console)', () => {
  it('confirme un paiement déclaré après vérification', async () => {
    const requests = fakeServer()
    const onNotify = vi.fn()
    render(<PaymentsPanel onNotify={onNotify} />)
    const list = await screen.findByRole('list', { name: 'Paiements déclarés' })
    expect(list).toHaveTextContent('Formule Pro, 2 mois')
    expect(list).toHaveTextContent('Orange Money depuis le +226 70 11 22 33')
    expect(list).toHaveTextContent('PP251027.1234')
    await userEvent.click(within(list).getByRole('button', { name: 'Confirmer le paiement' }))
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('Paiement confirmé : l’achat est activé.', 'success'))
    expect(requests.find((request) => request.url === '/api/admin/payments/pay1')?.body).toEqual({ status: 'confirmed', note: '' })
    expect(await screen.findByText('Aucun paiement dans cette liste.')).toBeInTheDocument()
  })

  it('modifie les tarifs, les limites et les numéros de paiement', async () => {
    const requests = fakeServer()
    const onNotify = vi.fn()
    render(<PaymentsPanel onNotify={onNotify} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Tarifs' }))
    const form = await screen.findByRole('form', { name: 'Tarifs' })
    const price = within(form).getByLabelText('Prix par mois (F CFA)')
    await userEvent.clear(price)
    await userEvent.type(price, '7500')
    await userEvent.type(within(form).getByLabelText('Orange Money (indicatif compris)'), '22670000001')
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer les tarifs' }))
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('Tarifs enregistrés.', 'success'))
    const saved = requests.find((request) => request.method === 'PUT')?.body as typeof pricing
    expect(saved.plans.find((plan) => plan.id === 'pro')?.monthlyPrice).toBe(7500)
    expect(saved.settings.orangeMoney).toBe('22670000001')
  })
})
