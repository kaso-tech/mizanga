// Libellés de l’onglet Agriculture (cultures, saisons, opérations, travaux) et petites aides d’affichage.
import type { AreaUnit, CropCode, CropResult, HarvestUnit, InputType, OperationKind, Season, Tenure, WorkType } from '../services/agricultureApi'

export const cropLabels: Record<CropCode, string> = {
  maize: 'Maïs', sorghum: 'Sorgho', millet: 'Mil', rice: 'Riz', cowpea: 'Niébé', groundnut: 'Arachide', soybean: 'Soja', cotton: 'Coton', sesame: 'Sésame', onion: 'Oignon', tomato: 'Tomate', cabbage: 'Chou', pepper: 'Piment', other: 'Autre…',
}
/** Ordre de la liste : céréales, légumineuses, rente, maraîchage, puis « Autre ». */
export const cropGroups: Array<{ label: string; crops: CropCode[] }> = [
  { label: 'Céréales', crops: ['maize', 'sorghum', 'millet', 'rice'] },
  { label: 'Légumineuses', crops: ['cowpea', 'groundnut', 'soybean'] },
  { label: 'Cultures de rente', crops: ['cotton', 'sesame'] },
  { label: 'Maraîchage', crops: ['onion', 'tomato', 'cabbage', 'pepper'] },
  { label: 'Autre', crops: ['other'] },
]

export const seasonLabels: Record<Season, string> = { rainy: 'Saison des pluies', dry: 'Contre-saison' }
export const tenureLabels: Record<Tenure, string> = { owned: 'En propriété', rented: 'Louée', lent: 'Prêtée' }
export const areaUnitLabels: Record<AreaUnit, string> = { ha: 'hectares (ha)', m2: 'mètres carrés (m²)' }

export const operationLabels: Record<OperationKind, string> = {
  work: 'Travail', input: 'Intrant', rental: 'Location (terre, matériel)', expense: 'Autre dépense', harvest: 'Récolte', sale: 'Vente de récolte', consumption: 'Consommation familiale', loss: 'Perte',
}
export const operationKinds: OperationKind[] = ['work', 'input', 'rental', 'expense', 'harvest', 'sale', 'consumption', 'loss']

export const workLabels: Record<WorkType, string> = {
  soil_prep: 'Préparation du sol (labour)', sowing: 'Semis', weeding: 'Sarclage, désherbage', fertilizing: 'Fertilisation', treatment: 'Traitement des cultures', irrigation: 'Irrigation', harvesting: 'Récolte (travail)', other: 'Autre travail',
}
export const inputLabels: Record<InputType, string> = { seed: 'Semences', fertilizer: 'Engrais', manure: 'Fumure, compost', treatment_product: 'Produit de traitement', other: 'Autre intrant' }

export const harvestUnits: HarvestUnit[] = ['kg', 'sac', 'tonne', 'cageot', 'panier']
export const harvestUnitLabels: Record<HarvestUnit, string> = { kg: 'kg', sac: 'sacs', tonne: 'tonnes', cageot: 'cageots', panier: 'paniers' }
export const inputUnits = ['kg', 'sac', 'litre', 'sachet', 'flacon', 'charrette']

/** Opération sur la récolte (quantité convertie en kg, stock). */
export const movesHarvest = (kind: OperationKind) => kind === 'harvest' || kind === 'sale' || kind === 'consumption' || kind === 'loss'
/** Unité dont le poids doit être donné (sac, cageot, panier). */
export const needsUnitWeight = (unit: string) => unit === 'sac' || unit === 'cageot' || unit === 'panier'

/** « 1,5 ha » ou « 800 m² », selon l’unité choisie pour la parcelle. */
export function formatArea(m2: number, unit: AreaUnit = m2 >= 1000 ? 'ha' : 'm2') {
  return unit === 'ha' ? `${(m2 / 10_000).toLocaleString('fr', { maximumFractionDigits: 4 })} ha` : `${m2.toLocaleString('fr')} m²`
}
/** « 1 800 kg » ; au-delà de 10 tonnes, « 12,5 t ». */
export const formatKg = (kg: number) => (kg >= 10_000 ? `${(kg / 1000).toLocaleString('fr', { maximumFractionDigits: 2 })} t` : `${kg.toLocaleString('fr', { maximumFractionDigits: 3 })} kg`)
/** Nom d’une culture : « Maïs — Champ 1 ». */
export const cropName = (crop: { cropLabel: string; plotName: string }) => `${crop.cropLabel} — ${crop.plotName}`

/** Saisie d’un nombre décimal à la française (« 1,5 »), ou null. */
export function parseDecimal(input: string): number | null {
  const value = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,3})?$/.test(value)) return null
  const number = Number(value)
  return number > 0 ? number : null
}

/** Totaux de toutes les cultures : sommes des chiffres de chaque culture. */
export function farmTotals(crops: CropResult[]) {
  const sum = (pick: (row: CropResult) => number) => crops.reduce((total, row) => total + pick(row), 0)
  return {
    harvestedKg: Math.round(sum((row) => row.harvestedKg) * 1000) / 1000,
    stockKg: Math.round(sum((row) => row.stockKg) * 1000) / 1000,
    totalCost: sum((row) => row.totalCost),
    salesRevenue: sum((row) => row.salesRevenue),
    estimatedMargin: sum((row) => row.estimatedMargin),
  }
}
