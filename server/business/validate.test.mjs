// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateExpenseInput, validateMovementInput, validatePeriod, validateProductChanges, validateProductInput, validateSaleInput } from './validate.mjs'

describe('contrôle des données Business', () => {
  it('complète un produit avec des valeurs par défaut sûres', () => {
    expect(validateProductInput({ name: ' Savon ' })).toEqual({ name: 'Savon', unit: 'pièce', sku: null, purchasePrice: 0, salePrice: 0, alertThreshold: 0, initialQuantity: 0 })
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

  it('contrôle les périodes : dates réelles, ordre et durée', () => {
    expect(validatePeriod(new URLSearchParams('from=2026-10-01&to=2026-10-31'))).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(() => validatePeriod(new URLSearchParams('from=2026-10-31&to=2026-10-01'))).toThrow(/Période invalide/)
    expect(() => validatePeriod(new URLSearchParams('from=2026-02-29&to=2026-03-01'))).toThrow('La date de début n’existe pas.')
    expect(() => validatePeriod(new URLSearchParams('from=2025-01-01&to=2026-06-01'))).toThrow(/366 jours/)
  })

  it('prépare une vente pour la base et refuse les lignes invalides', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    expect(validateSaleInput({ items: [{ productId: id, quantity: 2.5 }, { productId: '22222222-2222-2222-2222-222222222222', quantity: 1, unitPrice: 900 }] }).items).toEqual([
      { product_id: id, quantity: 2.5 },
      { product_id: '22222222-2222-2222-2222-222222222222', quantity: 1, unit_price: 900 },
    ])
    expect(() => validateSaleInput({ items: [] })).toThrow('Ajoutez au moins un produit à la vente.')
    expect(() => validateSaleInput({ items: [{ productId: 'x', quantity: 1 }] })).toThrow('Produit invalide.')
    expect(() => validateSaleInput({ items: [{ productId: id, quantity: 0 }] })).toThrow('La quantité doit être un nombre positif.')
  })

  it('contrôle une dépense', () => {
    expect(validateExpenseInput({ amount: 2500, category: ' Transport ', spentOn: '2026-10-20' })).toEqual({ amount: 2500, category: 'Transport', description: null, spentOn: '2026-10-20' })
    expect(() => validateExpenseInput({ amount: 0, category: 'Transport' })).toThrow('Le montant doit être positif.')
    expect(() => validateExpenseInput({ amount: 10, category: '' })).toThrow(/catégorie/)
  })
})
