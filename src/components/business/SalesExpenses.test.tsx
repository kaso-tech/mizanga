import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthClient } from '../../services/authService'
import type { Business, Expense, Product, Sale } from '../../services/businessApi'
import { BusinessView } from './BusinessView'

/** Texte sans espaces insécables, pour comparer les montants. */
const plain = (text: string | null) => (text ?? '').replace(/[\u00a0\u202f]/g, ' ')

const client: AuthClient = {
  getUser: async () => ({ id: 'u1', email: 'awa@example.bf' }),
  onChange: () => () => {},
  sendCode: async () => {},
  verifyCode: async () => {},
  signOut: async () => {},
  accessToken: async () => 'jeton',
}

/** Faux serveur : ventes, annulations et dépenses, avec les mêmes règles de calcul que la base. */
function fakeServer(role: Business['role'] = 'owner') {
  const business: Business = { id: 'b1', name: 'Boutique Awa', currency: 'XOF', countryCode: 'BF', timezone: 'Africa/Ouagadougou', role }
  const base = { sku: null, archived: false, updatedAt: new Date().toISOString() }
  const products: Product[] = [
    { ...base, id: 'p1', name: 'Riz 25 kg', unit: 'sac', quantity: 10, purchasePrice: 15000, salePrice: 17500, alertThreshold: 0 },
    { ...base, id: 'p2', name: 'Sucre', unit: 'kg', quantity: 4, purchasePrice: 600, salePrice: 750, alertThreshold: 0 },
  ]
  const sales: Sale[] = []
  const expenses: Expense[] = []
  const requests: string[] = []
  const payments: Array<Record<string, unknown>> = []
  const json = (status: number, body: unknown) => Promise.resolve(Response.json(body, { status }))
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    const path = url.replace('/api/business', '')
    requests.push(`${method} ${path}`)
    if (path === '') return json(200, { businesses: [business] })
    if (path === '/b1/products') return json(200, { products })
    if (path === '/b1/subscription') {
      return json(200, { subscription: {
        planId: 'test', planName: 'Gratuit', isTest: false, status: 'test', monthlyPrice: 0, currency: 'XOF', dailyAiRequests: 30, maxBusinesses: 1, maxListings: 5, maxPhotos: 3, activeListings: 2, currentPeriodEnd: null, aiUsedToday: 3,
        plans: [
          { id: 'test', name: 'Gratuit', monthlyPrice: 0, currency: 'XOF', dailyAiRequests: 30, maxBusinesses: 1, maxListings: 5, maxPhotos: 3 },
          { id: 'pro', name: 'Pro', monthlyPrice: 5000, currency: 'XOF', dailyAiRequests: 200, maxBusinesses: 3, maxListings: 100, maxPhotos: 5 },
        ],
        offers: [{ id: '7-jours', days: 7, price: 2000, currency: 'XOF' }],
        payment: { accountName: 'KasoTech', orangeMoney: '22670000001', moovMoney: '22660000002', instructions: '' },
        payments: payments.slice(),
        sponsorships: [],
      } })
    }
    if (path === '/b1/payments' && method === 'POST') {
      const payment = { id: `pay${payments.length + 1}`, ...body, amount: 5000 * body.months, currency: 'XOF', status: 'pending', adminNote: null, createdAt: new Date().toISOString() }
      payments.unshift(payment)
      return json(201, { payment })
    }
    if (path.startsWith('/b1/sales?')) return json(200, { sales: [...sales].reverse() })
    if (path === '/b1/sales' && method === 'POST') {
      const items = body.items.map((item: { productId: string; quantity: number; unitPrice: number }) => {
        const product = products.find((candidate) => candidate.id === item.productId) as Product
        return { product, item, lineTotal: Math.round(item.quantity * item.unitPrice), cost: Math.round(item.quantity * product.purchasePrice) }
      })
      for (const { product, item } of items) product.quantity -= item.quantity
      const sale: Sale = {
        id: `s${sales.length + 1}`, soldAt: new Date().toISOString(), status: 'completed', customerName: body.customerName, note: null,
        totalAmount: items.reduce((sum: number, line: { lineTotal: number }) => sum + line.lineTotal, 0),
        totalCost: items.reduce((sum: number, line: { cost: number }) => sum + line.cost, 0),
        items: items.map(({ product, item, lineTotal }: { product: Product; item: { quantity: number; unitPrice: number }; lineTotal: number }) => ({ productId: product.id, productName: product.name, unit: product.unit, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal })),
      }
      sales.push(sale)
      return json(201, { sale })
    }
    const cancel = /^\/b1\/sales\/(\w+)\/cancel$/.exec(path)
    if (cancel) {
      const sale = sales.find((candidate) => candidate.id === cancel[1]) as Sale
      sale.status = 'cancelled'
      for (const item of sale.items ?? []) (products.find((product) => product.id === item.productId) as Product).quantity += item.quantity
      return json(200, { sale })
    }
    if (path.startsWith('/b1/expenses?')) return json(200, { expenses })
    if (path === '/b1/expenses' && method === 'POST') {
      const expense: Expense = { id: `e${expenses.length + 1}`, amount: body.amount, category: body.category, description: body.description, spentAt: `${body.spentOn}T12:00:00Z`, createdBy: 'u1' }
      expenses.push(expense)
      return json(201, { expense })
    }
    if (path.startsWith('/b1/expenses/') && method === 'DELETE') {
      expenses.splice(expenses.findIndex((expense) => path.endsWith(expense.id)), 1)
      return json(200, { deleted: true })
    }
    if (path.startsWith('/b1/summary?')) {
      const done = sales.filter((sale) => sale.status === 'completed')
      const revenue = done.reduce((sum, sale) => sum + sale.totalAmount, 0)
      const cost = done.reduce((sum, sale) => sum + sale.totalCost, 0)
      const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0)
      return json(200, {
        summary: { revenue, costOfGoodsSold: cost, grossMargin: revenue - cost, expenses: spent, estimatedResult: revenue - cost - spent, salesCount: done.length, cancelledSalesCount: sales.length - done.length },
        products: revenue ? [{ productId: 'p1', productName: 'Riz 25 kg', unit: 'sac', quantity: 2, revenue: 34000, cost: 30000, grossMargin: 4000 }] : [],
      })
    }
    return json(404, { error: 'Introuvable.' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { products, sales, expenses, requests }
}

afterEach(() => vi.unstubAllGlobals())

const renderView = () => {
  const onNotify = vi.fn()
  render(<BusinessView account={{ status: 'signedIn', email: 'awa@example.bf' }} client={client} onSignIn={() => {}} onNotify={onNotify} />)
  return { onNotify }
}

/** Montant tel qu’affiché (espaces insécables du format français). */
const shown = (text: string) => (_: string, element: Element | null) => element?.textContent?.replace(/[\u00a0\u202f]/g, ' ') === text

describe('espace Business : ventes, dépenses et résultats', () => {
  it('enregistre une vente à prix négocié puis l’annule ; le stock suit', async () => {
    const server = fakeServer()
    const { onNotify } = renderView()
    await screen.findByText('Riz 25 kg')
    await userEvent.click(screen.getByRole('tab', { name: 'Ventes' }))
    expect(await screen.findByText('Aucune vente sur cette période.')).toBeInTheDocument()
    expect(server.requests.some((request) => /^GET \/b1\/sales\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/.test(request))).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: /Nouvelle vente/ }))
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle vente' })
    await userEvent.selectOptions(within(dialog).getByLabelText('Produit 1'), 'p1')
    expect(within(dialog).getByLabelText('Prix unitaire 1')).toHaveValue('17500')
    await userEvent.clear(within(dialog).getByLabelText('Quantité (sac) 1'))
    await userEvent.type(within(dialog).getByLabelText('Quantité (sac) 1'), '2')
    await userEvent.clear(within(dialog).getByLabelText('Prix unitaire 1'))
    await userEvent.type(within(dialog).getByLabelText('Prix unitaire 1'), '17 000')

    await userEvent.click(within(dialog).getByRole('button', { name: /Ajouter un produit/ }))
    await userEvent.selectOptions(within(dialog).getByLabelText('Produit 2'), 'p2')
    await userEvent.clear(within(dialog).getByLabelText('Quantité (kg) 2'))
    await userEvent.type(within(dialog).getByLabelText('Quantité (kg) 2'), '9')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la vente' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Stock insuffisant pour « Sucre » : il reste 4 kg.')

    await userEvent.clear(within(dialog).getByLabelText('Quantité (kg) 2'))
    await userEvent.type(within(dialog).getByLabelText('Quantité (kg) 2'), '0,5')
    expect(within(dialog).getByText(shown('Total : 34 375 F CFA'))).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Client (facultatif)'), 'Mariam')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la vente' }))

    await waitFor(() => expect(server.sales).toHaveLength(1))
    expect(server.sales[0]).toMatchObject({ totalAmount: 34375, totalCost: 30300, customerName: 'Mariam' })
    expect(server.products.map((product) => product.quantity)).toEqual([8, 3.5])
    expect(onNotify).toHaveBeenCalledWith('Vente enregistrée.', 'success')
    const list = await screen.findByRole('list', { name: 'Liste des ventes' })
    expect(within(list).getByText('Client : Mariam')).toBeInTheDocument()
    expect(within(list).getByText(shown('Marge : 4 075 F CFA'))).toBeInTheDocument()

    await userEvent.click(within(list).getByRole('button', { name: /Annuler la vente/ }))
    const confirm = screen.getByRole('dialog', { name: 'Annuler la vente' })
    await userEvent.type(within(confirm).getByLabelText('Motif (facultatif)'), 'Erreur de saisie')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Annuler la vente' }))
    expect(await screen.findByText('Annulée')).toBeInTheDocument()
    expect(server.products.map((product) => product.quantity)).toEqual([10, 4])
    expect(server.requests).toContain('POST /b1/sales/s1/cancel')
  })

  it('refuse deux lignes pour le même produit', async () => {
    fakeServer()
    renderView()
    await screen.findByText('Riz 25 kg')
    await userEvent.click(screen.getByRole('tab', { name: 'Ventes' }))
    await userEvent.click(await screen.findByRole('button', { name: /Nouvelle vente/ }))
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle vente' })
    await userEvent.selectOptions(within(dialog).getByLabelText('Produit 1'), 'p1')
    await userEvent.click(within(dialog).getByRole('button', { name: /Ajouter un produit/ }))
    await userEvent.selectOptions(within(dialog).getByLabelText('Produit 2'), 'p1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la vente' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Un même produit apparaît deux fois')
  })

  it('enregistre et supprime une dépense, et rappelle où vont les achats de marchandises', async () => {
    const server = fakeServer()
    renderView()
    await screen.findByText('Riz 25 kg')
    await userEvent.click(screen.getByRole('tab', { name: 'Dépenses' }))
    await userEvent.click(await screen.findByRole('button', { name: /Nouvelle dépense/ }))
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle dépense' })
    expect(within(dialog).getByText(/achats de marchandises s’enregistrent dans le stock/)).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Montant'), '6 500')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la dépense' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choisissez une catégorie.')
    await userEvent.selectOptions(within(dialog).getByLabelText('Catégorie'), 'Transport')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la dépense' }))
    await waitFor(() => expect(server.expenses).toHaveLength(1))
    expect(server.expenses[0]).toMatchObject({ amount: 6500, category: 'Transport', description: null })

    const list = await screen.findByRole('list', { name: 'Liste des dépenses' })
    await userEvent.click(within(list).getByRole('button', { name: /Supprimer la dépense Transport/ }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Supprimer la dépense' })).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText('Aucune dépense sur cette période.')).toBeInTheDocument()
  })

  it('affiche les résultats calculés par le serveur, avec la formule et l’avertissement', async () => {
    const server = fakeServer()
    server.sales.push({ id: 's1', soldAt: new Date().toISOString(), status: 'completed', totalAmount: 34000, totalCost: 30000, customerName: null, note: null })
    server.sales.push({ id: 's2', soldAt: new Date().toISOString(), status: 'cancelled', totalAmount: 5000, totalCost: 4000, customerName: null, note: null })
    server.expenses.push({ id: 'e1', amount: 6500, category: 'Loyer', description: null, spentAt: new Date().toISOString(), createdBy: 'u1' })
    renderView()
    await screen.findByText('Riz 25 kg')
    await userEvent.click(screen.getByRole('tab', { name: 'Résultats' }))
    const panel = await screen.findByRole('region', { name: 'Résultats' })
    const figures = (await within(panel).findByText('Coût des produits vendus')).closest('dl') as HTMLElement
    const value = (label: string) => within(figures).getByText(label).closest('div')?.querySelector('dd')?.textContent?.replace(/[\u00a0\u202f]/g, ' ')
    expect(value('Chiffre d’affaires')).toBe('34 000 F CFA')
    expect(value('Coût des produits vendus')).toBe('30 000 F CFA')
    expect(value('Marge brute (11,8 %)')).toBe('4 000 F CFA')
    expect(value('Dépenses')).toBe('6 500 F CFA')
    expect(value('Résultat estimé')).toBe('-2 500 F CFA')
    expect(within(panel).getByText(/1 vente, 1 annulée \(non comptée\)/)).toBeInTheDocument()
    expect(within(panel).getByText('Estimation à partir des données saisies ; ce n’est pas un résultat comptable ou fiscal certifié.')).toBeInTheDocument()
    expect(within(panel).getByRole('rowheader', { name: 'Riz 25 kg' })).toBeInTheDocument()

    await userEvent.selectOptions(within(panel).getByLabelText('Période'), 'lastMonth')
    await waitFor(() => expect(server.requests.filter((request) => request.startsWith('GET /b1/summary'))).toHaveLength(2))
    expect(server.requests.at(-1)).toMatch(/from=\d{4}-\d{2}-01&to=/)
  })

  it('montre la formule et ses limites, et déclare un paiement Mobile Money pour passer en Pro', async () => {
    const server = fakeServer()
    renderView()
    await screen.findByText('Riz 25 kg')
    await userEvent.click(screen.getByRole('button', { name: /Formule et limites/ }))
    const dialog = screen.getByRole('dialog', { name: 'Votre formule' })
    expect(await within(dialog).findByText(/Formule Gratuit/)).toBeInTheDocument()
    expect(within(dialog).getByText('2 sur 5')).toBeInTheDocument()
    expect(within(dialog).getByText('3 sur 30 aujourd’hui')).toBeInTheDocument()
    const pro = within(dialog).getByRole('region', { name: 'Formule Pro' })
    expect(pro).toHaveTextContent('100 annonces en ligne')
    expect(plain(pro.textContent)).toContain('5 000 F CFA par mois')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Passer à la formule Pro' }))
    await userEvent.selectOptions(within(dialog).getByLabelText('Durée'), '3')
    const steps = within(dialog).getByRole('list', { name: 'Étapes du paiement' })
    expect(plain(steps.textContent)).toContain('Envoyez 15 000 F CFA par Orange Money au +226 70 00 00 01 (KasoTech)')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Moov Money' }))
    expect(plain(steps.textContent)).toContain('par Moov Money au +226 60 00 00 02')
    await userEvent.type(within(dialog).getByLabelText('Numéro qui a payé'), '60 11 22 33')
    await userEvent.type(within(dialog).getByLabelText('Référence de la transaction (SMS)'), 'MP251027.0001')
    await userEvent.click(within(dialog).getByRole('button', { name: /déclarer le paiement/ }))
    expect(plain((await within(dialog).findByText(/en cours de vérification par l’équipe Gilli/)).textContent)).toContain('Paiement de 15 000 F CFA')
    expect(within(dialog).queryByRole('button', { name: 'Passer à la formule Pro' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('Mes paiements (1)')).toBeInTheDocument()
    expect(server.requests).toContain('POST /b1/payments')
  })

  it('n’offre ni annulation de vente ni suppression de dépense à un employé', async () => {
    const server = fakeServer('staff')
    server.sales.push({ id: 's1', soldAt: new Date().toISOString(), status: 'completed', totalAmount: 750, totalCost: 600, customerName: null, note: null, items: [] })
    server.expenses.push({ id: 'e1', amount: 1000, category: 'Transport', description: null, spentAt: new Date().toISOString(), createdBy: 'u1' })
    renderView()
    await screen.findByText('Riz 25 kg')
    await userEvent.click(screen.getByRole('tab', { name: 'Ventes' }))
    await screen.findByRole('list', { name: 'Liste des ventes' })
    expect(screen.queryByRole('button', { name: /Annuler la vente/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Dépenses' }))
    await screen.findByRole('list', { name: 'Liste des dépenses' })
    expect(screen.queryByRole('button', { name: /Supprimer la dépense/ })).not.toBeInTheDocument()
  })
})
