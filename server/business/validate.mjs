// Contrôle des données Business reçues du navigateur, avant tout appel à la base (qui les recontrôle).

/** Erreur dont le message peut être montré tel quel à l’utilisateur. */
export class BusinessError extends Error {
  /** @param {number} status @param {string} userMessage */
  constructor(status, userMessage) {
    super(userMessage)
    this.name = 'BusinessError'
    this.status = status
  }
}

export const MOVEMENT_KINDS = ['purchase', 'return', 'loss', 'adjustment']
const MAX_AMOUNT = 1_000_000_000_000
const MAX_QUANTITY = 1_000_000_000

export const isUuid = (/** @type {unknown} */ value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

const invalid = (/** @type {string} */ message) => new BusinessError(422, message)

/** @param {unknown} value @param {string} label @param {{ min?: number, max: number, required?: boolean }} limits */
function text(value, label, { min = 0, max, required = false }) {
  if (value === undefined || value === null) {
    if (required) throw invalid(`${label} est obligatoire.`)
    return undefined
  }
  if (typeof value !== 'string') throw invalid(`${label} est invalide.`)
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) throw invalid(min > 0 ? `${label} doit faire entre ${min} et ${max} caractères.` : `${label} ne peut pas dépasser ${max} caractères.`)
  return trimmed
}

/** Montant entier (le franc CFA n’a pas de centimes). @param {unknown} value @param {string} label */
function amount(value, label) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_AMOUNT) throw invalid(`${label} doit être un montant entier positif.`)
  return value
}

/** Quantité décimale (kg, litres…), trois décimales au plus. @param {unknown} value @param {string} label @param {{ allowNegative?: boolean, allowZero?: boolean }} [options] */
function quantity(value, label, { allowNegative = false, allowZero = true } = {}) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_QUANTITY || Math.round(value * 1000) !== value * 1000) {
    throw invalid(`${label} doit être un nombre (trois décimales au plus).`)
  }
  if ((!allowNegative && value < 0) || (!allowZero && value === 0)) throw invalid(`${label} doit être un nombre positif.`)
  return value
}

/** @param {any} body */
export function validateBusinessInput(body) {
  const currency = text(body?.currency, 'La devise', { max: 3 }) ?? 'XOF'
  const countryCode = text(body?.countryCode, 'Le pays', { max: 2 }) ?? 'BF'
  if (!/^[A-Z]{3}$/.test(currency)) throw invalid('La devise est invalide.')
  if (!/^[A-Z]{2}$/.test(countryCode)) throw invalid('Le pays est invalide.')
  return { name: /** @type {string} */ (text(body?.name, 'Le nom de l’entreprise', { min: 1, max: 120, required: true })), currency, countryCode }
}

/** @param {any} body */
export function validateProductInput(body) {
  return {
    name: /** @type {string} */ (text(body?.name, 'Le nom du produit', { min: 1, max: 120, required: true })),
    unit: text(body?.unit, 'L’unité', { max: 24 }) || 'unité',
    sku: text(body?.sku, 'La référence', { max: 64 }) || null,
    purchasePrice: amount(body?.purchasePrice, 'Le prix d’achat') ?? 0,
    salePrice: amount(body?.salePrice, 'Le prix de vente') ?? 0,
    alertThreshold: quantity(body?.alertThreshold, 'Le seuil d’alerte') ?? 0,
    initialQuantity: quantity(body?.initialQuantity, 'Le stock initial') ?? 0,
  }
}

/** Modification d’un produit : seuls les champs fournis changent (jamais la quantité). @param {any} body */
export function validateProductChanges(body) {
  /** @type {Record<string, unknown>} */
  const changes = {}
  if (body?.name !== undefined) changes.name = text(body.name, 'Le nom du produit', { min: 1, max: 120, required: true })
  if (body?.unit !== undefined) changes.unit = text(body.unit, 'L’unité', { min: 1, max: 24, required: true })
  if (body?.sku !== undefined) changes.sku = text(body.sku, 'La référence', { max: 64 }) || null
  if (body?.purchasePrice !== undefined) changes.purchase_price = amount(body.purchasePrice, 'Le prix d’achat')
  if (body?.salePrice !== undefined) changes.sale_price = amount(body.salePrice, 'Le prix de vente')
  if (body?.alertThreshold !== undefined) changes.alert_threshold = quantity(body.alertThreshold, 'Le seuil d’alerte')
  if (body?.archived !== undefined) {
    if (typeof body.archived !== 'boolean') throw invalid('La valeur « archivé » est invalide.')
    changes.archived = body.archived
  }
  if (Object.keys(changes).length === 0) throw invalid('Aucune modification.')
  return changes
}

/** @param {any} body */
export function validateMovementInput(body) {
  if (!MOVEMENT_KINDS.includes(body?.kind)) throw invalid('Type de mouvement invalide.')
  return {
    kind: /** @type {string} */ (body.kind),
    quantity: /** @type {number} */ (quantity(body?.quantity, 'La quantité', { allowNegative: body.kind === 'adjustment', allowZero: false }) ?? (() => { throw invalid('La quantité est obligatoire.') })()),
    unitCost: amount(body?.unitCost, 'Le coût unitaire') ?? null,
    note: text(body?.note, 'La note', { max: 500 }) || null,
  }
}

/** Jour du calendrier au format AAAA-MM-JJ (date réelle). @param {unknown} value @param {string} label */
function day(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid(`${label} est invalide (format AAAA-MM-JJ).`)
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw invalid(`${label} n’existe pas.`)
  return value
}

/** Période de jours locaux, bornes incluses, 366 jours au plus. @param {URLSearchParams} params */
export function validatePeriod(params) {
  const start = day(params.get('from'), 'La date de début')
  const end = day(params.get('to'), 'La date de fin')
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
  if (days < 0 || days > 366) throw invalid('Période invalide (366 jours au plus).')
  return { start, end }
}

/** @param {any} body */
export function validateSaleInput(body) {
  const items = body?.items
  if (!Array.isArray(items) || items.length === 0) throw invalid('Ajoutez au moins un produit à la vente.')
  if (items.length > 100) throw invalid('Une vente compte 100 lignes au plus.')
  return {
    items: items.map((item) => {
      if (!isUuid(item?.productId)) throw invalid('Produit invalide.')
      return {
        product_id: /** @type {string} */ (item.productId),
        quantity: /** @type {number} */ (quantity(item.quantity, 'La quantité', { allowZero: false }) ?? (() => { throw invalid('La quantité est obligatoire.') })()),
        ...(item.unitPrice === undefined || item.unitPrice === null ? {} : { unit_price: amount(item.unitPrice, 'Le prix unitaire') }),
      }
    }),
    customerName: text(body?.customerName, 'Le nom du client', { max: 120 }) || null,
    note: text(body?.note, 'La note', { max: 500 }) || null,
  }
}

/** @param {any} body */
export function validateExpenseInput(body) {
  const value = amount(body?.amount, 'Le montant')
  if (!value) throw invalid('Le montant doit être positif.')
  return {
    amount: value,
    category: /** @type {string} */ (text(body?.category, 'La catégorie', { min: 1, max: 40, required: true })),
    description: text(body?.description, 'La description', { max: 500 }) || null,
    spentOn: body?.spentOn === undefined || body?.spentOn === null ? null : day(body.spentOn, 'La date'),
  }
}

/** @param {any} body */
export const validateCancelInput = (body) => ({ reason: text(body?.reason, 'Le motif', { max: 500 }) || null })
