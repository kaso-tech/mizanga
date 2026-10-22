// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { estimateCostMicroUsd, readPricing } from './pricing.mjs'

describe('coût estimé de l’IA', () => {
  it('vaut 0 sans prix configuré (offre gratuite)', () => {
    expect(estimateCostMicroUsd({ inputTokens: 5000, outputTokens: 800 }, readPricing(undefined))).toBe(0)
  })

  it('applique les prix par million de jetons, en millionièmes de dollar', () => {
    // 5 000 × 0,30 + 800 × 2,50 = 1 500 + 2 000 = 3 500 millionièmes de dollar (0,0035 $).
    expect(estimateCostMicroUsd({ inputTokens: 5000, outputTokens: 800 }, readPricing('0.30, 2.50'))).toBe(3500)
  })

  it('refuse une configuration invalide', () => {
    expect(() => readPricing('gratuit')).toThrow(/AI_PRICE_USD_PER_MILLION/)
    expect(() => readPricing('1,-2')).toThrow()
  })
})
