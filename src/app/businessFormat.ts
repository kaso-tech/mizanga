// Montants et quantités de l’espace Business : calculs en entiers (le franc CFA n’a pas de centimes)
// et saisie à la française (virgule décimale, espaces entre les milliers).

/** « 17 500 F CFA » ; la devise vient de l’entreprise (XOF par défaut). */
export function formatAmount(amount: number, currency = 'XOF') {
  return new Intl.NumberFormat('fr', { style: 'currency', currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(amount)
}

/** Devise telle qu’écrite à côté d’un champ de montant : « F CFA » pour XOF. */
export const currencyLabel = (currency: string) => (currency === 'XOF' ? 'F CFA' : currency)

/** « 2,5 », « 10 » : trois décimales au plus. */
export const formatQuantity = (quantity: number) => quantity.toLocaleString('fr', { maximumFractionDigits: 3 })

const normalizeNumber = (input: string) => input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')

/** Montant saisi (« 17 500 ») en entier positif, ou null s’il est invalide ; vide = 0. */
export function parseAmount(input: string): number | null {
  const value = normalizeNumber(input)
  if (value === '') return 0
  if (!/^\d+$/.test(value)) return null
  const amount = Number(value)
  return Number.isSafeInteger(amount) ? amount : null
}

/** Quantité saisie (« 2,5 ») ; trois décimales au plus ; `allowNegative` pour les corrections. */
export function parseQuantity(input: string, { allowNegative = false } = {}): number | null {
  const value = normalizeNumber(input)
  if (value === '') return 0
  if (!(allowNegative ? /^-?\d+(\.\d{1,3})?$/ : /^\d+(\.\d{1,3})?$/).test(value)) return null
  return Number(value)
}

/** Stock à surveiller : en rupture, ou au niveau du seuil d’alerte (s’il est défini). */
export function stockLevel(product: { quantity: number; alertThreshold: number }): 'out' | 'low' | 'ok' {
  if (product.quantity <= 0) return 'out'
  if (product.alertThreshold > 0 && product.quantity <= product.alertThreshold) return 'low'
  return 'ok'
}

/** Valeur du stock au prix d’achat, arrondie au franc (quantités décimales). */
export const stockValue = (products: Array<{ quantity: number; purchasePrice: number }>) => (
  products.reduce((total, product) => total + Math.round(product.quantity * product.purchasePrice), 0)
)

/** Taux de marge brute (marge / chiffre d’affaires), à une décimale ; rien à afficher sans ventes. */
export const marginRate = (grossMargin: number, revenue: number) => (
  revenue > 0 ? `${(Math.round((grossMargin / revenue) * 1000) / 10).toLocaleString('fr')}\u00a0%` : null
)
