import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBusinessApi, type AssistantContext, type Business } from '../../services/businessApi'
import { AssistantPanel } from './AssistantPanel'

const business: Business = { id: 'b1', name: 'Boutique Awa', currency: 'XOF', countryCode: 'BF', timezone: 'Africa/Ouagadougou', role: 'owner' }
const summary = { revenue: 34375, costOfGoodsSold: 30300, grossMargin: 4075, expenses: 6500, estimatedResult: -2425, salesCount: 1, cancelledSalesCount: 0 }
const context: AssistantContext = {
  business: { name: 'Boutique Awa', currency: 'XOF', today: '2026-10-22' },
  periods: [{ key: 'today', label: 'Aujourd’hui', start: '2026-10-22', end: '2026-10-22', summary }],
  productSales: [],
  expensesByCategory: [{ category: 'Transport', amount: 6500 }],
  stock: { productCount: 2, value: 122100, listed: 2, products: [{ name: 'Riz 25 kg', unit: 'sac', quantity: 8, salePrice: 17500, purchasePrice: 15000, alertThreshold: 9, level: 'low' }] },
}
const resetsAt = '2026-10-23T00:00:00.000Z'

/** Réponse NDJSON diffusée ligne par ligne, comme le serveur. @param {unknown[]} lines */
const ndjson = (lines: unknown[]) => new Response(new ReadableStream({
  start(controller) {
    for (const line of lines) controller.enqueue(new TextEncoder().encode(`${JSON.stringify(line)}\n`))
    controller.close()
  },
}), { headers: { 'Content-Type': 'application/x-ndjson' } })

function fakeServer(limit = 50) {
  let used = 0
  const asked: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer jeton')
    if (url === '/api/business/b1/assistant' && (init?.method ?? 'GET') === 'GET') return Response.json({ quota: { used, limit, resetsAt } })
    asked.push(JSON.parse(String(init?.body)))
    if (used >= limit) return Response.json({ error: `Limite du jour atteinte (${limit} questions). Elle sera renouvelée demain.` }, { status: 429 })
    used += 1
    return ndjson([{ context, quota: { used, limit, resetsAt } }, { text: 'Votre marge brute du jour est de **4 075 F CFA**. ' }, { text: 'Pensez au riz.' }, { done: true, quota: { used, limit, resetsAt } }])
  }))
  return { asked }
}

afterEach(() => vi.unstubAllGlobals())

const renderPanel = () => render(<AssistantPanel api={createBusinessApi(async () => 'jeton')} business={business} />)

describe('assistant Business', () => {
  it('répond à une question suggérée, montre les chiffres utilisés et le nombre de questions restantes', async () => {
    const { asked } = fakeServer()
    renderPanel()
    expect(await screen.findByText('50 questions restantes aujourd’hui')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Comment se passent mes ventes ce mois-ci ?' }))
    expect(await screen.findByText(/Pensez au riz/)).toBeInTheDocument()
    expect(screen.getByText('4 075 F CFA', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('49 questions restantes aujourd’hui')).toBeInTheDocument()
    expect(asked).toEqual([{ messages: [{ role: 'user', content: 'Comment se passent mes ventes ce mois-ci ?' }] }])

    const details = screen.getByText('Chiffres utilisés par l’assistant').closest('details') as HTMLElement
    expect(within(details).getByRole('rowheader', { name: 'Aujourd’hui' })).toBeInTheDocument()
    expect(within(details).getByText(/À surveiller : Riz 25 kg \(8 sac\)/)).toBeInTheDocument()

    // La question suivante renvoie l’historique de la conversation.
    await userEvent.type(screen.getByLabelText('Votre question'), 'Et hier ?{Enter}')
    await waitFor(() => expect(asked).toHaveLength(2))
    expect(asked[1]).toEqual({ messages: [
      { role: 'user', content: 'Comment se passent mes ventes ce mois-ci ?' },
      { role: 'assistant', content: 'Votre marge brute du jour est de **4 075 F CFA**. Pensez au riz.' },
      { role: 'user', content: 'Et hier ?' },
    ] })
    await userEvent.click(await screen.findByRole('button', { name: /Nouvelle conversation/ }))
    expect(screen.getByRole('button', { name: 'Quels produits dois-je réapprovisionner ?' })).toBeInTheDocument()
  })

  it('explique la limite du jour et garde la question', async () => {
    fakeServer(1)
    renderPanel()
    await screen.findByText('1 question restante aujourd’hui')
    await userEvent.type(screen.getByLabelText('Votre question'), 'Première{Enter}')
    await screen.findByText(/Pensez au riz/)
    expect(screen.getByText('0 question restante aujourd’hui')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Envoyer la question' })).toBeDisabled()
  })

  it('affiche le refus du serveur sans perdre la question', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => (
      (init?.method ?? 'GET') === 'GET'
        ? Response.json({ quota: { used: 0, limit: 50, resetsAt } })
        : Response.json({ error: 'L’assistant n’est pas disponible : aucun moteur d’IA n’est configuré sur ce serveur.' }, { status: 503 })
    )))
    renderPanel()
    await userEvent.type(screen.getByLabelText('Votre question'), 'Mon stock ?{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('aucun moteur d’IA n’est configuré')
    expect(screen.getByLabelText('Votre question')).toHaveValue('Mon stock ?')
    expect(screen.queryByRole('list', { name: 'Conversation avec l’assistant' })).not.toBeInTheDocument()
  })
})
