import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OwnListing, Product } from '../../services/businessApi'
import { ListingDialog } from './ListingDialog'
import { SellerProfileDialog } from './SellerProfileDialog'

const product: Product = { id: 'p1', name: 'Tecno Spark 20', unit: 'pièce', sku: null, quantity: 3, purchasePrice: 40000, salePrice: 48000, alertThreshold: 1, archived: false, updatedAt: '2026-10-22T08:00:00Z' }
const catalog = {
  categories: [{ id: 'telephones', label: 'Téléphones et accessoires', subcategories: [{ id: 'smartphones', label: 'Smartphones' }], attributes: [
    { key: 'ram_go', label: 'Mémoire vive (RAM)', type: 'number', unit: 'Go' }, { key: 'reseau', label: 'Réseau', type: 'select', options: ['4G', '5G'] }, { key: 'double_sim', label: 'Double SIM', type: 'boolean' },
  ] }],
  conditions: { new: 'Neuf', used: 'Occasion', refurbished: 'Reconditionné' },
  reportReasons: [],
}

afterEach(() => vi.unstubAllGlobals())

describe('publication sur la marketplace (vendeur)', () => {
  it('prépare l’annonce : catégorie, caractéristiques, photo ; prix et stock suivent le produit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(catalog)))
    const onSubmit = vi.fn(async () => {})
    render(<ListingDialog product={product} listing={null} currency="XOF" onSubmit={onSubmit} onClose={() => {}} />)
    expect(screen.getByText(/Prix affiché/)).toHaveTextContent('48 000 F CFA')
    expect(screen.getByLabelText('Titre de l’annonce')).toHaveValue('Tecno Spark 20')
    await userEvent.click(screen.getByRole('button', { name: 'Publier' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choisissez une catégorie.')

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /^Catégorie/ }), 'telephones')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Sous-catégorie/ }), 'smartphones')
    await userEvent.type(screen.getByLabelText('Mémoire vive (RAM) (Go)'), '8')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Réseau/ }), '4G')
    await userEvent.click(screen.getByLabelText('Double SIM'))
    await userEvent.type(screen.getByLabelText('Description'), 'Neuf, garantie 6 mois.')
    const photo = new File([new Uint8Array([137, 80, 78, 71])], 'tel.png', { type: 'image/png' })
    await userEvent.upload(document.querySelector('.listing-photos input[type="file"]') as HTMLInputElement, photo)
    await waitFor(() => expect(screen.getByText('Photos (1/5)')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Publier' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0]).toEqual([{
      productId: 'p1', title: 'Tecno Spark 20', description: 'Neuf, garantie 6 mois.', category: 'telephones', subcategory: 'smartphones', condition: 'new',
      attributes: { ram_go: 8, reseau: '4G', double_sim: true }, keepPhotos: [], newPhotos: [{ mimeType: 'image/png', data: 'iVBORw==' }],
    }])
  })

  it('montre l’état d’une annonce en vérification et permet de la retirer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(catalog)))
    const listing: OwnListing = { id: 'l1', productId: 'p1', title: 'Tecno', description: '', category: 'telephones', subcategory: null, condition: 'new', attributes: {}, photos: [{ path: 'b1/x.png', url: '/photos/b1/x.png' }], status: 'review', revision: 2, reasons: ['Agent IA : photo sans rapport.'], moderatedBy: 'auto', updatedAt: '2026-10-22T08:00:00Z' }
    const onWithdraw = vi.fn(async () => {})
    render(<ListingDialog product={product} listing={listing} currency="XOF" onSubmit={async () => {}} onWithdraw={onWithdraw} onClose={() => {}} />)
    expect(screen.getByText('En vérification')).toBeInTheDocument()
    expect(screen.getByText('Agent IA : photo sans rapport.')).toBeInTheDocument()
    expect(screen.getByText('Photos (1/5)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retirer l’annonce' }))
    expect(onWithdraw).toHaveBeenCalled()
  })

  it('enregistre la vitrine avec au moins un contact', async () => {
    const onSave = vi.fn(async () => {})
    render(<SellerProfileDialog profile={null} defaultName="Boutique Awa" onSave={onSave} onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText('Ville', { exact: true }), 'Ouagadougou')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer ma vitrine' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Indiquez au moins un numéro WhatsApp ou d’appel.')
    await userEvent.type(screen.getByLabelText('Numéro WhatsApp'), '70 12 34 56')
    await userEvent.type(screen.getByLabelText(/Autres villes/), 'Koudougou, Ziniaré')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer ma vitrine' }))
    expect(onSave).toHaveBeenCalledWith({ displayName: 'Boutique Awa', city: 'Ouagadougou', whatsapp: '70 12 34 56', phone: null, deliversEverywhere: false, deliveryCities: ['Koudougou', 'Ziniaré'], description: null })
  })
})
