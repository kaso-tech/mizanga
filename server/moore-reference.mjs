// Référence du mooré validée par des locuteurs (server/knowledge/moore/) : fiche de règles, exemples
// et lexique, transmis au moteur avec chaque demande. Seuls les contenus validés sont envoyés.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_REFERENCE_DIR = fileURLToPath(new URL('./knowledge/moore', import.meta.url))
/** Taille maximale de la référence envoyée (≈ 6 000 jetons), pour préserver le quota et l’attention du moteur. */
export const MAX_REFERENCE_CHARS = 24_000

/**
 * @typedef {{ question: string, reponse: string, contexte: string }} ReferenceExample
 * @typedef {{ francais: string, moore: string, categorie: string, exemple: string, traduction: string, remarque: string }} LexiconEntry
 * @typedef {{ sheet: string, examples: ReferenceExample[], entries: LexiconEntry[], problems: string[], counts: { draft: number, review: number, rejected: number } }} MooreReference
 */

/**
 * Lit un CSV (séparateur « ; » ou « , » détecté sur la première ligne, guillemets, cellules sur
 * plusieurs lignes, BOM UTF-8 d’Excel).
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, '')
  const firstLine = source.split(/\r?\n/, 1)[0] ?? ''
  const separator = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  /** @type {string[][]} */
  const rows = []
  /** @type {string[]} */
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"'
        index++
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"' && cell === '') {
      quoted = true
    } else if (char === separator) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''))
}

/** « Validé », « valide », « VALIDÉ »… : sans accents ni casse. */
const normalizeStatus = (/** @type {string} */ value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const STATUSES = new Set(['brouillon', 'a relire', 'valide', 'rejete', 'modele'])

/**
 * Lignes d’un CSV de référence, sous forme d’objets indexés par les noms de colonnes.
 * @param {string} text @param {string[]} required @param {string} fileName @param {string[]} problems
 */
function readTable(text, required, fileName, problems) {
  // Fichier absent ou vide : rien à lire, ce n’est pas une erreur.
  if (!text.trim()) return []
  const [header = [], ...rows] = parseCsv(text)
  const columns = header.map((name) => normalizeStatus(name).replace(/\s+/g, '_'))
  const missing = required.filter((name) => !columns.includes(name))
  if (missing.length > 0) {
    problems.push(`${fileName} : colonnes manquantes (${missing.join(', ')}).`)
    return []
  }
  return rows.map((cells, index) => {
    /** @type {Record<string, string>} */
    const record = { _line: String(index + 2) }
    columns.forEach((name, column) => { record[name] = (cells[column] ?? '').trim() })
    return record
  })
}

/** Retire les commentaires HTML et les sections restées vides de la fiche. @param {string} markdown */
export function cleanSheet(markdown) {
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, '')
  const sections = withoutComments.split(/^(?=#{1,6}\s)/m)
  const kept = sections.filter((section) => section.replace(/^#{1,6}\s.*$/m, '').trim() !== '')
  // Le titre seul (« # Fiche… ») ne suffit pas : sans contenu, rien n’est envoyé.
  return kept.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Lit la référence d’un dossier. Un fichier absent est simplement ignoré.
 * @param {string} dir
 * @returns {MooreReference}
 */
export function readReference(dir = DEFAULT_REFERENCE_DIR) {
  /** @type {string[]} */
  const problems = []
  const counts = { draft: 0, review: 0, rejected: 0 }
  const read = (/** @type {string} */ name) => {
    try {
      return readFileSync(join(dir, name), 'utf8')
    } catch {
      return ''
    }
  }

  const sheet = cleanSheet(read('fiche.md'))

  /** @param {Record<string, string>[]} rows @param {string} fileName @param {(row: Record<string, string>) => string | null} check */
  const validated = (rows, fileName, check) => rows.filter((row) => {
    const status = normalizeStatus(row.statut ?? '')
    if (!STATUSES.has(status)) {
      problems.push(`${fileName}, ligne ${row._line} : statut « ${row.statut} » inconnu (brouillon, à relire, validé, rejeté).`)
      return false
    }
    if (status === 'brouillon') counts.draft++
    if (status === 'a relire') counts.review++
    if (status === 'rejete') counts.rejected++
    if (status !== 'valide') return false
    const problem = check(row)
    if (problem) {
      problems.push(`${fileName}, ligne ${row._line} : ${problem}`)
      return false
    }
    if (!row.valide_par) problems.push(`${fileName}, ligne ${row._line} : validée sans relecteur (colonne valide_par).`)
    return true
  })

  const examples = validated(readTable(read('exemples.csv'), ['statut', 'question', 'reponse'], 'exemples.csv', problems), 'exemples.csv', (row) => (
    !row.question || !row.reponse ? 'question ou réponse vide.' : null
  )).map((row) => ({ question: row.question, reponse: row.reponse, contexte: row.contexte ?? '' }))

  /** @type {Set<string>} */
  const seen = new Set()
  const entries = validated(readTable(read('lexique.csv'), ['statut', 'francais', 'moore'], 'lexique.csv', problems), 'lexique.csv', (row) => {
    if (!row.francais || !row.moore) return 'mot français ou mooré vide.'
    const key = `${normalizeStatus(row.francais)}→${row.moore}`
    if (seen.has(key)) return `« ${row.francais} → ${row.moore} » est en double.`
    seen.add(key)
    return null
  }).map((row) => ({
    francais: row.francais,
    moore: row.moore,
    categorie: row.categorie ?? '',
    exemple: row.exemple_moore ?? '',
    traduction: row.traduction_exemple ?? '',
    remarque: row.remarque ?? '',
  }))

  return { sheet, examples, entries, problems, counts }
}

/**
 * Texte ajouté aux consignes du moteur : fiche, puis exemples, puis lexique, dans la limite de taille.
 * Renvoie aussi ce qui n’a pas pu être envoyé.
 * @param {MooreReference} reference @param {number} [maxChars]
 */
export function buildReferenceText(reference, maxChars = MAX_REFERENCE_CHARS) {
  /** @type {string[]} */
  const parts = []
  let length = 0
  let omittedExamples = 0
  let omittedEntries = 0
  const add = (/** @type {string} */ text) => {
    if (length + text.length + 1 > maxChars) return false
    parts.push(text)
    length += text.length + 1
    return true
  }

  if (reference.sheet) add(`### Règles\n${reference.sheet}`)
  if (reference.examples.length > 0) {
    add('### Exemples de réponses validées (à imiter pour la langue, pas à recopier)')
    for (const example of reference.examples) {
      const block = `Question : ${example.question}${example.contexte ? ` (contexte : ${example.contexte})` : ''}\nRéponse : ${example.reponse}`
      if (!add(block)) omittedExamples++
    }
  }
  if (reference.entries.length > 0) {
    add('### Lexique validé (français → mooré)')
    for (const entry of reference.entries) {
      const details = [
        entry.categorie,
        entry.exemple ? `ex. : ${entry.exemple}${entry.traduction ? ` = ${entry.traduction}` : ''}` : '',
        entry.remarque,
      ].filter(Boolean).join(' ; ')
      if (!add(`- ${entry.francais} → ${entry.moore}${details ? ` (${details})` : ''}`)) omittedEntries++
    }
  }
  return { text: parts.join('\n'), omittedExamples, omittedEntries }
}

/**
 * Chargeur avec relecture automatique : les fichiers modifiés sont relus (vérification au plus
 * toutes les `checkEveryMs`), sans redémarrer le serveur.
 * @param {string} [dir] @param {{ checkEveryMs?: number, now?: () => number }} [options]
 */
export function createReferenceLoader(dir = DEFAULT_REFERENCE_DIR, { checkEveryMs = 5000, now = Date.now } = {}) {
  let signature = ''
  let lastCheck = -Infinity
  /** @type {{ reference: MooreReference, text: string }} */
  let cached = { reference: readReference(dir), text: '' }
  cached.text = buildReferenceText(cached.reference).text

  const currentSignature = () => ['fiche.md', 'exemples.csv', 'lexique.csv'].map((name) => {
    try {
      const { mtimeMs, size } = statSync(join(dir, name))
      return `${mtimeMs}:${size}`
    } catch {
      return '-'
    }
  }).join('|')

  signature = currentSignature()
  return () => {
    if (now() - lastCheck >= checkEveryMs) {
      lastCheck = now()
      const next = currentSignature()
      if (next !== signature) {
        signature = next
        const reference = readReference(dir)
        cached = { reference, text: buildReferenceText(reference).text }
      }
    }
    return cached
  }
}
