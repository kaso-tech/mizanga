// Contrôle automatique gratuit des annonces : mots interdits (y compris déguisés : accents, chiffres à la
// place des lettres, lettres espacées) et texte incompréhensible. Une suspicion n’entraîne pas un refus :
// l’annonce part en vérification humaine. Les listes suivent les produits interdits des conditions
// d’utilisation (src/components/TermsView.tsx) et doivent évoluer avec elles.

/** Groupes de produits interdits ; chaque motif est comparé au texte normalisé, mot par mot. */
export const FORBIDDEN_GROUPS = [
  {
    id: 'armes', label: 'armes, munitions ou explosifs',
    terms: ['arme a feu', 'armes a feu', 'pistolet', 'revolver', 'fusil', 'kalachnikov', 'kalach', 'ak47', 'ak 47', 'munition', 'munitions', 'balles reelles', 'grenade', 'grenades', 'explosif', 'explosifs', 'dynamite', 'detonateur', 'arme de guerre', 'gun', 'guns', 'rifle', 'ammo', 'calibre 12'],
  },
  {
    id: 'drogues', label: 'drogues ou stupéfiants',
    terms: ['drogue', 'drogues', 'cannabis', 'marijuana', 'weed', 'haschich', 'hasch', 'chanvre indien', 'beuh', 'kush', 'cocaine', 'coke pure', 'crack', 'heroine', 'ecstasy', 'mdma', 'lsd', 'methamphetamine', 'opium', 'stupefiant', 'stupefiants'],
  },
  {
    id: 'medicaments', label: 'médicaments',
    terms: ['tramadol', 'codeine', 'morphine', 'medicament', 'medicaments', 'sans ordonnance', 'antibiotique', 'antibiotiques', 'viagra', 'comprimes'],
  },
  {
    id: 'personnes', label: 'êtres humains, organes ou services sexuels',
    terms: ['esclave', 'esclaves', 'enfant a vendre', 'bebe a vendre', 'fille a vendre', 'femme a vendre', 'rein a vendre', 'organe', 'organes', 'prostitution', 'escort', 'escorte', 'services sexuels', 'trafic d enfants', 'adoption payante'],
  },
  {
    id: 'faune', label: 'espèces protégées (ivoire, pangolin…)',
    terms: ['ivoire', 'defense d elephant', 'pangolin', 'ecailles de pangolin', 'peau de leopard', 'peau de lion', 'corne de rhinoceros', 'tete de lion'],
  },
  {
    id: 'faux', label: 'faux documents, faux billets ou arnaques',
    terms: ['faux billets', 'faux billet', 'billets noirs', 'billet noir', 'multiplication de billets', 'multiplicateur d argent', 'faux papiers', 'faux passeport', 'fausse carte', 'faux diplome', 'faux diplomes', 'argent facile', 'carte bancaire cvv', 'cvv', 'compte pirate', 'comptes pirates'],
  },
  {
    id: 'vol-contrefacon', label: 'objets volés ou contrefaçons',
    terms: ['sans papiers', 'objet vole', 'vole', 'replique', 'copie conforme', 'contrefacon'],
  },
  {
    id: 'adulte', label: 'contenu pour adultes',
    terms: ['porno', 'pornographie', 'xxx', 'sextape', 'sex tape'],
  },
  {
    id: 'dangereux', label: 'produits dangereux interdits',
    terms: ['cyanure', 'mercure', 'poison', 'mort aux rats artisanal'],
  },
]

/** Chiffres et symboles souvent utilisés pour déguiser un mot (« c0ca1ne », « dr@gue »). */
const disguises = /** @type {Record<string, string>} */ ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '€': 'e', '!': 'i' })

/** Minuscules, sans accents, ponctuation en espaces. @param {string} text */
export const normalize = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').replace(/[^a-z0-9@$€!]+/g, ' ').trim()

/** Variante « dédéguisée » : chiffres et symboles remplacés, lettres isolées recollées (« a r m e »). @param {string} normalized */
function undisguise(normalized) {
  const letters = normalized.replace(/[0-9@$€!]/g, (character) => disguises[character] ?? character).replace(/[^a-z ]+/g, ' ')
  return letters.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (spaced) => spaced.replace(/ /g, '')).replace(/\s+/g, ' ').trim()
}

/** Le motif apparaît comme suite de mots entiers. @param {string} haystack @param {string} term */
const containsTerm = (haystack, term) => ` ${haystack} `.includes(` ${term} `)

/**
 * Texte incompréhensible : mots sans voyelle, longues suites de consonnes ou de lettres répétées
 * (« xkcdqwrt », « aaaaaa »). Les mots avec chiffres (modèles, références) et les mots courts sont ignorés.
 * @param {string} normalized
 */
export function looksLikeGibberish(normalized) {
  const words = normalized.split(' ').filter((word) => word.length >= 5 && !/\d/.test(word))
  if (words.length === 0) return false
  const odd = words.filter((word) => !/[aeiouy]/.test(word) || /[bcdfghjklmnpqrstvwxz]{5,}/.test(word) || /(.)\1{3,}/.test(word))
  return odd.length >= 2 || odd.length / words.length > 0.34
}

/**
 * @param {{ title: string, description?: string, attributes?: Record<string, unknown> }} listing
 * @returns {{ suspicious: boolean, reasons: string[] }}
 */
export function checkListingRules({ title, description = '', attributes = {} }) {
  const text = normalize([title, description, ...Object.values(attributes).filter((value) => typeof value === 'string')].join(' '))
  const variants = [text.replace(/[@$€!]/g, ' '), undisguise(text)]
  /** @type {string[]} */
  const reasons = []
  for (const group of FORBIDDEN_GROUPS) {
    const found = group.terms.find((term) => variants.some((variant) => containsTerm(variant, term)))
    if (found) reasons.push(`Mot lié à des produits interdits (${group.label}) : « ${found} ».`)
  }
  if (looksLikeGibberish(normalize(title)) || looksLikeGibberish(normalize(description))) reasons.push('Texte en partie incompréhensible.')
  if (normalize(title).replace(/[^a-z]/g, '').length < 3) reasons.push('Titre sans mot lisible.')
  return { suspicious: reasons.length > 0, reasons }
}
