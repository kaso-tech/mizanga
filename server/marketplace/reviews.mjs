// Avis des clients sur les vendeurs : contrôle automatique gratuit avant publication. Un avis suspect
// n’est pas refusé : il part en vérification humaine (console d’administration).
import { BusinessError } from '../business/validate.mjs'
import { FORBIDDEN_GROUPS, looksLikeGibberish, normalize } from './rules.mjs'

/** Insultes et grossièretés courantes (texte normalisé, mots entiers). */
const INSULTS = ['connard', 'connasse', 'salaud', 'salope', 'pute', 'putain', 'encule', 'enculé', 'batard', 'fdp', 'ntm', 'nique', 'abruti', 'debile', 'imbecile', 'merde', 'con', 'conne', 'idiot']

const containsTerm = (/** @type {string} */ haystack, /** @type {string} */ term) => ` ${haystack} `.includes(` ${normalize(term)} `)

/**
 * @param {string | null} comment
 * @returns {{ suspicious: boolean, reasons: string[] }}
 */
export function checkReviewRules(comment) {
  if (!comment) return { suspicious: false, reasons: [] }
  const text = normalize(comment)
  /** @type {string[]} */
  const reasons = []
  const insult = INSULTS.find((term) => containsTerm(text, term))
  if (insult) reasons.push(`Propos injurieux possibles : « ${insult} ».`)
  for (const group of FORBIDDEN_GROUPS) {
    const found = group.terms.find((term) => containsTerm(text, term))
    if (found) reasons.push(`Mot lié à des produits interdits (${group.label}) : « ${found} ».`)
  }
  if (/https?:\/\/|www\.|\.com\b|\.bf\b/i.test(comment)) reasons.push('Lien dans le commentaire.')
  if (/(?:\+?\d[\s.-]?){8,}/.test(comment)) reasons.push('Numéro de téléphone dans le commentaire.')
  if (looksLikeGibberish(text)) reasons.push('Texte en partie incompréhensible.')
  return { suspicious: reasons.length > 0, reasons }
}

/** @param {unknown} body */
export function validateReview(body) {
  const raw = /** @type {Record<string, unknown> | null} */ (body && typeof body === 'object' ? body : null)
  const rating = raw?.rating
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new BusinessError(422, 'Choisissez une note de 1 à 5 étoiles.')
  const comment = raw?.comment
  if (comment !== undefined && comment !== null && typeof comment !== 'string') throw new BusinessError(422, 'Commentaire invalide.')
  const trimmed = typeof comment === 'string' ? comment.trim() : ''
  if (trimmed.length > 500) throw new BusinessError(422, 'Le commentaire ne peut pas dépasser 500 caractères.')
  return { rating, comment: trimmed || null }
}

/** @param {any} row */
export const toReview = (row) => ({
  id: row.id,
  rating: Number(row.rating),
  comment: row.comment ?? null,
  status: row.status,
  revision: Number(row.revision),
  updatedAt: new Date(row.updated_at).toISOString(),
})
