// Formule Pro et sponsorisation : déclaration d’un paiement Mobile Money par le commerçant, contrôlée
// ici puis par la base (qui calcule le montant à partir des tarifs), et tarifs modifiés dans la console.
import { BusinessError, isUuid } from '../business/validate.mjs'
import { normalizePhone } from './validate.mjs'

const invalid = (/** @type {string} */ message) => new BusinessError(422, message)
export const PAYMENT_METHODS = ['orange_money', 'moov_money']

/**
 * @param {unknown} body @param {string} countryCode
 * @returns {{ kind: 'pro' | 'sponsor', months: number | null, offerId: string | null, listingId: string | null, method: string, payerPhone: string, reference: string }}
 */
export function validatePaymentRequest(body, countryCode) {
  const raw = /** @type {Record<string, unknown> | null} */ (body && typeof body === 'object' ? body : null)
  if (!raw || (raw.kind !== 'pro' && raw.kind !== 'sponsor')) throw invalid('Type de paiement inconnu.')
  if (typeof raw.method !== 'string' || !PAYMENT_METHODS.includes(raw.method)) throw invalid('Choisissez Orange Money ou Moov Money.')
  const payerPhone = normalizePhone(raw.payerPhone, countryCode, 'Le numéro qui a payé')
  if (!payerPhone) throw invalid('Indiquez le numéro qui a payé.')
  const reference = typeof raw.reference === 'string' ? raw.reference.trim() : ''
  if (reference.length < 4 || reference.length > 60) throw invalid('Indiquez la référence de la transaction reçue par SMS.')
  if (raw.kind === 'pro') {
    if (typeof raw.months !== 'number' || !Number.isInteger(raw.months) || raw.months < 1 || raw.months > 12) throw invalid('Durée invalide.')
    return { kind: 'pro', months: raw.months, offerId: null, listingId: null, method: raw.method, payerPhone, reference }
  }
  if (typeof raw.offerId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(raw.offerId)) throw invalid('Offre de sponsorisation inconnue.')
  if (typeof raw.listingId !== 'string' || !isUuid(raw.listingId)) throw invalid('Annonce introuvable.')
  return { kind: 'sponsor', months: null, offerId: raw.offerId, listingId: raw.listingId, method: raw.method, payerPhone, reference }
}

/** Entier positif borné. @param {unknown} value @param {string} label @param {number} max */
const count = (value, label, max, min = 0) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw invalid(`${label} : valeur invalide.`)
  return value
}

/** Tarifs, limites et numéros de paiement envoyés par la console. @param {unknown} body */
export function validatePricing(body) {
  const raw = /** @type {any} */ (body)
  if (!raw || typeof raw !== 'object') throw invalid('Tarifs invalides.')
  const plans = (Array.isArray(raw.plans) ? raw.plans : []).filter((/** @type {any} */ plan) => plan?.id === 'test' || plan?.id === 'pro').map((/** @type {any} */ plan) => ({
    id: plan.id,
    monthlyPrice: plan.id === 'test' ? 0 : count(plan.monthlyPrice, 'Prix de la formule Pro', 10_000_000),
    dailyAiRequests: count(plan.dailyAiRequests, 'Questions par jour', 10_000),
    maxBusinesses: count(plan.maxBusinesses, 'Commerces', 100, 1),
    maxListings: count(plan.maxListings, 'Annonces en ligne', 100_000, 1),
    maxPhotos: count(plan.maxPhotos, 'Photos par annonce', 5, 1),
  }))
  const offers = (Array.isArray(raw.offers) ? raw.offers : []).map((/** @type {any} */ offer) => {
    if (typeof offer?.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(offer.id)) throw invalid('Offre inconnue.')
    return { id: offer.id, price: count(offer.price, 'Prix de la sponsorisation', 10_000_000), active: offer.active !== false }
  })
  const settings = raw.settings ?? {}
  const phone = (/** @type {unknown} */ value, /** @type {string} */ label) => {
    if (value === undefined || value === null || value === '') return ''
    if (typeof value !== 'string' || !/^[0-9]{8,15}$/.test(value.replace(/[\s.+-]/g, ''))) throw invalid(`${label} : numéro invalide (indicatif compris, par exemple 22670123456).`)
    return value.replace(/[\s.+-]/g, '')
  }
  const text = (/** @type {unknown} */ value, /** @type {number} */ max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
  return {
    plans,
    offers,
    settings: { accountName: text(settings.accountName, 80), orangeMoney: phone(settings.orangeMoney, 'Orange Money'), moovMoney: phone(settings.moovMoney, 'Moov Money'), instructions: text(settings.instructions, 500) },
  }
}

/** @param {any} row */
export const toPayment = (row) => ({
  id: row.id,
  kind: row.kind,
  months: row.months ?? null,
  offerId: row.offer_id ?? null,
  listingId: row.listing_id ?? null,
  amount: Number(row.amount),
  currency: row.currency,
  method: row.method,
  reference: row.reference,
  status: row.status,
  adminNote: row.admin_note ?? null,
  createdAt: new Date(row.created_at).toISOString(),
})
