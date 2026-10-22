// Contrôle des données de la marketplace reçues du navigateur (la base les recontrôle).
import { BusinessError, isUuid } from '../business/validate.mjs'
import { CONDITIONS, cleanAttributes, findCategory } from './categories.mjs'

const invalid = (/** @type {string} */ message) => new BusinessError(422, message)

/** Indicatifs téléphoniques des pays proposés à la création d’un commerce. */
export const DIAL_CODES = /** @type {Record<string, string>} */ ({ BF: '226', BJ: '229', CI: '225', GW: '245', ML: '223', NE: '227', SN: '221', TG: '228' })

export const PHOTO_TYPES = /** @type {Record<string, string>} */ ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })
export const MAX_PHOTOS = 5
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
export const REPORT_REASONS = ['forbidden', 'scam', 'counterfeit', 'wrong_info', 'other']

/** @param {unknown} value @param {string} label @param {number} min @param {number} max */
function text(value, label, min, max) {
  if (value === undefined || value === null || value === '') {
    if (min > 0) throw invalid(`${label} est obligatoire.`)
    return ''
  }
  if (typeof value !== 'string') throw invalid(`${label} est invalide.`)
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) throw invalid(min > 0 ? `${label} doit faire entre ${min} et ${max} caractères.` : `${label} ne peut pas dépasser ${max} caractères.`)
  return trimmed
}

/**
 * Numéro au format international sans « + » (226XXXXXXXX) ; un numéro local reçoit l’indicatif du pays.
 * @param {unknown} value @param {string} countryCode @param {string} label
 */
export function normalizePhone(value, countryCode, label) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw invalid(`${label} est invalide.`)
  let digits = value.replace(/[\s.\-()]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  else if (digits.startsWith('00')) digits = digits.slice(2)
  else if (DIAL_CODES[countryCode] && !digits.startsWith(DIAL_CODES[countryCode])) digits = `${DIAL_CODES[countryCode]}${digits}`
  if (!/^[0-9]{8,15}$/.test(digits)) throw invalid(`${label} est invalide : indiquez par exemple 70 12 34 56 ou +226 70 12 34 56.`)
  return digits
}

/** @param {any} body @param {string} countryCode */
export function validateSellerProfile(body, countryCode) {
  const whatsapp = normalizePhone(body?.whatsapp, countryCode, 'Le numéro WhatsApp')
  const phone = normalizePhone(body?.phone, countryCode, 'Le numéro d’appel')
  if (!whatsapp && !phone) throw invalid('Indiquez au moins un numéro WhatsApp ou d’appel.')
  const cities = Array.isArray(body?.deliveryCities) ? body.deliveryCities : []
  if (cities.length > 30) throw invalid('30 villes de livraison au plus.')
  return {
    displayName: text(body?.displayName, 'Le nom de la vitrine', 2, 80),
    city: text(body?.city, 'La ville', 2, 60),
    whatsapp,
    phone,
    deliversEverywhere: body?.deliversEverywhere === true,
    deliveryCities: [...new Set(cities.map((/** @type {unknown} */ city) => text(city, 'Une ville de livraison', 2, 60)))],
    description: text(body?.description, 'La présentation', 0, 500) || null,
  }
}

/**
 * Annonce : texte, catégorie, caractéristiques et photos (gardées ou nouvelles, en base64).
 * @param {any} body @param {string} businessId
 */
export function validateListingInput(body, businessId) {
  if (!isUuid(body?.productId)) throw invalid('Produit invalide.')
  const category = findCategory(body?.category)
  if (!category) throw invalid('Choisissez une catégorie.')
  const subcategory = body?.subcategory ? category.subcategories.find((sub) => sub.id === body.subcategory) : null
  if (body?.subcategory && !subcategory) throw invalid('Sous-catégorie invalide.')
  if (!Object.hasOwn(CONDITIONS, body?.condition ?? 'new')) throw invalid('État invalide.')
  const keepPhotos = Array.isArray(body?.keepPhotos) ? body.keepPhotos : []
  const newPhotos = Array.isArray(body?.newPhotos) ? body.newPhotos : []
  if (keepPhotos.length + newPhotos.length > MAX_PHOTOS) throw invalid(`${MAX_PHOTOS} photos au plus.`)
  const pathPattern = new RegExp(`^${businessId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`)
  for (const path of keepPhotos) if (typeof path !== 'string' || !pathPattern.test(path)) throw invalid('Photo invalide.')
  return {
    productId: /** @type {string} */ (body.productId),
    title: text(body?.title, 'Le titre', 3, 120),
    description: text(body?.description, 'La description', 0, 4000),
    category: category.id,
    subcategory: subcategory?.id ?? null,
    condition: /** @type {string} */ (body?.condition ?? 'new'),
    attributes: cleanAttributes(category.id, body?.attributes),
    keepPhotos: /** @type {string[]} */ (keepPhotos),
    /** @type {Array<{ mimeType: string, data: string, bytes: Buffer }>} */
    newPhotos: newPhotos.map((/** @type {any} */ photo) => {
      if (!PHOTO_TYPES[photo?.mimeType] || typeof photo.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data)) throw invalid('Seules les photos JPEG, PNG ou WebP sont acceptées.')
      const bytes = Buffer.from(photo.data, 'base64')
      if (bytes.length > MAX_PHOTO_BYTES) throw invalid('Une photo dépasse 2 Mo.')
      return { mimeType: /** @type {string} */ (photo.mimeType), data: /** @type {string} */ (photo.data), bytes }
    }),
  }
}

/** @param {URLSearchParams} params */
export function validateSearch(params) {
  /** @param {string} name */
  const price = (name) => {
    const value = params.get(name)
    if (!value) return null
    if (!/^\d{1,12}$/.test(value)) throw invalid('Prix invalide.')
    return Number(value)
  }
  const category = params.get('category') || null
  if (category && !findCategory(category)) throw invalid('Catégorie inconnue.')
  const condition = params.get('condition') || null
  if (condition && !Object.hasOwn(CONDITIONS, condition)) throw invalid('État invalide.')
  const page = Math.min(Math.max(Number.parseInt(params.get('page') ?? '1', 10) || 1, 1), 50)
  return {
    query: (params.get('q') ?? '').slice(0, 100) || null,
    category,
    subcategory: params.get('subcategory') || null,
    city: (params.get('city') ?? '').slice(0, 60) || null,
    minPrice: price('minPrice'),
    maxPrice: price('maxPrice'),
    condition,
    limit: 24,
    offset: (page - 1) * 24,
  }
}

/** @param {any} body */
export function validateReport(body) {
  if (!REPORT_REASONS.includes(body?.reason)) throw invalid('Motif de signalement invalide.')
  return { reason: /** @type {string} */ (body.reason), details: text(body?.details, 'La précision', 0, 500) || null }
}
