// Classement des annonces pour l’assistant d’achat. Il est calculé ici, de façon déterministe et
// vérifiable, à partir des données des annonces : l’IA comprend la demande et explique le résultat,
// mais ne choisit ni n’invente les chiffres.
//
// Score sur 100 :
// * budget (25) : prix dans le budget ; au-dessus, 0 et l’annonce est signalée « au-dessus du budget » ;
// * critères demandés (35) : part des critères satisfaits (ex. mémoire vive d’au moins 4 Go) ;
//   un critère non renseigné par le vendeur ne compte pas et est signalé ;
// * mots recherchés (10) : l’annonce contient les mots demandés (marque, modèle…) ;
// * ville (15) : vendeur dans la ville du client (15) ou qui y livre (10) ;
// * vendeur vérifié (10) ;
// * vendeur bien noté : au moins 4/5 sur 3 avis publiés ou plus (5) ;
// * annonce récente, publiée depuis moins de 30 jours (5).
// Les annonces dans le budget passent toujours avant celles au-dessus ; à score égal, le moins cher d’abord.
// Au-dessus du budget, les plus proches du budget (les moins chères) d’abord.
import { CATEGORIES } from '../marketplace/categories.mjs'

/** Toutes les caractéristiques connues (clé → libellé et unité), toutes catégories confondues. */
export const ATTRIBUTES = /** @type {Map<string, { label: string, unit?: string, type: string }>} */ (new Map())
for (const category of CATEGORIES) {
  for (const attribute of category.attributes ?? []) {
    if (!ATTRIBUTES.has(attribute.key)) ATTRIBUTES.set(attribute.key, { label: attribute.label, unit: attribute.unit, type: attribute.type })
  }
}

/**
 * @typedef {{ key: string, min?: number, value?: string | boolean }} Criterion
 * @typedef {{ query: string | null, category: string | null, subcategory: string | null, city: string | null, minPrice: number | null, maxPrice: number | null, condition: string | null, criteria: Criterion[] }} ShoppingQuery
 * @typedef {{ id: string, title: string, price: number, currency: string, attributes: Record<string, unknown>, city: string, sellerVerified: boolean, sellerRating?: number | null, sellerReviews?: number, sameCity?: boolean, deliversToCity?: boolean, publishedAt?: string }} Card
 */

const DAY_MS = 86_400_000
const plain = (/** @type {unknown} */ value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/** « 4 Go », « Oui » : valeur d’une caractéristique, lisible. @param {string} key @param {unknown} value */
export function describeAttribute(key, value) {
  const attribute = ATTRIBUTES.get(key)
  const shown = typeof value === 'boolean' ? (value ? 'oui' : 'non') : `${value}${attribute?.unit ? ` ${attribute.unit}` : ''}`
  return `${attribute?.label ?? key} : ${shown}`
}

/** Le critère est-il satisfait (true), non satisfait (false) ou non renseigné par le vendeur (null) ? @param {Criterion} criterion @param {Record<string, unknown>} attributes */
export function checkCriterion(criterion, attributes) {
  const value = attributes?.[criterion.key]
  if (value === undefined || value === null || value === '') return null
  if (criterion.min !== undefined) return typeof value === 'number' && value >= criterion.min
  if (typeof criterion.value === 'boolean') return value === criterion.value
  if (criterion.value !== undefined) return plain(value).includes(plain(criterion.value))
  return true
}

/**
 * Score et raisons d’une annonce pour la demande.
 * @param {Card} card @param {ShoppingQuery} query @param {{ queryMatched: boolean, now: number }} context
 */
export function scoreListing(card, query, { queryMatched, now }) {
  /** @type {string[]} */
  const reasons = []
  /** @type {string[]} */
  const warnings = []
  let score = 0
  const price = `${card.price.toLocaleString('fr-FR').replace(/\u202f/g, ' ')} F CFA`
  if (query.maxPrice !== null) {
    if (card.price <= query.maxPrice) {
      score += 25
      reasons.push(`Dans votre budget (${price})`)
    } else {
      warnings.push(`Au-dessus de votre budget (${price})`)
    }
  } else {
    score += 15
  }
  if (query.criteria.length > 0) {
    let satisfied = 0
    for (const criterion of query.criteria) {
      const result = checkCriterion(criterion, card.attributes)
      const label = ATTRIBUTES.get(criterion.key)?.label ?? criterion.key
      if (result === true) {
        satisfied += 1
        reasons.push(describeAttribute(criterion.key, card.attributes[criterion.key]))
      } else if (result === false) {
        warnings.push(`${describeAttribute(criterion.key, card.attributes[criterion.key])} (moins que demandé)`)
      } else {
        warnings.push(`${label} non indiqué par le vendeur`)
      }
    }
    score += Math.round((35 * satisfied) / query.criteria.length)
  } else {
    // Sans critère précis : une annonce bien renseignée compte un peu plus.
    score += Math.min(Object.keys(card.attributes ?? {}).length, 5) * 3
  }
  if (query.query && queryMatched) score += 10
  if (card.sameCity) {
    score += 15
    reasons.push(`À ${card.city}`)
  } else if (card.deliversToCity) {
    score += 10
    reasons.push(`Livre à ${query.city}`)
  }
  if (card.sellerVerified) {
    score += 10
    reasons.push('Vendeur vérifié')
  }
  if (typeof card.sellerRating === 'number' && card.sellerRating >= 4 && (card.sellerReviews ?? 0) >= 3) {
    score += 5
    reasons.push(`Vendeur bien noté (${String(card.sellerRating).replace('.', ',')}/5, ${card.sellerReviews} avis)`)
  }
  if (card.publishedAt && now - Date.parse(card.publishedAt) < 30 * DAY_MS) score += 5
  return { score: Math.min(score, 100), reasons, warnings, overBudget: query.maxPrice !== null && card.price > query.maxPrice }
}

/**
 * Classe les annonces trouvées et garde les meilleures.
 * @param {Card[]} cards @param {ShoppingQuery} query @param {{ queryMatched: boolean, now?: number, limit?: number }} options
 */
export function rankListings(cards, query, { queryMatched, now = Date.now(), limit = 5 }) {
  return cards
    .map((card) => ({ card, ...scoreListing(card, query, { queryMatched, now }) }))
    .sort((a, b) => Number(a.overBudget) - Number(b.overBudget)
      || (a.overBudget && b.overBudget ? a.card.price - b.card.price : b.score - a.score || a.card.price - b.card.price)
      || a.card.id.localeCompare(b.card.id))
    .slice(0, limit)
}
