// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ASSISTANT_FUNCTIONS, matchProduct, normalizeName, toProposals } from './assistant-actions.mjs'

const products = [{ id: 'p1', name: 'Riz parfumé 25 kg' }, { id: 'p2', name: 'Savon Kissi' }, { id: 'p3', name: 'Savon Lux' }]
let counter = 0
const newId = () => `f${++counter}`

describe('actions de l’assistant Business', () => {
  it('déclare deux actions, sans prix ni quantité obligatoires pour un nouveau produit', () => {
    expect(ASSISTANT_FUNCTIONS.map((fn) => fn.name)).toEqual(['proposer_creation_produit', 'proposer_mouvement_stock', 'proposer_vente', 'proposer_depense', 'proposer_annulation_vente'])
    expect(ASSISTANT_FUNCTIONS[0].parameters.required).toEqual(['nom'])
  })

  it('prépare des fiches de vente, de dépense et d’annulation', () => {
    const sales = [{ id: 'ab12cd34-0000-4000-8000-000000000000', reference: 'ab12cd34', soldAt: '2026-10-22T06:30:00.000Z', totalAmount: 34000, status: 'completed', items: [{ productName: 'Riz parfumé 25 kg', quantity: 2, unit: 'sac' }] }]
    const proposals = toProposals([
      { name: 'proposer_vente', args: { lignes: [{ produit: 'riz parfumé', quantite: 2, prix_unitaire: 17000 }, { produit: 'savon', quantite: 3 }, { quantite: 1 }], client: 'Mariam' } },
      { name: 'proposer_vente', args: { lignes: [] } },
      { name: 'proposer_depense', args: { montant: 5000, categorie: 'Abonnement Wi-Fi', description: 'Box octobre' } },
      { name: 'proposer_depense', args: { montant: -3, categorie: 'Divers', date: '2099-01-01' } },
      { name: 'proposer_depense', args: { montant: 2000, categorie: 'Transport', date: '2026-10-20' } },
      { name: 'proposer_annulation_vente', args: { reference: '[AB12CD34]', motif: 'Erreur' } },
      { name: 'proposer_annulation_vente', args: { reference: 'inconnue' } },
    ], { products, sales, today: '2026-10-22' }, newId)
    expect(proposals.map((proposal) => proposal.values)).toEqual([
      { items: [{ productId: 'p1', productName: 'riz parfumé', quantity: 2, unitPrice: 17000 }, { productId: null, productName: 'savon', quantity: 3, unitPrice: null }], customerName: 'Mariam', note: null },
      { amount: 5000, category: 'Abonnement Wi-Fi', description: 'Box octobre', spentOn: null },
      { amount: null, category: 'Autre', description: null, spentOn: null },
      { amount: 2000, category: 'Transport', description: null, spentOn: '2026-10-20' },
      { saleId: sales[0].id, reference: 'ab12cd34', sale: { soldAt: sales[0].soldAt, totalAmount: 34000, status: 'completed', items: sales[0].items }, reason: 'Erreur' },
      { saleId: null, reference: 'inconnue', sale: null, reason: null },
    ])
  })

  it('retrouve un produit malgré la casse et les accents, et refuse les noms ambigus', () => {
    expect(normalizeName('  Riz PARFUMÉ 25kg ')).toBe('riz parfume 25kg')
    expect(matchProduct('riz parfume 25 kg', products)?.id).toBe('p1')
    expect(matchProduct('Riz Parfumé 25kg', products)?.id).toBe('p1')
    expect(matchProduct('riz', products)?.id).toBe('p1')
    expect(matchProduct('savon', products)).toBeNull()
    expect(matchProduct('sucre', products)).toBeNull()
  })

  it('transforme les demandes du modèle en fiches, en laissant vides les valeurs douteuses', () => {
    counter = 0
    const proposals = toProposals([
      { name: 'proposer_creation_produit', args: { nom: ' Huile Dinor 5 L ', unite: 'bidon', prix_achat: 9000, prix_vente: 10500.5, quantite_initiale: 12 } },
      { name: 'proposer_mouvement_stock', args: { produit: 'Riz parfumé 25 kg', type: 'achat', quantite: 2.5, cout_unitaire: 14500 } },
      { name: 'proposer_mouvement_stock', args: { produit: 'savon', type: 'perte', quantite: 3, cout_unitaire: 100, note: 'Cassé' } },
      { name: 'proposer_mouvement_stock', args: { produit: 'Riz', type: 'vente', quantite: 1 } },
      { name: 'supprimer_tout', args: {} },
      { name: 'proposer_creation_produit', args: { prix_vente: 100 } },
    ], { products, sales: [], today: '2026-10-22' }, newId)
    expect(proposals).toEqual([
      { id: 'f1', action: 'create_product', values: { name: 'Huile Dinor 5 L', unit: 'bidon', purchasePrice: 9000, salePrice: null, initialQuantity: 12, alertThreshold: null } },
      { id: 'f2', action: 'stock_movement', values: { productId: 'p1', productName: 'Riz parfumé 25 kg', kind: 'purchase', quantity: 2.5, unitCost: 14500, note: null } },
      { id: 'f3', action: 'stock_movement', values: { productId: null, productName: 'savon', kind: 'loss', quantity: 3, unitCost: null, note: 'Cassé' } },
    ])
  })
})
