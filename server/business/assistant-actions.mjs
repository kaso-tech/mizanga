// Actions que l’assistant Business peut proposer (étape « assistant de gestion », partie 1 : produits et stock).
//
// Le modèle ne fait que proposer : chaque proposition devient une fiche que l’utilisateur vérifie,
// corrige et confirme dans l’application. L’enregistrement passe ensuite par les adresses habituelles
// (/api/business/…), avec les mêmes contrôles que les formulaires. Rien n’est écrit par le modèle.

/** Déclarations transmises au modèle (format OpenAPI simplifié de Gemini). */
export const ASSISTANT_FUNCTIONS = [
  {
    name: 'proposer_creation_produit',
    description: 'Prépare une fiche de nouveau produit, que le commerçant vérifiera puis confirmera. À utiliser seulement quand il demande d’enregistrer un produit qui n’existe pas encore. Ne jamais inventer un prix ni une quantité : ne remplis que ce que le commerçant a donné.',
    parameters: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Nom du produit, court et précis (marque, contenance), par exemple « Riz parfumé 25 kg ».' },
        unite: { type: 'string', description: 'Unité de vente : pièce, sac, kg, litre, carton, paquet…' },
        prix_achat: { type: 'integer', description: 'Prix d’achat unitaire en francs, donné par le commerçant.' },
        prix_vente: { type: 'integer', description: 'Prix de vente unitaire en francs, donné par le commerçant.' },
        quantite_initiale: { type: 'number', description: 'Quantité en stock aujourd’hui, donnée par le commerçant.' },
        seuil_alerte: { type: 'number', description: 'Quantité à partir de laquelle prévenir, si le commerçant l’a donnée.' },
      },
      required: ['nom'],
    },
  },
  {
    name: 'proposer_mouvement_stock',
    description: 'Prépare une fiche de mouvement de stock pour un produit existant (liste des produits dans les données du commerce), que le commerçant vérifiera puis confirmera. Ne sert pas aux ventes.',
    parameters: {
      type: 'object',
      properties: {
        produit: { type: 'string', description: 'Nom du produit, tel qu’il figure dans la liste des produits du commerce.' },
        type: { type: 'string', enum: ['achat', 'retour', 'perte', 'inventaire'], description: 'achat : marchandise reçue ; retour : rapportée par un client ; perte : casse, vol, péremption ; inventaire : quantité réellement comptée.' },
        quantite: { type: 'number', description: 'Quantité du mouvement ; pour un inventaire, la quantité comptée.' },
        cout_unitaire: { type: 'integer', description: 'Pour un achat, coût unitaire en francs s’il a été donné.' },
        note: { type: 'string', description: 'Précision utile (fournisseur, motif de la perte…).' },
      },
      required: ['produit', 'type', 'quantite'],
    },
  },
]

const MAX_PROPOSALS = 10
const movementKinds = /** @type {Record<string, string>} */ ({ achat: 'purchase', retour: 'return', perte: 'loss', inventaire: 'count' })

/** @param {unknown} value @param {number} max */
const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)
/** Montant entier positif, sinon vide (à compléter dans la fiche). @param {unknown} value */
const amount = (value) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000_000 ? value : null)
/** Quantité positive, trois décimales au plus, sinon vide. @param {unknown} value */
const quantity = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000 ? Math.round(value * 1000) / 1000 : null)

/** Forme comparable d’un nom de produit (casse, accents et espaces ignorés). @param {string} name */
export const normalizeName = (name) => name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Retrouve le produit désigné par le modèle : nom identique, sinon un seul produit qui le contient
 * (ou qu’il contient). Ambigu ou introuvable : null, et l’utilisateur choisit dans la fiche.
 * @param {string} name @param {Array<{ id: string, name: string }>} products
 */
export function matchProduct(name, products) {
  // Comparaison sans espaces : « 25kg » et « 25 kg » désignent le même produit.
  const compact = (/** @type {string} */ value) => normalizeName(value).replace(/ /g, '')
  const wanted = compact(name)
  if (!wanted) return null
  const exact = products.filter((product) => compact(product.name) === wanted)
  if (exact.length === 1) return exact[0]
  const partial = products.filter((product) => {
    const candidate = compact(product.name)
    return candidate.includes(wanted) || wanted.includes(candidate)
  })
  return partial.length === 1 ? partial[0] : null
}

/**
 * @typedef {{ id: string, action: 'create_product', values: { name: string, unit: string | null, purchasePrice: number | null, salePrice: number | null, initialQuantity: number | null, alertThreshold: number | null } }} ProductProposal
 * @typedef {{ id: string, action: 'stock_movement', values: { productId: string | null, productName: string, kind: string, quantity: number | null, unitCost: number | null, note: string | null } }} MovementProposal
 * @typedef {ProductProposal | MovementProposal} Proposal
 */

/**
 * Transforme les demandes d’action du modèle en fiches à confirmer ; les valeurs douteuses restent vides.
 * @param {Array<{ name: string, args: Record<string, unknown> }>} calls
 * @param {Array<{ id: string, name: string }>} products
 * @param {() => string} newId
 * @returns {Proposal[]}
 */
export function toProposals(calls, products, newId) {
  /** @type {Proposal[]} */
  const proposals = []
  for (const { name, args } of calls.slice(0, MAX_PROPOSALS)) {
    if (name === 'proposer_creation_produit') {
      const productName = text(args.nom, 120)
      if (!productName) continue
      proposals.push({
        id: newId(),
        action: 'create_product',
        values: {
          name: productName,
          unit: text(args.unite, 24),
          purchasePrice: amount(args.prix_achat),
          salePrice: amount(args.prix_vente),
          initialQuantity: quantity(args.quantite_initiale),
          alertThreshold: quantity(args.seuil_alerte),
        },
      })
    }
    if (name === 'proposer_mouvement_stock') {
      const productName = text(args.produit, 120)
      const kind = typeof args.type === 'string' ? movementKinds[args.type] : undefined
      if (!productName || !kind) continue
      proposals.push({
        id: newId(),
        action: 'stock_movement',
        values: {
          productId: matchProduct(productName, products)?.id ?? null,
          productName,
          kind,
          quantity: quantity(args.quantite),
          unitCost: kind === 'purchase' ? amount(args.cout_unitaire) : null,
          note: text(args.note, 500),
        },
      })
    }
  }
  return proposals
}
