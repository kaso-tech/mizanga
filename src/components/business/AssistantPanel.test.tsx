import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBusinessApi, type AssistantContext, type Business, type Product } from '../../services/businessApi'
import { createConversationsApi } from '../../services/conversationsApi'
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

const products: Product[] = [{ id: 'p1', name: 'Riz 25 kg', unit: 'sac', sku: null, quantity: 8, purchasePrice: 15000, salePrice: 17500, alertThreshold: 9, archived: false, updatedAt: '2026-10-22T08:00:00Z' }]
const renderPanel = (props: { onDataChanged?: () => Promise<void> } = {}) => render(
  <AssistantPanel api={createBusinessApi(async () => 'jeton')} business={business} products={products} onDataChanged={props.onDataChanged ?? (async () => {})} onNotify={() => {}} />,
)

describe('assistant Business (présenté comme le chatbot)', () => {
  it('répond à une question suggérée avec les messages du chatbot, les chiffres utilisés et les questions restantes', async () => {
    const { asked } = fakeServer()
    renderPanel()
    expect(await screen.findByText(/50 questions restantes aujourd’hui/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Joindre une photo de produit' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /message vocal/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Comment se passent mes ventes ce mois-ci ?' }))
    const answer = await screen.findByRole('article', { name: 'Réponse de Gilli' })
    expect(await within(answer).findByText(/Pensez au riz/)).toBeInTheDocument()
    expect(await within(answer).findByText('4 075 F CFA')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Votre message' })).toHaveTextContent('Comment se passent mes ventes ce mois-ci ?')
    expect(within(answer).getByRole('button', { name: 'Copier' })).toBeInTheDocument()
    expect(within(answer).queryByRole('button', { name: 'Avis positif' })).not.toBeInTheDocument()
    expect(screen.getByText(/49 questions restantes aujourd’hui/)).toBeInTheDocument()
    expect(asked).toEqual([{ messages: [{ role: 'user', content: 'Comment se passent mes ventes ce mois-ci ?' }] }])

    const details = screen.getByText('Chiffres utilisés par l’assistant').closest('details') as HTMLElement
    expect(within(details).getByRole('rowheader', { name: 'Aujourd’hui' })).toBeInTheDocument()
    expect(within(details).getByText(/À surveiller : Riz 25 kg \(8 sac\)/)).toBeInTheDocument()

    // Question suivante dans la même zone de saisie que le chatbot : l’historique est renvoyé.
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre question' }), 'Et hier ?')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    await waitFor(() => expect(asked).toHaveLength(2))
    expect(asked[1]).toEqual({ messages: [
      { role: 'user', content: 'Comment se passent mes ventes ce mois-ci ?' },
      { role: 'assistant', content: 'Votre marge brute du jour est de **4 075 F CFA**. Pensez au riz.' },
      { role: 'user', content: 'Et hier ?' },
    ] })

    // Régénérer repose la dernière question sans la dupliquer.
    await userEvent.click(await screen.findByRole('button', { name: 'Régénérer' }))
    await waitFor(() => expect(asked).toHaveLength(3))
    expect(asked[2]).toEqual(asked[1])
    await userEvent.click(await screen.findByRole('button', { name: /Nouvelle conversation/ }))
    expect(screen.getByRole('button', { name: 'Quels produits dois-je réapprovisionner ?' })).toBeInTheDocument()
  })

  it('prépare des fiches à partir d’une photo ; rien n’est enregistré sans confirmation', async () => {
    const asked: Array<{ messages: Array<{ content: string; attachments?: unknown[] }> }> = []
    const writes: Array<{ url: string; body: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/business/b1/assistant' && method === 'GET') return Response.json({ quota: { used: 0, limit: 50, resetsAt } })
      if (url === '/api/business/b1/assistant') {
        asked.push(JSON.parse(String(init?.body)))
        return ndjson([
          { context, quota: { used: 1, limit: 50, resetsAt } },
          { proposals: [
            { id: 'f1', action: 'create_product', values: { name: 'Huile Dinor 5 L', unit: 'bidon', purchasePrice: 9000, salePrice: null, initialQuantity: 12, alertThreshold: null } },
            { id: 'f2', action: 'stock_movement', values: { productId: 'p1', productName: 'riz', kind: 'purchase', quantity: 5, unitCost: 14500, note: null } },
          ] },
          { done: true, quota: { used: 1, limit: 50, resetsAt } },
        ])
      }
      writes.push({ url, body: JSON.parse(String(init?.body)) })
      if (url === '/api/business/b1/products') return Response.json({ product: { ...products[0], id: 'p2', name: 'Huile Dinor 5 L' } }, { status: 201 })
      return Response.json({ error: 'Introuvable.' }, { status: 404 })
    }))
    const onDataChanged = vi.fn(async () => {})
    renderPanel({ onDataChanged })
    const photo = new File([new Uint8Array([255, 216, 255])], 'huile.jpg', { type: 'image/jpeg' })
    await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, photo)
    expect(await screen.findByText('huile.jpg')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre question' }), 'Enregistre cette huile, achat 9000, 12 bidons')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    const productCard = await screen.findByRole('form', { name: 'Fiche à vérifier : Nouveau produit' })
    expect(asked[0].messages[0].attachments).toEqual([{ name: 'huile.jpg', mimeType: 'image/jpeg', data: '/9j/' }])
    expect(screen.getByText('Voici la fiche à vérifier avant l’enregistrement.')).toBeInTheDocument()
    expect(within(productCard).getByLabelText('Nom')).toHaveValue('Huile Dinor 5 L')
    expect(within(productCard).getByLabelText(/Prix de vente/)).toHaveValue('')
    expect(writes).toEqual([])

    // Le commerçant complète le prix de vente, puis confirme.
    await userEvent.type(within(productCard).getByLabelText(/Prix de vente/), '10 500')
    await userEvent.click(within(productCard).getByRole('button', { name: 'Confirmer et enregistrer' }))
    expect(await within(productCard).findByText('Produit « Huile Dinor 5 L » enregistré.')).toBeInTheDocument()
    expect(writes).toEqual([{ url: '/api/business/b1/products', body: { name: 'Huile Dinor 5 L', unit: 'bidon', purchasePrice: 9000, salePrice: 10500, initialQuantity: 12, alertThreshold: 0 } }])
    expect(onDataChanged).toHaveBeenCalled()

    // La fiche de stock est ignorée : aucun enregistrement.
    const movementCard = screen.getByRole('form', { name: 'Fiche à vérifier : Mouvement de stock' })
    expect(within(movementCard).getByLabelText('Produit')).toHaveValue('p1')
    await userEvent.click(within(movementCard).getByRole('button', { name: 'Ignorer' }))
    expect(within(movementCard).getByText('Ignoré')).toBeInTheDocument()
    expect(writes).toHaveLength(1)

    // La question suivante dit au modèle ce qui a été confirmé ou ignoré.
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre question' }), 'Merci')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    await waitFor(() => expect(asked).toHaveLength(2))
    expect(asked[1].messages[1].content).toContain('[Fiche nouveau produit « Huile Dinor 5 L » : confirmée et enregistrée par le commerçant]')
    expect(asked[1].messages[1].content).toContain('[Fiche mouvement de stock pour « riz » : ignorée par le commerçant]')
    expect(asked[1].messages[0].attachments).toBeUndefined()
  })

  it('prépare une vente, une dépense et une annulation, enregistrées seulement après confirmation', async () => {
    const writes: Array<{ url: string; body: unknown }> = []
    const sale = { soldAt: '2026-10-22T06:30:00.000Z', totalAmount: 34000, status: 'completed', items: [{ productName: 'Riz 25 kg', quantity: 2, unit: 'sac' }] }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/business/b1/assistant' && method === 'GET') return Response.json({ quota: { used: 0, limit: 50, resetsAt } })
      if (url === '/api/business/b1/assistant') {
        return ndjson([
          { context, quota: { used: 1, limit: 50, resetsAt } },
          { text: 'Voici les fiches.' },
          { proposals: [
            { id: 's1', action: 'sale', values: { items: [{ productId: 'p1', productName: 'riz', quantity: 2, unitPrice: null }], customerName: 'Mariam', note: null } },
            { id: 'e1', action: 'expense', values: { amount: 5000, category: 'Abonnement Wi-Fi', description: null, spentOn: null } },
            { id: 'c1', action: 'cancel_sale', values: { saleId: 'v1', reference: 'ab12cd34', sale, reason: 'Erreur' } },
          ] },
          { done: true, quota: { used: 1, limit: 50, resetsAt } },
        ])
      }
      const body = init?.body ? JSON.parse(String(init.body)) : null
      writes.push({ url, body })
      if (url === '/api/business/b1/sales') return Response.json({ sale: { id: 'v2', soldAt: sale.soldAt, status: 'completed', totalAmount: 35000, totalCost: 30000, customerName: 'Mariam', note: null } }, { status: 201 })
      if (url === '/api/business/b1/expenses') return Response.json({ expense: { id: 'x1', amount: 5000, category: 'Abonnement Wi-Fi', description: null, spentAt: sale.soldAt, createdBy: 'u1' } }, { status: 201 })
      if (url === '/api/business/b1/sales/v1/cancel') return Response.json({ sale: { ...sale, id: 'v1', status: 'cancelled', totalCost: 30000, customerName: null, note: null } })
      return Response.json({ error: 'Introuvable.' }, { status: 404 })
    }))
    renderPanel()
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre question' }), 'Fais tout ça')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    // Vente : prix habituel du produit proposé, total calculé, stock vérifié avant l’envoi.
    const saleCard = await screen.findByRole('form', { name: 'Fiche à vérifier : Vente' })
    expect(within(saleCard).getByLabelText('Prix unitaire 1')).toHaveValue('17500')
    expect(within(saleCard).getByText('35 000 F CFA')).toBeInTheDocument()
    await userEvent.clear(within(saleCard).getByLabelText('Quantité (sac) 1'))
    await userEvent.type(within(saleCard).getByLabelText('Quantité (sac) 1'), '20')
    await userEvent.click(within(saleCard).getByRole('button', { name: 'Confirmer et enregistrer' }))
    expect(within(saleCard).getByRole('alert')).toHaveTextContent('Stock insuffisant pour « Riz 25 kg » : il reste 8 sac.')
    expect(writes).toEqual([])
    await userEvent.clear(within(saleCard).getByLabelText('Quantité (sac) 1'))
    await userEvent.type(within(saleCard).getByLabelText('Quantité (sac) 1'), '2')
    await userEvent.click(within(saleCard).getByRole('button', { name: 'Confirmer et enregistrer' }))
    expect(await within(saleCard).findByText('Vente de 35 000 F CFA enregistrée.')).toBeInTheDocument()
    expect(writes[0]).toEqual({ url: '/api/business/b1/sales', body: { items: [{ productId: 'p1', quantity: 2, unitPrice: 17500 }], customerName: 'Mariam', note: null } })

    // Dépense : catégorie et date du jour proposées.
    const expenseCard = screen.getByRole('form', { name: 'Fiche à vérifier : Dépense' })
    expect(within(expenseCard).getByLabelText('Catégorie')).toHaveValue('Abonnement Wi-Fi')
    await userEvent.click(within(expenseCard).getByRole('button', { name: 'Confirmer et enregistrer' }))
    expect(await within(expenseCard).findByText('Dépense de 5 000 F CFA enregistrée (Abonnement Wi-Fi).')).toBeInTheDocument()
    expect(writes[1]).toMatchObject({ url: '/api/business/b1/expenses', body: { amount: 5000, category: 'Abonnement Wi-Fi', spentOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } })

    // Annulation : résumé de la vente visé, confirmation explicite.
    const cancelCard = screen.getByRole('form', { name: 'Fiche à vérifier : Annulation de vente' })
    expect(within(cancelCard).getByText('34 000 F CFA')).toBeInTheDocument()
    await userEvent.click(within(cancelCard).getByRole('button', { name: 'Confirmer l’annulation' }))
    expect(await within(cancelCard).findByText('Vente annulée, stock rétabli.')).toBeInTheDocument()
    expect(writes[2]).toEqual({ url: '/api/business/b1/sales/v1/cancel', body: { reason: 'Erreur' } })
  })

  it('ne propose pas à un employé de confirmer une annulation', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (
      (init?.method ?? 'GET') === 'GET'
        ? Response.json({ quota: { used: 0, limit: 50, resetsAt } })
        : ndjson([{ context, quota: { used: 1, limit: 50, resetsAt } }, { proposals: [{ id: 'c1', action: 'cancel_sale', values: { saleId: 'v1', reference: 'ab12cd34', sale: { soldAt: '2026-10-22T06:30:00.000Z', totalAmount: 34000, status: 'completed', items: [] }, reason: null } }] }, { done: true, quota: { used: 1, limit: 50, resetsAt } }])
    )))
    render(<AssistantPanel api={createBusinessApi(async () => 'jeton')} business={{ ...business, role: 'staff' }} products={products} onDataChanged={async () => {}} onNotify={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre question' }), 'Annule la vente')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    const card = await screen.findByRole('form', { name: 'Fiche à vérifier : Annulation de vente' })
    expect(within(card).getByText('Seul le propriétaire peut annuler une vente.')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Confirmer l’annulation' })).toBeDisabled()
  })

  it('affiche la limite du jour', async () => {
    fakeServer(1)
    renderPanel()
    await screen.findByText(/1 question restante aujourd’hui/)
    await userEvent.click(screen.getByRole('button', { name: 'Où partent mes dépenses ?' }))
    await screen.findByText(/Pensez au riz/)
    expect(screen.getByText(/0 question restante aujourd’hui/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Votre question' })).toHaveAttribute('placeholder', 'Limite du jour atteinte : revenez demain.')
  })

  it('affiche le refus du serveur comme le chatbot, avec « Réessayer »', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => (
      (init?.method ?? 'GET') === 'GET'
        ? Response.json({ quota: { used: 0, limit: 50, resetsAt } })
        : Response.json({ error: 'L’assistant n’est pas disponible : aucun moteur d’IA n’est configuré sur ce serveur.' }, { status: 503 })
    )))
    renderPanel()
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre question' }), 'Mon stock ?')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('aucun moteur d’IA n’est configuré')
    expect(screen.getByRole('article', { name: 'Votre message' })).toHaveTextContent('Mon stock ?')
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument()
  })

  it('enregistre la conversation sur le compte avec ses fiches, puis la rouvre depuis le menu latéral', async () => {
    const saved = new Map<string, Record<string, unknown>>()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/business/b1/assistant' && method === 'GET') return Response.json({ quota: { used: 0, limit: 50, resetsAt } })
      if (url === '/api/business/b1/assistant') {
        return ndjson([
          { context, quota: { used: 1, limit: 50, resetsAt } },
          { proposals: [{ id: 'f1', action: 'expense', values: { amount: 2500, category: 'Transport', description: 'Taxi-moto', spentOn: null } }] },
          { done: true, quota: { used: 1, limit: 50, resetsAt } },
        ])
      }
      const id = decodeURIComponent(url.replace('/api/conversations/', ''))
      if (method === 'PUT') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        saved.set(id, { ...saved.get(id), ...body, id })
        return Response.json({ conversation: { id, kind: body.kind, businessId: body.businessId, title: saved.get(id)?.title ?? null, favorite: false, createdAt: body.createdAt, updatedAt: body.updatedAt } })
      }
      if (method === 'GET' && saved.has(id)) return Response.json({ conversation: saved.get(id) })
      return Response.json({ error: 'Introuvable.' }, { status: 404 })
    }))
    const conversations = createConversationsApi(async () => 'jeton')
    const onConversationSaved = vi.fn()
    const view = render(<AssistantPanel api={createBusinessApi(async () => 'jeton')} business={business} products={products} onDataChanged={async () => {}} onNotify={() => {}} conversations={conversations} onConversationSaved={onConversationSaved} />)
    expect(await screen.findByText(/conversation enregistrée sur votre compte/)).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre question' }), 'J’ai payé 2500 de taxi-moto')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    const card = await screen.findByRole('form', { name: 'Fiche à vérifier : Dépense' })
    await userEvent.click(within(card).getByRole('button', { name: 'Ignorer' }))

    await waitFor(() => expect(onConversationSaved).toHaveBeenCalled())
    await waitFor(() => {
      const [stored] = [...saved.values()] as Array<{ messages: Array<{ proposals?: Array<{ status: string }> }> }>
      expect(stored.messages[1].proposals?.[0].status).toBe('dismissed')
    })
    const [stored] = [...saved.values()] as Array<{ id: string; messages: Array<{ context: AssistantContext }> }>
    expect(stored).toMatchObject({ kind: 'commerce', businessId: 'b1', title: 'J’ai payé 2500 de taxi-moto' })
    expect(stored.id).toMatch(/^commerce-/)
    expect(stored.messages[1].context.business.name).toBe('Boutique Awa')
    expect(onConversationSaved.mock.calls.at(-1)?.[0]).toMatchObject({ id: stored.id, kind: 'commerce' })
    view.unmount()

    // Rouverte depuis le menu latéral : messages, fiche ignorée et chiffres utilisés reviennent.
    render(<AssistantPanel api={createBusinessApi(async () => 'jeton')} business={business} products={products} onDataChanged={async () => {}} onNotify={() => {}} conversations={conversations} openRequest={{ id: stored.id, nonce: 1 }} />)
    expect(await screen.findByRole('article', { name: 'Votre message' })).toHaveTextContent('J’ai payé 2500 de taxi-moto')
    expect(screen.getByText('Ignoré')).toBeInTheDocument()
    expect(screen.getByText('Chiffres utilisés par l’assistant')).toBeInTheDocument()
  })
})
