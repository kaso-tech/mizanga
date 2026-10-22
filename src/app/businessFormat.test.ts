import { describe, expect, it } from 'vitest'
import { formatAmount, formatQuantity, parseAmount, parseQuantity, stockLevel, stockValue, marginRate } from './businessFormat'

const normalizeSpaces = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ')

describe('montants et quantités', () => {
  it('affiche les montants en francs CFA sans décimales', () => {
    expect(normalizeSpaces(formatAmount(17500))).toBe('17 500 F CFA')
    expect(normalizeSpaces(formatQuantity(2.5))).toBe('2,5')
    expect(normalizeSpaces(formatQuantity(1250))).toBe('1 250')
  })

  it('lit les montants saisis à la française et refuse les centimes', () => {
    expect(parseAmount('17 500')).toBe(17500)
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('12,5')).toBeNull()
    expect(parseAmount('-3')).toBeNull()
  })

  it('lit les quantités avec virgule, trois décimales au plus', () => {
    expect(parseQuantity('2,5')).toBe(2.5)
    expect(parseQuantity('1,2345')).toBeNull()
    expect(parseQuantity('-1')).toBeNull()
    expect(parseQuantity('-1,5', { allowNegative: true })).toBe(-1.5)
  })

  it('repère les ruptures et les stocks bas, et calcule la valeur du stock', () => {
    expect(stockLevel({ quantity: 0, alertThreshold: 0 })).toBe('out')
    expect(stockLevel({ quantity: 3, alertThreshold: 3 })).toBe('low')
    expect(stockLevel({ quantity: 3, alertThreshold: 0 })).toBe('ok')
    expect(stockValue([{ quantity: 2.5, purchasePrice: 1001 }, { quantity: 10, purchasePrice: 15000 }])).toBe(152503)
  })

  it('calcule le taux de marge brute à une décimale', () => {
    expect(marginRate(5516, 36616)).toBe('15,1\u00a0%')
    expect(marginRate(-200, 1000)).toBe('-20\u00a0%')
    expect(marginRate(0, 0)).toBeNull()
  })
})
