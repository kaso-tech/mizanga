// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ASSISTANT_FUNCTIONS, matchProduct, normalizeName, toProposals } from './assistant-actions.mjs'

const products = [{ id: 'p1', name: 'Riz parfumé 25 kg' }, { id: 'p2', name: 'Savon Kissi' }, { id: 'p3', name: 'Savon Lux' }]
let counter = 0
const newId = () => `f${++counter}`

describe('actions de l’assistant Business', () => {
  it('déclare deux actions, sans prix ni quantité obligatoires pour un nouveau produit', () => {
    expect(ASSISTANT_FUNCTIONS.map((fn) => fn.name)).toEqual(['proposer_creation_produit', 'proposer_mouvement_stock'])
    expect(ASSISTANT_FUNCTIONS[0].parameters.required).toEqual(['nom'])
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
    const proposals = toProposals([
      { name: 'proposer_creation_produit', args: { nom: ' Huile Dinor 5 L ', unite: 'bidon', prix_achat: 9000, prix_vente: 10500.5, quantite_initiale: 12 } },
      { name: 'proposer_mouvement_stock', args: { produit: 'Riz parfumé 25 kg', type: 'achat', quantite: 2.5, cout_unitaire: 14500 } },
      { name: 'proposer_mouvement_stock', args: { produit: 'savon', type: 'perte', quantite: 3, cout_unitaire: 100, note: 'Cassé' } },
      { name: 'proposer_mouvement_stock', args: { produit: 'Riz', type: 'vente', quantite: 1 } },
      { name: 'supprimer_tout', args: {} },
      { name: 'proposer_creation_produit', args: { prix_vente: 100 } },
    ], products, newId)
    expect(proposals).toEqual([
      { id: 'f1', action: 'create_product', values: { name: 'Huile Dinor 5 L', unit: 'bidon', purchasePrice: 9000, salePrice: null, initialQuantity: 12, alertThreshold: null } },
      { id: 'f2', action: 'stock_movement', values: { productId: 'p1', productName: 'Riz parfumé 25 kg', kind: 'purchase', quantity: 2.5, unitCost: 14500, note: null } },
      { id: 'f3', action: 'stock_movement', values: { productId: null, productName: 'savon', kind: 'loss', quantity: 3, unitCost: null, note: 'Cassé' } },
    ])
  })
})
