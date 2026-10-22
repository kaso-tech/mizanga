// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateMovementInput, validateProductChanges, validateProductInput } from './validate.mjs'

describe('contrôle des données Business', () => {
  it('complète un produit avec des valeurs par défaut sûres', () => {
    expect(validateProductInput({ name: ' Savon ' })).toEqual({ name: 'Savon', unit: 'unité', sku: null, purchasePrice: 0, salePrice: 0, alertThreshold: 0, initialQuantity: 0 })
  })

  it('refuse les montants non entiers, les quantités négatives ou trop précises', () => {
    expect(() => validateProductInput({ name: 'X', purchasePrice: 10.5 })).toThrow('Le prix d’achat doit être un montant entier positif.')
    expect(() => validateProductInput({ name: 'X', initialQuantity: -1 })).toThrow('Le stock initial doit être un nombre positif.')
    expect(() => validateProductInput({ name: 'X', alertThreshold: 0.0001 })).toThrow(/trois décimales/)
    expect(() => validateProductInput({ name: 'X', salePrice: '100' })).toThrow(/montant entier/)
  })

  it('ne laisse jamais modifier la quantité ni l’entreprise d’un produit', () => {
    expect(validateProductChanges({ salePrice: 100, quantity: 999, business_id: 'autre' })).toEqual({ sale_price: 100 })
    expect(() => validateProductChanges({ quantity: 5 })).toThrow('Aucune modification.')
  })

  it('accepte un ajustement négatif, mais une perte toujours positive', () => {
    expect(validateMovementInput({ kind: 'adjustment', quantity: -2 })).toEqual({ kind: 'adjustment', quantity: -2, unitCost: null, note: null })
    expect(() => validateMovementInput({ kind: 'loss', quantity: -2 })).toThrow('La quantité doit être un nombre positif.')
    expect(() => validateMovementInput({ kind: 'purchase', quantity: 0 })).toThrow('La quantité doit être un nombre positif.')
    expect(() => validateMovementInput({ kind: 'sale', quantity: 1 })).toThrow('Type de mouvement invalide.')
    expect(() => validateMovementInput({ kind: 'purchase' })).toThrow('La quantité est obligatoire.')
  })
})
