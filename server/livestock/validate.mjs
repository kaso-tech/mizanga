// Contrôle des données Élevage reçues du navigateur, avant tout appel à la base (qui les recontrôle).
import { BusinessError, isUuid } from '../business/validate.mjs'

export const SPECIES = ['poultry', 'small_ruminant', 'cattle', 'pig']
export const TRACKING = ['group', 'individual']
export const EVENT_KINDS = ['birth', 'purchase', 'sale', 'death', 'count', 'feed', 'health', 'expense']
export const HEALTH_KINDS = ['vaccination', 'treatment', 'deworming', 'vet_visit', 'other']
export const SEXES = ['female', 'male', 'unknown']
const MAX_AMOUNT = 1_000_000_000_000
const MAX_COUNT = 10_000_000

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

/** @param {unknown} value @param {string} label */
function amount(value, label) {
  if (value === undefined || value === null) return 0
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_AMOUNT) throw invalid(`${label} doit être un montant entier positif.`)
  return value
}

/** @param {unknown} value @param {string} label */
function count(value, label) {
  if (value === undefined || value === null) return 0
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_COUNT) throw invalid(`${label} doit être un nombre entier positif.`)
  return value
}

/** Date AAAA-MM-JJ réelle, ou null. @param {unknown} value @param {string} label */
export function day(value, label) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid(`${label} est invalide.`)
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw invalid(`${label} est invalide.`)
  return value
}

/** @param {unknown} value @param {readonly string[]} allowed @param {string} message */
const oneOf = (value, allowed, message) => {
  if (typeof value !== 'string' || !allowed.includes(value)) throw invalid(message)
  return value
}

/** @param {unknown} value @param {string} message */
const optionalUuid = (value, message) => {
  if (value === undefined || value === null || value === '') return null
  if (!isUuid(value)) throw invalid(message)
  return /** @type {string} */ (value)
}

/** @param {any} body */
export function validateHerdInput(body) {
  const species = oneOf(body?.species, SPECIES, 'Choisissez une espèce.')
  return {
    name: /** @type {string} */ (text(body?.name, 'Le nom du lot', { min: 1, max: 80, required: true })),
    species,
    // Par défaut, les bovins sont suivis un par un ; les autres espèces, en lot.
    tracking: body?.tracking === undefined ? (species === 'cattle' ? 'individual' : 'group') : oneOf(body.tracking, TRACKING, 'Choisissez le type de suivi.'),
    initialCount: count(body?.initialCount, 'L’effectif de départ'),
    startedOn: day(body?.startedOn, 'La date de début'),
    note: text(body?.note, 'La note', { max: 500 }) ?? null,
  }
}

/** @param {any} body */
export function validateHerdChanges(body) {
  /** @type {Record<string, unknown>} */
  const changes = {}
  if (body?.name !== undefined) changes.name = text(body.name, 'Le nom du lot', { min: 1, max: 80, required: true })
  if (body?.note !== undefined) changes.note = text(body.note, 'La note', { max: 500 })
  if (body?.archived !== undefined) {
    if (typeof body.archived !== 'boolean') throw invalid('Archivage invalide.')
    changes.archived = body.archived
  }
  if (Object.keys(changes).length === 0) throw invalid('Aucune modification.')
  return changes
}

/** @param {any} body */
export function validateEventInput(body) {
  const herdId = optionalUuid(body?.herdId, 'Choisissez le lot.')
  if (!herdId) throw invalid('Choisissez le lot.')
  const animal = body?.animal === undefined || body.animal === null ? null : (() => {
    if (typeof body.animal !== 'object') throw invalid('Animal invalide.')
    return {
      tag: /** @type {string} */ (text(body.animal.tag, 'Le numéro de l’animal', { min: 1, max: 40, required: true })),
      name: text(body.animal.name, 'Le nom de l’animal', { max: 60 }) ?? null,
      sex: body.animal.sex === undefined || body.animal.sex === null ? 'unknown' : oneOf(body.animal.sex, SEXES, 'Sexe de l’animal invalide.'),
      bornOn: day(body.animal.bornOn, 'La date de naissance'),
    }
  })()
  return {
    herdId,
    kind: oneOf(body?.kind, EVENT_KINDS, 'Type d’événement inconnu.'),
    quantity: count(body?.quantity, 'Le nombre d’animaux'),
    amount: amount(body?.amount, 'Le montant'),
    occurredOn: day(body?.occurredOn, 'La date'),
    cause: text(body?.cause, 'La cause', { max: 200 }) ?? null,
    note: text(body?.note, 'La note', { max: 500 }) ?? null,
    animalId: optionalUuid(body?.animalId, 'Animal invalide.'),
    animal,
  }
}

/** @param {any} body */
export function validateHealthInput(body) {
  const herdId = optionalUuid(body?.herdId, 'Choisissez le lot.')
  if (!herdId) throw invalid('Choisissez le lot.')
  const dueOn = day(body?.dueOn, 'La date prévue')
  const doneOn = day(body?.doneOn, 'La date du soin')
  if (!dueOn && !doneOn) throw invalid('Indiquez la date prévue ou la date du soin.')
  return {
    herdId,
    animalId: optionalUuid(body?.animalId, 'Animal invalide.'),
    kind: oneOf(body?.kind, HEALTH_KINDS, 'Choisissez le type de soin.'),
    product: /** @type {string} */ (text(body?.product, 'Le vaccin ou le traitement', { min: 1, max: 120, required: true })),
    dueOn,
    doneOn,
    status: doneOn ? 'done' : 'planned',
    cost: amount(body?.cost, 'Le coût'),
    note: text(body?.note, 'La note', { max: 500 }) ?? null,
  }
}

/** Soin fait, annulé ou reporté. @param {any} body */
export function validateHealthChanges(body) {
  const status = oneOf(body?.status, ['planned', 'done', 'cancelled'], 'État du soin invalide.')
  /** @type {Record<string, unknown>} */
  const changes = { status }
  if (status === 'done') {
    const doneOn = day(body?.doneOn, 'La date du soin')
    if (!doneOn) throw invalid('Indiquez la date du soin.')
    changes.done_on = doneOn
    changes.cost = amount(body?.cost, 'Le coût')
  }
  if (status === 'planned') {
    const dueOn = day(body?.dueOn, 'La date prévue')
    if (!dueOn) throw invalid('Indiquez la nouvelle date prévue.')
    changes.due_on = dueOn
    changes.done_on = null
  }
  if (body?.note !== undefined) changes.note = text(body.note, 'La note', { max: 500 })
  return changes
}
