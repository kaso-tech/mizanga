// Actions que l’assistant Agriculture peut proposer : nouvelle parcelle, nouvelle culture, opération du
// journal (travail, intrant, location, frais, récolte, vente, consommation, perte) et travail prévu.
//
// Le modèle ne fait que proposer : chaque proposition devient une fiche que l’agriculteur vérifie, corrige
// et confirme ; l’enregistrement passe par les adresses habituelles, avec les mêmes contrôles.
import { matchProduct } from '../business/assistant-actions.mjs'

const CROP_WORDS = /** @type {Record<string, string>} */ ({
  mais: 'maize', sorgho: 'sorghum', mil: 'millet', riz: 'rice', niebe: 'cowpea', arachide: 'groundnut', soja: 'soybean', coton: 'cotton', sesame: 'sesame', oignon: 'onion', tomate: 'tomato', chou: 'cabbage', piment: 'pepper', autre: 'other',
})
const OPERATION_WORDS = /** @type {Record<string, string>} */ ({
  travail: 'work', intrant: 'input', location: 'rental', autre_depense: 'expense', recolte: 'harvest', vente: 'sale', consommation: 'consumption', perte: 'loss',
})
const WORK_WORDS = /** @type {Record<string, string>} */ ({
  preparation_sol: 'soil_prep', semis: 'sowing', sarclage: 'weeding', fertilisation: 'fertilizing', traitement: 'treatment', irrigation: 'irrigation', recolte: 'harvesting', autre: 'other',
})
const INPUT_WORDS = /** @type {Record<string, string>} */ ({ semence: 'seed', engrais: 'fertilizer', fumure: 'manure', produit_traitement: 'treatment_product', autre: 'other' })
const TENURE_WORDS = /** @type {Record<string, string>} */ ({ propriete: 'owned', location: 'rented', pret: 'lent' })
const HARVEST_UNITS = ['kg', 'tonne', 'sac', 'cageot', 'panier']
const INPUT_UNITS = ['kg', 'tonne', 'sac', 'litre', 'sachet', 'flacon', 'charrette']

const culture = { type: 'string', description: 'Culture telle qu’elle figure dans la liste des cultures (nom — parcelle).' }
const dateField = (/** @type {string} */ what) => ({ type: 'string', description: `${what} au format AAAA-MM-JJ.` })

/** Déclarations transmises au modèle (format OpenAPI simplifié de Gemini). */
export const AGRICULTURE_FUNCTIONS = [
  {
    name: 'proposer_parcelle',
    description: 'Prépare une fiche de nouvelle parcelle, que l’agriculteur vérifiera puis confirmera. Seulement si elle n’existe pas encore.',
    parameters: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Nom court de la parcelle, par exemple « Champ derrière la maison ».' },
        lieu: { type: 'string', description: 'Village ou lieu, s’il a été donné.' },
        surface: { type: 'number', description: 'Surface donnée par l’agriculteur.' },
        unite_surface: { type: 'string', enum: ['ha', 'm2'], description: 'Unité de la surface : hectares ou mètres carrés.' },
        acces: { type: 'string', enum: Object.keys(TENURE_WORDS), description: 'La terre est en propriété, louée ou prêtée.' },
      },
      required: ['nom'],
    },
  },
  {
    name: 'proposer_culture',
    description: 'Prépare une fiche de nouvelle culture sur une parcelle existante, pour une saison, que l’agriculteur vérifiera puis confirmera.',
    parameters: {
      type: 'object',
      properties: {
        parcelle: { type: 'string', description: 'Nom de la parcelle, tel qu’il figure dans la liste des parcelles.' },
        culture: { type: 'string', enum: Object.keys(CROP_WORDS), description: 'Culture. autre : préciser nom_culture.' },
        nom_culture: { type: 'string', description: 'Nom de la culture si « autre » (igname, manioc…).' },
        saison: { type: 'string', enum: ['pluies', 'contre_saison'], description: 'Saison des pluies ou contre-saison (irriguée).' },
        annee: { type: 'integer', description: 'Année de la campagne.' },
        surface: { type: 'number', description: 'Surface cultivée donnée par l’agriculteur.' },
        unite_surface: { type: 'string', enum: ['ha', 'm2'], description: 'Unité de la surface.' },
        date_semis: dateField('Date de semis'),
        date_recolte_prevue: dateField('Date de récolte prévue'),
      },
      required: ['parcelle', 'culture'],
    },
  },
  {
    name: 'proposer_operation_agricole',
    description: 'Prépare une fiche d’opération pour une culture existante (travail, intrant, location, autre dépense, récolte, vente, consommation familiale, perte), que l’agriculteur vérifiera puis confirmera.',
    parameters: {
      type: 'object',
      properties: {
        culture,
        type: { type: 'string', enum: Object.keys(OPERATION_WORDS), description: 'Nature de l’opération. travail : son coût est la main-d’œuvre payée.' },
        type_travail: { type: 'string', enum: Object.keys(WORK_WORDS), description: 'Pour un travail.' },
        type_intrant: { type: 'string', enum: Object.keys(INPUT_WORDS), description: 'Pour un intrant.' },
        produit: { type: 'string', description: 'Nom de l’intrant (variété de semence, engrais, produit) ou précision, tel que donné par l’agriculteur.' },
        quantite: { type: 'number', description: 'Quantité donnée par l’agriculteur.' },
        unite: { type: 'string', enum: [...new Set([...HARVEST_UNITS, ...INPUT_UNITS])], description: 'Unité de la quantité.' },
        poids_unite_kg: { type: 'number', description: 'Pour une récolte ou une sortie en sacs, cageots ou paniers : poids d’une unité en kg, s’il a été donné.' },
        montant: { type: 'integer', description: 'Montant en francs (coût ou prix de vente), donné par l’agriculteur.' },
        date: dateField('Date, si ce n’est pas aujourd’hui,'),
        note: { type: 'string', description: 'Précision utile (acheteur, fournisseur…), sans dose de produit.' },
      },
      required: ['culture', 'type'],
    },
  },
  {
    name: 'proposer_travail_prevu',
    description: 'Prépare un rappel de travail à faire sur une culture (sarclage, fertilisation, traitement, irrigation, récolte…), que l’agriculteur vérifiera puis confirmera.',
    parameters: {
      type: 'object',
      properties: {
        culture,
        type_travail: { type: 'string', enum: Object.keys(WORK_WORDS), description: 'Travail prévu.' },
        libelle: { type: 'string', description: 'Précision courte, par exemple « Deuxième sarclage ».' },
        date_prevue: dateField('Date prévue'),
      },
      required: ['culture', 'type_travail', 'date_prevue'],
    },
  },
]

const MAX_PROPOSALS = 10
/** @param {unknown} value @param {number} max */
const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)
/** @param {unknown} value */
const integer = (value) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000_000 ? value : null)
/** @param {unknown} value */
const positive = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100_000_000_000 ? Math.round(value * 1000) / 1000 : null)
/** @param {unknown} value */
const isDay = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
/** @param {unknown} value */
const anyDay = (value) => (isDay(value) ? /** @type {string} */ (value) : null)
/** @param {unknown} value @param {string} today */
const pastDay = (value, today) => (isDay(value) && /** @type {string} */ (value) <= today ? /** @type {string} */ (value) : null)

/**
 * @typedef {{ id: string, name: string }} PlotRef
 * @typedef {{ id: string, name: string, status: string }} CropRef Nom affiché : « Maïs — Champ derrière la maison ».
 * @typedef {{ id: string, action: 'create_plot', values: { name: string, location: string | null, area: number | null, areaUnit: string, tenure: string | null } }} PlotProposal
 * @typedef {{ id: string, action: 'create_crop', values: { plotId: string | null, plotName: string, crop: string | null, customLabel: string | null, season: string | null, year: number | null, area: number | null, areaUnit: string, sownOn: string | null, expectedHarvestOn: string | null } }} CropProposal
 * @typedef {{ id: string, action: 'farm_operation', values: { cropId: string | null, cropName: string, kind: string, workType: string | null, inputType: string | null, label: string | null, quantity: number | null, unit: string | null, unitKg: number | null, amount: number | null, occurredOn: string | null, note: string | null } }} OperationProposal
 * @typedef {{ id: string, action: 'farm_task', values: { cropId: string | null, cropName: string, workType: string, label: string | null, dueOn: string | null } }} TaskProposal
 * @typedef {PlotProposal | CropProposal | OperationProposal | TaskProposal} AgricultureProposal
 */

/**
 * Transforme les demandes d’action du modèle en fiches à confirmer ; les valeurs douteuses restent vides.
 * @param {Array<{ name: string, args: Record<string, unknown> }>} calls
 * @param {{ plots: PlotRef[], crops: CropRef[], today: string }} data
 * @param {() => string} newId
 * @returns {AgricultureProposal[]}
 */
export function toAgricultureProposals(calls, { plots, crops, today }, newId) {
  /** @type {AgricultureProposal[]} */
  const proposals = []
  for (const { name, args } of calls.slice(0, MAX_PROPOSALS)) {
    if (name === 'proposer_parcelle') {
      const plotName = text(args.nom, 80)
      if (!plotName) continue
      proposals.push({
        id: newId(),
        action: 'create_plot',
        values: { name: plotName, location: text(args.lieu, 80), area: positive(args.surface), areaUnit: args.unite_surface === 'm2' ? 'm2' : 'ha', tenure: typeof args.acces === 'string' ? TENURE_WORDS[args.acces] ?? null : null },
      })
    }
    if (name === 'proposer_culture') {
      const plotName = text(args.parcelle, 80)
      const crop = typeof args.culture === 'string' ? CROP_WORDS[args.culture] ?? null : null
      if (!plotName) continue
      const year = integer(args.annee)
      proposals.push({
        id: newId(),
        action: 'create_crop',
        values: {
          plotId: matchProduct(plotName, plots)?.id ?? null,
          plotName: matchProduct(plotName, plots)?.name ?? plotName,
          crop,
          customLabel: crop === 'other' ? text(args.nom_culture, 60) : null,
          season: args.saison === 'pluies' ? 'rainy' : args.saison === 'contre_saison' ? 'dry' : null,
          year: year !== null && year >= 2000 && year <= 2100 ? year : null,
          area: positive(args.surface),
          areaUnit: args.unite_surface === 'm2' ? 'm2' : 'ha',
          sownOn: anyDay(args.date_semis),
          expectedHarvestOn: anyDay(args.date_recolte_prevue),
        },
      })
    }
    if (name === 'proposer_operation_agricole') {
      const cropName = text(args.culture, 120)
      const kind = typeof args.type === 'string' ? OPERATION_WORDS[args.type] : undefined
      if (!cropName || !kind) continue
      const match = matchProduct(cropName, crops)
      const harvestLike = ['harvest', 'sale', 'consumption', 'loss'].includes(kind)
      const unit = typeof args.unite === 'string' && (harvestLike ? HARVEST_UNITS : INPUT_UNITS).includes(args.unite) ? args.unite : null
      proposals.push({
        id: newId(),
        action: 'farm_operation',
        values: {
          cropId: match?.id ?? null,
          cropName: match?.name ?? cropName,
          kind,
          workType: kind === 'work' && typeof args.type_travail === 'string' ? WORK_WORDS[args.type_travail] ?? null : null,
          inputType: kind === 'input' && typeof args.type_intrant === 'string' ? INPUT_WORDS[args.type_intrant] ?? null : null,
          label: text(args.produit, 120),
          quantity: harvestLike || kind === 'input' ? positive(args.quantite) : null,
          unit: harvestLike || kind === 'input' ? unit : null,
          unitKg: harvestLike && unit && ['sac', 'cageot', 'panier'].includes(unit) ? positive(args.poids_unite_kg) : null,
          amount: ['harvest', 'consumption', 'loss'].includes(kind) ? null : integer(args.montant) || null,
          occurredOn: pastDay(args.date, today),
          note: text(args.note, 500),
        },
      })
    }
    if (name === 'proposer_travail_prevu') {
      const cropName = text(args.culture, 120)
      const workType = typeof args.type_travail === 'string' ? WORK_WORDS[args.type_travail] : undefined
      if (!cropName || !workType) continue
      const match = matchProduct(cropName, crops)
      proposals.push({ id: newId(), action: 'farm_task', values: { cropId: match?.id ?? null, cropName: match?.name ?? cropName, workType, label: text(args.libelle, 120), dueOn: anyDay(args.date_prevue) } })
    }
  }
  return proposals
}
