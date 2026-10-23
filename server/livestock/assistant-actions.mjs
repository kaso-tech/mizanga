// Actions que l’assistant Élevage peut proposer : nouveau lot, événement du journal (naissance, achat,
// vente, mortalité, inventaire, alimentation, frais) et soin (vaccin, traitement…, prévu ou fait).
//
// Comme pour le Commerce, le modèle ne fait que proposer : chaque proposition devient une fiche que
// l’éleveur vérifie, corrige et confirme ; l’enregistrement passe par les adresses habituelles.
import { matchProduct, normalizeName } from '../business/assistant-actions.mjs'

export const SPECIES_WORDS = /** @type {Record<string, string>} */ ({ volailles: 'poultry', moutons_chevres: 'small_ruminant', bovins: 'cattle', porcs: 'pig' })
const EVENT_WORDS = /** @type {Record<string, string>} */ ({
  naissance: 'birth', achat: 'purchase', vente: 'sale', mortalite: 'death', inventaire: 'count', alimentation: 'feed', frais_sante: 'health', autre_depense: 'expense',
})
const HEALTH_WORDS = /** @type {Record<string, string>} */ ({ vaccination: 'vaccination', traitement: 'treatment', deparasitage: 'deworming', visite_veterinaire: 'vet_visit', autre: 'other' })
const SEX_WORDS = /** @type {Record<string, string>} */ ({ femelle: 'female', male: 'male' })

const lot = { type: 'string', description: 'Nom du lot ou troupeau, tel qu’il figure dans la liste des lots.' }

/** Déclarations transmises au modèle (format OpenAPI simplifié de Gemini). */
export const LIVESTOCK_FUNCTIONS = [
  {
    name: 'proposer_creation_lot',
    description: 'Prépare une fiche de nouveau lot ou troupeau, que l’éleveur vérifiera puis confirmera. Seulement si le lot n’existe pas encore.',
    parameters: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Nom court, par exemple « Poulets de chair — bande de mars ».' },
        espece: { type: 'string', enum: Object.keys(SPECIES_WORDS), description: 'Espèce du lot.' },
        suivi: { type: 'string', enum: ['groupe', 'individuel'], description: 'groupe : on compte les animaux ; individuel : chaque animal a un numéro (bovins surtout).' },
        effectif: { type: 'integer', description: 'Nombre d’animaux au départ (suivi en groupe), donné par l’éleveur.' },
        date_debut: { type: 'string', description: 'Date d’arrivée ou de début au format AAAA-MM-JJ, si ce n’est pas aujourd’hui.' },
      },
      required: ['nom', 'espece'],
    },
  },
  {
    name: 'proposer_evenement_elevage',
    description: 'Prépare une fiche d’événement pour un lot existant (naissance, achat, vente, mortalité, inventaire, alimentation, frais de santé, autre dépense), que l’éleveur vérifiera puis confirmera.',
    parameters: {
      type: 'object',
      properties: {
        lot,
        type: { type: 'string', enum: Object.keys(EVENT_WORDS), description: 'Nature de l’événement. inventaire : nombre d’animaux réellement comptés.' },
        nombre: { type: 'integer', description: 'Nombre d’animaux concernés (ou comptés pour un inventaire), donné par l’éleveur.' },
        montant: { type: 'integer', description: 'Montant en francs (prix de vente, prix d’achat, coût de l’aliment ou des frais), donné par l’éleveur.' },
        cause: { type: 'string', description: 'Pour une mortalité, la cause indiquée par l’éleveur ou le vétérinaire (sinon « inconnue »).' },
        date: { type: 'string', description: 'Date au format AAAA-MM-JJ, si ce n’est pas aujourd’hui.' },
        numero_animal: { type: 'string', description: 'Lot suivi individuellement : numéro de l’animal (boucle, marque).' },
        sexe: { type: 'string', enum: Object.keys(SEX_WORDS), description: 'Naissance ou achat d’un animal suivi individuellement, si connu.' },
        note: { type: 'string', description: 'Précision utile (acheteur, aliment, fournisseur…).' },
      },
      required: ['lot', 'type'],
    },
  },
  {
    name: 'proposer_soin',
    description: 'Prépare une fiche de soin (vaccination, traitement, déparasitage, visite du vétérinaire) prévu ou fait, que l’éleveur vérifiera puis confirmera. Le produit est celui nommé par l’éleveur ou son vétérinaire ; jamais de dose.',
    parameters: {
      type: 'object',
      properties: {
        lot,
        type: { type: 'string', enum: Object.keys(HEALTH_WORDS), description: 'Nature du soin.' },
        produit: { type: 'string', description: 'Vaccin, traitement ou motif de la visite, tel que nommé par l’éleveur (par exemple « Newcastle »).' },
        date_prevue: { type: 'string', description: 'Pour un rappel : date prévue au format AAAA-MM-JJ.' },
        date_faite: { type: 'string', description: 'Pour un soin déjà fait : date au format AAAA-MM-JJ.' },
        cout: { type: 'integer', description: 'Coût en francs, s’il a été donné.' },
        numero_animal: { type: 'string', description: 'Lot suivi individuellement : numéro de l’animal soigné, si un seul animal est concerné.' },
        note: { type: 'string', description: 'Précision utile (nom du vétérinaire…), sans dose ni posologie.' },
      },
      required: ['lot', 'type', 'produit'],
    },
  },
]

const MAX_PROPOSALS = 10
/** @param {unknown} value @param {number} max */
const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)
/** @param {unknown} value */
const integer = (value) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000_000 ? value : null)
/** @param {unknown} value */
const isDay = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
/** @param {unknown} value @param {string} today */
const pastDay = (value, today) => (isDay(value) && /** @type {string} */ (value) <= today ? /** @type {string} */ (value) : null)

/**
 * @typedef {{ id: string, name: string, tracking: string }} HerdRef
 * @typedef {{ id: string, herdId: string, tag: string, status: string }} AnimalRef
 * @typedef {{ id: string, action: 'create_herd', values: { name: string, species: string | null, tracking: string | null, initialCount: number | null, startedOn: string | null } }} HerdProposal
 * @typedef {{ id: string, action: 'livestock_event', values: { herdId: string | null, herdName: string, kind: string, quantity: number | null, amount: number | null, cause: string | null, occurredOn: string | null, animalId: string | null, animalTag: string | null, sex: string | null, note: string | null } }} EventProposal
 * @typedef {{ id: string, action: 'livestock_health', values: { herdId: string | null, herdName: string, kind: string, product: string, dueOn: string | null, doneOn: string | null, cost: number | null, animalId: string | null, animalTag: string | null, note: string | null } }} HealthProposal
 * @typedef {HerdProposal | EventProposal | HealthProposal} LivestockProposal
 */

/** Animal d’un lot désigné par son numéro (casse et espaces ignorés). @param {string | null} tag @param {string | null} herdId @param {AnimalRef[]} animals */
const findAnimal = (tag, herdId, animals) => (tag && herdId ? animals.find((animal) => animal.herdId === herdId && normalizeName(animal.tag) === normalizeName(tag)) ?? null : null)

/**
 * Transforme les demandes d’action du modèle en fiches à confirmer ; les valeurs douteuses restent vides.
 * @param {Array<{ name: string, args: Record<string, unknown> }>} calls
 * @param {{ herds: HerdRef[], animals: AnimalRef[], today: string }} data
 * @param {() => string} newId
 * @returns {LivestockProposal[]}
 */
export function toLivestockProposals(calls, { herds, animals, today }, newId) {
  /** @type {LivestockProposal[]} */
  const proposals = []
  for (const { name, args } of calls.slice(0, MAX_PROPOSALS)) {
    if (name === 'proposer_creation_lot') {
      const herdName = text(args.nom, 80)
      if (!herdName) continue
      const species = typeof args.espece === 'string' ? SPECIES_WORDS[args.espece] ?? null : null
      const tracking = args.suivi === 'individuel' ? 'individual' : args.suivi === 'groupe' ? 'group' : null
      proposals.push({ id: newId(), action: 'create_herd', values: { name: herdName, species, tracking, initialCount: tracking === 'individual' ? null : integer(args.effectif), startedOn: pastDay(args.date_debut, today) } })
    }
    if (name === 'proposer_evenement_elevage') {
      const herdName = text(args.lot, 80)
      const kind = typeof args.type === 'string' ? EVENT_WORDS[args.type] : undefined
      if (!herdName || !kind) continue
      const herd = matchProduct(herdName, herds)
      const animalTag = text(args.numero_animal, 40)
      const individual = herd?.tracking === 'individual'
      const withAmount = ['purchase', 'sale', 'feed', 'health', 'expense'].includes(kind)
      proposals.push({
        id: newId(),
        action: 'livestock_event',
        values: {
          herdId: herd?.id ?? null,
          herdName: herd?.name ?? herdName,
          kind,
          quantity: ['feed', 'health', 'expense'].includes(kind) || individual ? null : integer(args.nombre),
          amount: withAmount ? integer(args.montant) || null : null,
          cause: kind === 'death' ? text(args.cause, 200) : null,
          occurredOn: pastDay(args.date, today),
          animalId: individual && (kind === 'sale' || kind === 'death') ? findAnimal(animalTag, herd?.id ?? null, animals.filter((animal) => animal.status === 'present'))?.id ?? null : null,
          animalTag: individual ? animalTag : null,
          sex: individual && typeof args.sexe === 'string' ? SEX_WORDS[args.sexe] ?? null : null,
          note: text(args.note, 500),
        },
      })
    }
    if (name === 'proposer_soin') {
      const herdName = text(args.lot, 80)
      const kind = typeof args.type === 'string' ? HEALTH_WORDS[args.type] : undefined
      const product = text(args.produit, 120)
      if (!herdName || !kind || !product) continue
      const herd = matchProduct(herdName, herds)
      const doneOn = pastDay(args.date_faite, today)
      const animalTag = herd?.tracking === 'individual' ? text(args.numero_animal, 40) : null
      proposals.push({
        id: newId(),
        action: 'livestock_health',
        values: {
          herdId: herd?.id ?? null,
          herdName: herd?.name ?? herdName,
          kind,
          product,
          dueOn: doneOn ? null : isDay(args.date_prevue) ? /** @type {string} */ (args.date_prevue) : null,
          doneOn,
          cost: integer(args.cout) || null,
          animalId: findAnimal(animalTag, herd?.id ?? null, animals.filter((animal) => animal.status === 'present'))?.id ?? null,
          animalTag,
          note: text(args.note, 500),
        },
      })
    }
  }
  return proposals
}
