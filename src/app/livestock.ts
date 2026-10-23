// Libellés de l’onglet Élevage (espèces, événements, soins) et petites aides d’affichage.
import type { HealthKind, HerdSummary, LivestockEventKind, Sex, Species, Tracking } from '../services/livestockApi'

export const speciesLabels: Record<Species, string> = {
  poultry: 'Volailles',
  small_ruminant: 'Moutons et chèvres',
  cattle: 'Bovins',
  pig: 'Porcs',
}

export const speciesOrder: Species[] = ['poultry', 'small_ruminant', 'cattle', 'pig']

export const trackingLabels: Record<Tracking, string> = {
  group: 'En lot (on compte les animaux)',
  individual: 'Un par un (numéro de boucle)',
}

export const eventLabels: Record<LivestockEventKind, string> = {
  start: 'Effectif de départ',
  birth: 'Naissance',
  purchase: 'Achat d’animaux',
  sale: 'Vente d’animaux',
  death: 'Mortalité',
  count: 'Inventaire (comptage)',
  feed: 'Alimentation',
  health: 'Frais de santé',
  expense: 'Autre dépense',
}

/** Événements qu’on peut saisir (l’effectif de départ vient de la création du lot). */
export const recordableEvents: Array<Exclude<LivestockEventKind, 'start'>> = ['birth', 'purchase', 'sale', 'death', 'count', 'feed', 'health', 'expense']

export const healthLabels: Record<HealthKind, string> = {
  vaccination: 'Vaccination',
  treatment: 'Traitement',
  deworming: 'Déparasitage',
  vet_visit: 'Visite du vétérinaire',
  other: 'Autre soin',
}

export const sexLabels: Record<Sex, string> = { female: 'Femelle', male: 'Mâle', unknown: 'Non précisé' }

/** Événement qui change le nombre d’animaux (et demande ce nombre, ou un animal pour un suivi individuel). */
export const movesAnimals = (kind: LivestockEventKind) => kind === 'birth' || kind === 'purchase' || kind === 'sale' || kind === 'death'
/** Événement qui demande un montant. */
export const needsAmount = (kind: LivestockEventKind) => kind === 'purchase' || kind === 'sale' || kind === 'feed' || kind === 'health' || kind === 'expense'
/** Dépense du lot (sans animaux). */
export const isCost = (kind: LivestockEventKind) => kind === 'feed' || kind === 'health' || kind === 'expense'

/** « 2,4 % », ou un tiret quand le taux ne se calcule pas (aucun animal). */
export const formatRate = (rate: number | null) => (rate === null ? '—' : `${rate.toLocaleString('fr', { maximumFractionDigits: 1 })} %`)

/** « 23 oct. 2026 ». */
export const formatDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('fr', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

/** Écart en jours entre deux dates AAAA-MM-JJ (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** Totaux de tous les lots : sommes des chiffres de chaque lot ; mortalité recalculée sur l’ensemble. */
export function totalsOf(herds: HerdSummary[]) {
  const sum = (pick: (row: HerdSummary) => number) => herds.reduce((total, row) => total + pick(row), 0)
  const exposed = sum((row) => row.openingHeadcount + row.births + row.purchases)
  const deaths = sum((row) => row.deaths)
  return {
    closingHeadcount: sum((row) => row.closingHeadcount),
    deaths,
    mortalityRate: exposed > 0 ? Math.round((deaths * 1000) / exposed) / 10 : null,
    totalCost: sum((row) => row.totalCost),
    salesRevenue: sum((row) => row.salesRevenue),
    estimatedMargin: sum((row) => row.estimatedMargin),
  }
}
