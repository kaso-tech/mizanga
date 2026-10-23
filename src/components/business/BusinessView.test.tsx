import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthClient } from '../../services/authService'
import type { Business, Product, StockMovement } from '../../services/businessApi'
import { BusinessView } from './BusinessView'

const client: AuthClient = {
  getUser: async () => ({ id: 'u1', email: 'awa@example.bf' }),
  onChange: () => () => {},
  sendCode: async () => {},
  verifyCode: async () => {},
  signOut: async () => {},
  accessToken: async () => 'jeton',
}

/** Faux serveur Business en mémoire, qui applique les mêmes règles de stock que la base. */
function fakeBusinessServer() {
  let business: Business | null = null
  const products: Product[] = []
  const movements: Array<StockMovement & { productId: string }> = []
  const json = (status: number, body: unknown) => Promise.resolve(Response.json(body, { status }))
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer jeton')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    const path = url.replace('/api/business', '')
    if (path === '' && method === 'GET') return json(200, { businesses: business ? [business] : [] })
    if (path === '' && method === 'POST') {
      business = { id: 'b1', name: body.name, currency: 'XOF', countryCode: body.countryCode, timezone: 'Africa/Ouagadougou', role: 'owner' }
      return json(201, { business })
    }
    const productMatch = /^\/b1\/products(?:\/([^/?]+))?(?:\/movements)?/.exec(path)
    const productId = productMatch?.[1]
    if (path === '/b1/products' && method === 'GET') return json(200, { products: products.filter((product) => !product.archived) })
    if (path === '/b1/products' && method === 'POST') {
      const product: Product = { id: `p${products.length + 1}`, name: body.name, unit: body.unit, sku: null, quantity: body.initialQuantity, purchasePrice: body.purchasePrice, salePrice: body.salePrice, alertThreshold: body.alertThreshold, archived: false, updatedAt: new Date().toISOString() }
      products.push(product)
      if (body.initialQuantity > 0) movements.push({ id: `m${movements.length}`, productId: product.id, kind: 'initial', quantityDelta: body.initialQuantity, unitCost: body.purchasePrice, note: 'Stock initial', createdAt: new Date().toISOString(), createdBy: 'u1' })
      return json(201, { product })
    }
    const product = products.find((candidate) => candidate.id === productId)
    if (!product) return json(404, { error: 'Produit introuvable.' })
    if (path.endsWith('/movements') && method === 'GET') return json(200, { movements: movements.filter((movement) => movement.productId === product.id).reverse() })
    if (path.endsWith('/movements') && method === 'POST') {
      const delta = body.kind === 'loss' ? -body.quantity : body.quantity
      if (product.quantity + delta < 0) return json(409, { error: `Stock insuffisant : il reste ${product.quantity} ${product.unit}.` })
      product.quantity += delta
      const movement = { id: `m${movements.length}`, productId: product.id, kind: body.kind, quantityDelta: delta, unitCost: body.unitCost, note: body.note, createdAt: new Date().toISOString(), createdBy: 'u1' }
      movements.push(movement)
      return json(201, { movement })
    }
    if (method === 'PATCH') {
      Object.assign(product, body)
      return json(200, { product })
    }
    return json(404, { error: 'Introuvable.' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { products, movements, fetchMock }
}

afterEach(() => vi.unstubAllGlobals())

const renderView = (status: 'signedIn' | 'signedOut' = 'signedIn') => {
  const onSignIn = vi.fn()
  const onNotify = vi.fn()
  render(<BusinessView account={{ status, email: 'awa@example.bf' }} client={client} onSignIn={onSignIn} onNotify={onNotify} />)
  return { onSignIn, onNotify }
}

describe('espace Business', () => {
  it('invite à se connecter', async () => {
    const { onSignIn } = renderView('signedOut')
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect(onSignIn).toHaveBeenCalled()
  })

  it('crée le commerce, ajoute un produit puis met à jour son stock', async () => {
    const server = fakeBusinessServer()
    const { onNotify } = renderView()
    await userEvent.type(await screen.findByLabelText('Nom du commerce'), 'Boutique Awa')
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Boutique Awa' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Ajouter un produit/ }))
    const form = screen.getByRole('dialog', { name: 'Nouveau produit' })
    await userEvent.type(within(form).getByLabelText('Nom'), 'Riz 25 kg')
    await userEvent.clear(within(form).getByLabelText('Unité'))
    await userEvent.type(within(form).getByLabelText('Unité'), 'sac')
    await userEvent.type(within(form).getByLabelText('Prix d’achat'), '15 000')
    await userEvent.type(within(form).getByLabelText('Prix de vente'), '17 500')
    await userEvent.type(within(form).getByLabelText('Stock initial'), '2')
    await userEvent.type(within(form).getByLabelText('Seuil d’alerte'), '3')
    await userEvent.click(within(form).getByRole('button', { name: 'Ajouter le produit' }))
    expect(server.products[0]).toMatchObject({ name: 'Riz 25 kg', unit: 'sac', purchasePrice: 15000, salePrice: 17500, quantity: 2, alertThreshold: 3 })

    const card = (await screen.findByText('Riz 25 kg')).closest('li') as HTMLElement
    expect(within(card).getByText('Stock bas')).toBeInTheDocument()
    expect(onNotify).toHaveBeenCalledWith('Produit ajouté.', 'success')

    await userEvent.click(within(card).getByRole('button', { name: 'Mouvement de stock pour Riz 25 kg' }))
    const movement = screen.getByRole('dialog', { name: 'Stock : Riz 25 kg' })
    await userEvent.type(within(movement).getByLabelText('Quantité (sac)'), '2,5')
    await userEvent.click(within(movement).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(server.products[0].quantity).toBe(4.5))
    const updated = (await screen.findByText('Riz 25 kg')).closest('li') as HTMLElement
    await waitFor(() => expect(within(updated).queryByText('Stock bas')).not.toBeInTheDocument())
    expect(within(updated).getByText('4,5')).toBeInTheDocument()
  })

  it('corrige un stock après inventaire et affiche l’historique ; refuse un stock négatif', async () => {
    const server = fakeBusinessServer()
    server.products.push({ id: 'p1', name: 'Savon', unit: 'unité', sku: null, quantity: 10, purchasePrice: 250, salePrice: 300, alertThreshold: 0, archived: false, updatedAt: new Date().toISOString() })
    await fetch('/api/business', { method: 'POST', headers: { Authorization: 'Bearer jeton' }, body: JSON.stringify({ name: 'Boutique', countryCode: 'BF' }) })
    renderView()
    const card = (await screen.findByText('Savon')).closest('li') as HTMLElement

    await userEvent.click(within(card).getByRole('button', { name: 'Mouvement de stock pour Savon' }))
    let dialog = screen.getByRole('dialog', { name: 'Stock : Savon' })
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Inventaire' }))
    await userEvent.type(within(dialog).getByLabelText('Quantité comptée (unité)'), '8')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(server.products[0].quantity).toBe(8))
    expect(server.movements.at(-1)).toMatchObject({ kind: 'adjustment', quantityDelta: -2, note: 'Inventaire : 8 compté(s)' })

    await userEvent.click(within(card).getByRole('button', { name: 'Mouvement de stock pour Savon' }))
    dialog = screen.getByRole('dialog', { name: 'Stock : Savon' })
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Perte' }))
    await userEvent.type(within(dialog).getByLabelText('Quantité (unité)'), '50')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(await within(dialog).findByText('Stock insuffisant : il reste 8 unité.')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(within(card).getByRole('button', { name: 'Historique de Savon' }))
    const history = screen.getByRole('dialog', { name: 'Historique : Savon' })
    expect(await within(history).findByText('Correction d’inventaire')).toBeInTheDocument()
    expect(within(history).getByText('−2 unité')).toBeInTheDocument()
  })

  it('filtre les produits à réapprovisionner et la recherche', async () => {
    const server = fakeBusinessServer()
    await fetch('/api/business', { method: 'POST', headers: { Authorization: 'Bearer jeton' }, body: JSON.stringify({ name: 'Boutique', countryCode: 'BF' }) })
    const base = { sku: null, purchasePrice: 100, salePrice: 150, archived: false, updatedAt: new Date().toISOString() }
    server.products.push({ ...base, id: 'p1', name: 'Sucre', unit: 'kg', quantity: 0, alertThreshold: 2 }, { ...base, id: 'p2', name: 'Thé', unit: 'paquet', quantity: 20, alertThreshold: 5 })
    renderView()
    await screen.findByText('Sucre')
    expect(screen.getByText('Rupture')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /À réapprovisionner/ }))
    expect(screen.queryByText('Thé')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /À réapprovisionner/ }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un produit' }), 'thé')
    expect(screen.queryByText('Sucre')).not.toBeInTheDocument()
    expect(screen.getByText('Thé')).toBeInTheDocument()
  })

  it('présente les activités Commerce, Élevage et Agriculture', async () => {
    fakeBusinessServer()
    await fetch('/api/business', { method: 'POST', headers: { Authorization: 'Bearer jeton' }, body: JSON.stringify({ name: 'Ferme Awa', countryCode: 'BF' }) })
    renderView()
    const activities = await screen.findByRole('tablist', { name: 'Activités' })
    expect(within(activities).getByRole('tab', { name: 'Commerce' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('tab', { name: 'Produits' })).toBeVisible()

    await userEvent.click(within(activities).getByRole('tab', { name: 'Élevage' }))
    expect(screen.getByRole('tablist', { name: 'Sections de l’élevage' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Lots' })).toBeVisible()
    expect(screen.queryByRole('tab', { name: 'Produits' })).not.toBeInTheDocument()
    await userEvent.click(within(activities).getByRole('tab', { name: 'Agriculture' }))
    expect(screen.getByRole('heading', { name: 'Agriculture : bientôt disponible' })).toBeInTheDocument()
    await userEvent.click(within(activities).getByRole('tab', { name: 'Commerce' }))
    expect(screen.getByRole('tab', { name: 'Produits' })).toBeVisible()
  })
})
