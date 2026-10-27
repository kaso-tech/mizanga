// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { checkCriterion, rankListings, scoreListing } from './ranking.mjs'
import { toShoppingQuery } from './assistant.mjs'

const now = Date.parse('2026-10-24T12:00:00Z')
/** @param {Partial<import('./ranking.mjs').Card>} changes */
const card = (changes) => ({ id: 'x', title: 'Téléphone', price: 45000, currency: 'XOF', attributes: {}, city: 'Ouagadougou', sellerVerified: false, sameCity: false, deliversToCity: false, publishedAt: '2026-01-01T00:00:00Z', ...changes })

describe('classement des annonces de l’assistant d’achat', () => {
  const query = toShoppingQuery({ requete: 'android', categorie: 'telephones', budget_max: 50000, ville: 'Ouagadougou', criteres: [{ caracteristique: 'ram_go', minimum: 4 }, { caracteristique: 'double_sim', valeur: 'oui' }] })

  it('contrôle la demande du modèle et ignore les valeurs inconnues', () => {
    expect(query).toEqual({ query: 'android', category: 'telephones', subcategory: null, city: 'Ouagadougou', minPrice: null, maxPrice: 50000, condition: null, criteria: [{ key: 'ram_go', min: 4 }, { key: 'double_sim', value: true }] })
    expect(toShoppingQuery({ categorie: 'armes', etat: 'cassé', criteres: [{ caracteristique: 'inconnue', valeur: 'x' }], budget_max: -5 })).toMatchObject({ category: null, condition: null, criteria: [], maxPrice: null })
  })

  it('vérifie les critères : satisfait, insuffisant ou non renseigné', () => {
    expect(checkCriterion({ key: 'ram_go', min: 4 }, { ram_go: 8 })).toBe(true)
    expect(checkCriterion({ key: 'ram_go', min: 4 }, { ram_go: 2 })).toBe(false)
    expect(checkCriterion({ key: 'ram_go', min: 4 }, {})).toBeNull()
    expect(checkCriterion({ key: 'marque', value: 'samsung' }, { marque: 'Samsung Galaxy' })).toBe(true)
  })

  it('calcule un score explicable sur 100', () => {
    // Budget (25) + 2 critères sur 2 (35) + mots (10) + même ville (15) + vérifié (10) + récent (5) = 100.
    const best = scoreListing(card({ attributes: { ram_go: 8, double_sim: true }, sameCity: true, sellerVerified: true, publishedAt: '2026-10-20T00:00:00Z' }), query, { queryMatched: true, now })
    expect(best).toEqual({ score: 100, overBudget: false, warnings: [], reasons: ['Dans votre budget (45 000 F CFA)', 'Mémoire vive (RAM) : 8 Go', 'Double SIM : oui', 'À Ouagadougou', 'Vendeur vérifié'] })
    // Au-dessus du budget, RAM non indiquée : 0 + 18 (1 critère sur 2, arrondi) + 10 = 28.
    const weak = scoreListing(card({ price: 60000, attributes: { double_sim: true } }), query, { queryMatched: true, now })
    expect(weak).toMatchObject({ score: 28, overBudget: true, warnings: ['Au-dessus de votre budget (60 000 F CFA)', 'Mémoire vive (RAM) non indiqué par le vendeur'] })
  })

  it('classe d’abord les annonces dans le budget, du meilleur score au moins bon, puis du moins cher au plus cher', () => {
    const ranked = rankListings([
      card({ id: 'cher', price: 49000, attributes: { ram_go: 8, double_sim: true } }),
      card({ id: 'bon-marche', price: 39000, attributes: { ram_go: 8, double_sim: true } }),
      card({ id: 'faible', price: 30000, attributes: { ram_go: 2 } }),
      card({ id: 'hors-budget', price: 90000, attributes: { ram_go: 12, double_sim: true } }),
    ], query, { queryMatched: true, now, limit: 3 })
    // « hors-budget » a de meilleures caractéristiques, mais le budget passe d’abord.
    expect(ranked.map((item) => item.card.id)).toEqual(['bon-marche', 'cher', 'faible'])
  })

  it('ajoute 5 points à un vendeur bien noté (au moins 4/5 sur 3 avis), avec la raison', () => {
    const rated = scoreListing(card({ sellerRating: 4.6, sellerReviews: 12 }), query, { queryMatched: false, now })
    const plain = scoreListing(card({}), query, { queryMatched: false, now })
    expect(rated.score - plain.score).toBe(5)
    expect(rated.reasons).toContain('Vendeur bien noté (4,6/5, 12 avis)')
    // Trop peu d’avis, ou note moyenne : rien.
    expect(scoreListing(card({ sellerRating: 5, sellerReviews: 2 }), query, { queryMatched: false, now }).score).toBe(plain.score)
    expect(scoreListing(card({ sellerRating: 3.9, sellerReviews: 30 }), query, { queryMatched: false, now }).score).toBe(plain.score)
  })
})
