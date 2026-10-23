// Contrôle des données Agriculture reçues du navigateur, avant tout appel à la base (qui les recontrôle).
import { BusinessError, isUuid } from '../business/validate.mjs'
import { day } from '../livestock/validate.mjs'

export const CROPS = ['maize', 'sorghum', 'millet', 'rice', 'cowpea', 'groundnut', 'soybean', 'cotton', 'sesame', 'onion', 'tomato', 'cabbage', 'pepper', 'other']
export const CROP_LABELS = /** @type {Record<string, string>} */ ({
  maize: 'Maïs', sorghum: 'Sorgho', millet: 'Mil', rice: 'Riz', cowpea: 'Niébé', groundnut: 'Arachide', soybean: 'Soja', cotton: 'Coton', sesame: 'Sésame', onion: 'Oignon', tomato: 'Tomate', cabbage: 'Chou', pepper: 'Piment', other: 'Autre',
})
export const SEASONS = ['rainy', 'dry']
export const TENURES = ['owned', 'rented', 'lent']
export const AREA_UNITS = ['ha', 'm2']
export const OPERATION_KINDS = ['work', 'input', 'rental', 'expense', 'harvest', 'sale', 'consumption', 'loss']
export const WORK_TYPES = ['soil_prep', 'sowing', 'weeding', 'fertilizing', 'treatment', 'irrigation', 'harvesting', 'other']
export const INPUT_TYPES = ['seed', 'fertilizer', 'manure', 'treatment_product', 'other']
export const HARVEST_UNITS = ['kg', 'tonne', 'sac', 'cageot', 'panier']
const MAX_AMOUNT = 1_000_000_000_000
const MAX_AREA_M2 = 100_000_000_000

const invalid = (/** @type {string} */ message) => new BusinessError(422, message)

/** @param {unknown} value @param {string} label @param {{ min?: number, max: number, required?: boolean }} limits @returns {string | null | undefined} */
function text(value, label, { min = 0, max, required = false }) {
  if (value === undefined) {
    if (required) throw invalid(`${label} est obligatoire.`)
    return undefined
  }
  if (value === null || value === '') {
    if (required || min > 0) throw invalid(`${label} est obligatoire.`)
    return null
  }
  if (typeof value !== 'string') throw invalid(`${label} est invalide.`)
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) throw invalid(min > 0 ? `${label} doit faire entre ${min} et ${max} caractères.` : `${label} ne peut pas dépasser ${max} caractères.`)
  return trimmed || null
}

/** @param {unknown} value @param {readonly string[]} allowed @param {string} message */
const oneOf = (value, allowed, message) => {
  if (typeof value !== 'string' || !allowed.includes(value)) throw invalid(message)
  return value
}

/** @param {unknown} value @param {string} label */
function amount(value, label) {
  if (value === undefined || value === null) return 0
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_AMOUNT) throw invalid(`${label} doit être un montant entier positif.`)
  return value
}

/** Nombre positif, trois décimales au plus ; null s’il est absent. @param {unknown} value @param {string} label */
function decimal(value, label) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100_000_000_000 || Math.round(value * 1000) !== value * 1000) throw invalid(`${label} doit être un nombre positif (trois décimales au plus).`)
  return value
}

/** Surface saisie en hectares ou en m², convertie en m² entiers. @param {unknown} area @param {string} unit */
export function toSquareMeters(area, unit) {
  if (typeof area !== 'number' || !Number.isFinite(area) || area <= 0) throw invalid('La surface doit être un nombre positif.')
  const m2 = Math.round(unit === 'ha' ? area * 10_000 : area)
  if (m2 < 1 || m2 > MAX_AREA_M2) throw invalid('La surface est invalide.')
  return m2
}

/** @param {any} body */
export function validatePlotInput(body) {
  const areaUnit = body?.areaUnit === undefined ? 'ha' : oneOf(body.areaUnit, AREA_UNITS, 'Unité de surface invalide.')
  return {
    name: /** @type {string} */ (text(body?.name, 'Le nom de la parcelle', { min: 1, max: 80, required: true })),
    location: text(body?.location, 'Le lieu', { max: 80 }) ?? null,
    areaM2: toSquareMeters(body?.area, areaUnit),
    areaUnit,
    tenure: body?.tenure === undefined ? 'owned' : oneOf(body.tenure, TENURES, 'Mode d’accès à la terre invalide.'),
    note: text(body?.note, 'La note', { max: 500 }) ?? null,
  }
}

/** @param {any} body */
export function validatePlotChanges(body) {
  /** @type {Record<string, unknown>} */
  const changes = {}
  if (body?.name !== undefined) changes.name = text(body.name, 'Le nom de la parcelle', { min: 1, max: 80, required: true })
  if (body?.location !== undefined) changes.location = text(body.location, 'Le lieu', { max: 80 })
  if (body?.tenure !== undefined) changes.tenure = oneOf(body.tenure, TENURES, 'Mode d’accès à la terre invalide.')
  if (body?.note !== undefined) changes.note = text(body.note, 'La note', { max: 500 })
  if (body?.area !== undefined) {
    const unit = oneOf(body.areaUnit ?? 'ha', AREA_UNITS, 'Unité de surface invalide.')
    changes.area_m2 = toSquareMeters(body.area, unit)
    changes.area_unit = unit
  }
  if (body?.archived !== undefined) {
    if (typeof body.archived !== 'boolean') throw invalid('Archivage invalide.')
    changes.archived = body.archived
  }
  if (Object.keys(changes).length === 0) throw invalid('Aucune modification.')
  return changes
}

/** @param {any} body */
export function validateCropInput(body) {
  if (!isUuid(body?.plotId)) throw invalid('Choisissez la parcelle.')
  const crop = oneOf(body?.crop, CROPS, 'Choisissez la culture.')
  const customLabel = text(body?.label, 'Le nom de la culture', { max: 60 })
  if (crop === 'other' && !customLabel) throw invalid('Indiquez le nom de la culture.')
  const year = body?.year
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) throw invalid('Année invalide.')
  return {
    plotId: /** @type {string} */ (body.plotId),
    crop,
    cropLabel: crop === 'other' ? /** @type {string} */ (customLabel) : CROP_LABELS[crop],
    season: oneOf(body?.season, SEASONS, 'Choisissez la saison.'),
    year,
    areaM2: toSquareMeters(body?.area, body?.areaUnit === undefined ? 'ha' : oneOf(body.areaUnit, AREA_UNITS, 'Unité de surface invalide.')),
    sownOn: day(body?.sownOn, 'La date de semis'),
    expectedHarvestOn: day(body?.expectedHarvestOn, 'La date de récolte prévue'),
    note: text(body?.note, 'La note', { max: 500 }) ?? null,
  }
}

/** @param {any} body */
export function validateCropChanges(body) {
  /** @type {Record<string, unknown>} */
  const changes = {}
  if (body?.sownOn !== undefined) changes.sown_on = day(body.sownOn, 'La date de semis')
  if (body?.expectedHarvestOn !== undefined) changes.expected_harvest_on = day(body.expectedHarvestOn, 'La date de récolte prévue')
  if (body?.note !== undefined) changes.note = text(body.note, 'La note', { max: 500 })
  if (body?.status !== undefined) changes.status = oneOf(body.status, ['active', 'closed'], 'État invalide.')
  if (body?.area !== undefined) changes.area_m2 = toSquareMeters(body.area, oneOf(body.areaUnit ?? 'ha', AREA_UNITS, 'Unité de surface invalide.'))
  if (Object.keys(changes).length === 0) throw invalid('Aucune modification.')
  return changes
}

/** @param {any} body */
export function validateOperationInput(body) {
  if (!isUuid(body?.cropId)) throw invalid('Choisissez la culture.')
  const kind = oneOf(body?.kind, OPERATION_KINDS, 'Type d’opération inconnu.')
  const harvestLike = ['harvest', 'sale', 'consumption', 'loss'].includes(kind)
  const unit = body?.unit === undefined || body.unit === null || body.unit === ''
    ? (harvestLike ? 'kg' : null)
    : harvestLike ? oneOf(body.unit, HARVEST_UNITS, 'Unité de récolte inconnue.') : text(body.unit, 'L’unité', { max: 20 }) ?? null
  return {
    cropId: /** @type {string} */ (body.cropId),
    kind,
    quantity: decimal(body?.quantity, 'La quantité'),
    unit,
    unitKg: decimal(body?.unitKg, 'Le poids d’une unité'),
    amount: amount(body?.amount, 'Le montant'),
    occurredOn: day(body?.occurredOn, 'La date'),
    workType: kind === 'work' ? oneOf(body?.workType, WORK_TYPES, 'Choisissez le type de travail.') : null,
    inputType: kind === 'input' ? oneOf(body?.inputType, INPUT_TYPES, 'Choisissez le type d’intrant.') : null,
    label: text(body?.label, 'Le libellé', { max: 120 }) ?? null,
    note: text(body?.note, 'La note', { max: 500 }) ?? null,
  }
}

/** @param {any} body */
export function validateTaskInput(body) {
  if (!isUuid(body?.cropId)) throw invalid('Choisissez la culture.')
  const dueOn = day(body?.dueOn, 'La date prévue')
  if (!dueOn) throw invalid('Indiquez la date prévue.')
  return {
    cropId: /** @type {string} */ (body.cropId),
    workType: oneOf(body?.workType, WORK_TYPES, 'Choisissez le type de travail.'),
    label: text(body?.label, 'Le libellé', { max: 120 }) ?? null,
    dueOn,
  }
}

/** Travail fait (entre au journal), annulé ou reporté. @param {any} body */
export function validateTaskChange(body) {
  const status = oneOf(body?.status, ['done', 'cancelled', 'planned'], 'État invalide.')
  if (status === 'done') return { status, doneOn: day(body?.doneOn, 'La date'), amount: amount(body?.amount, 'Le montant') }
  if (status === 'planned') {
    const dueOn = day(body?.dueOn, 'La date prévue')
    if (!dueOn) throw invalid('Indiquez la nouvelle date prévue.')
    return { status, dueOn }
  }
  return { status }
}
