import type { ResponseLanguage } from '../domain/types'

export type Verdict = 'correct' | 'partial' | 'incorrect'

export interface EvaluationItem {
  id: string
  question: string
  expected?: string
  responseLanguage?: ResponseLanguage
  answer?: string
  answeredAt?: string
  error?: string
  verdict?: Verdict
  comment?: string
}

export const verdictLabels: Record<Verdict, string> = {
  correct: 'Correcte',
  partial: 'Partiellement correcte',
  incorrect: 'Incorrecte',
}

const responseLanguages: ResponseLanguage[] = ['auto', 'moore-standard', 'moore-informal', 'french', 'english']
const headers = ['id', 'question', 'reponse_attendue', 'langue_de_reponse'] as const

/** Modèle à remplir par les locuteurs : uniquement des emplacements, aucune phrase en mooré inventée. */
export function templateCsv() {
  return toCsv([
    [...headers],
    ['1', '[Votre question en mooré]', '[Réponse attendue — facultatif]', 'moore-standard'],
    ['2', '[Une question en français à laquelle Gilli doit répondre en mooré]', '', 'moore-standard'],
    ['3', '[Une question en mooré écrite de façon informelle]', '', 'auto'],
  ])
}

/** Lecture CSV tolérante : séparateur « ; » ou « , » détecté, guillemets, retours à la ligne dans les cellules, BOM. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const firstLine = source.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"'
        index++
      } else if (character === '"') {
        quoted = false
      } else {
        cell += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === delimiter) {
      row.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }
  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((value) => value.trim()))
}

/** CSV pour Excel en français : séparateur « ; », BOM UTF-8 pour garder les accents et les lettres du mooré. */
export function toCsv(rows: string[][]) {
  const escape = (value: string) => (/[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
  return `\uFEFF${rows.map((row) => row.map(escape).join(';')).join('\r\n')}\r\n`
}

/** Transforme le tableau importé en questions ; la ligne d’en-tête est reconnue par ses noms de colonnes. */
export function itemsFromCsv(text: string): { items: EvaluationItem[]; problems: string[] } {
  const rows = parseCsv(text)
  const problems: string[] = []
  if (rows.length === 0) return { items: [], problems: ['Le fichier est vide.'] }
  const header = rows[0].map((cell) => cell.trim().toLowerCase())
  const hasHeader = header.includes('question')
  const column = (name: string, fallback: number) => (hasHeader ? header.indexOf(name) : fallback)
  const [idColumn, questionColumn, expectedColumn, languageColumn] = [column('id', 0), column('question', 1), column('reponse_attendue', 2), column('langue_de_reponse', 3)]
  const items: EvaluationItem[] = []
  for (const [index, row] of rows.slice(hasHeader ? 1 : 0).entries()) {
    const question = row[questionColumn]?.trim()
    if (!question || /^\[.*\]$/.test(question)) continue
    const language = row[languageColumn]?.trim() as ResponseLanguage | undefined
    if (language && !responseLanguages.includes(language)) problems.push(`Ligne ${index + 2} : langue « ${language} » inconnue, « auto » utilisée.`)
    items.push({
      id: row[idColumn]?.trim() || String(items.length + 1),
      question,
      expected: row[expectedColumn]?.trim() || undefined,
      responseLanguage: language && responseLanguages.includes(language) ? language : undefined,
    })
  }
  if (items.length === 0) problems.push('Aucune question trouvée : remplissez la colonne « question » (les lignes d’exemple entre crochets sont ignorées).')
  return { items, problems }
}

export function resultsCsv(items: EvaluationItem[], engineLabel: string) {
  return toCsv([
    ['id', 'question', 'reponse_attendue', 'langue_de_reponse', 'reponse_obtenue', 'verdict', 'commentaire', 'moteur', 'date'],
    ...items.map((item) => [
      item.id,
      item.question,
      item.expected ?? '',
      item.responseLanguage ?? 'auto',
      item.error ? `[Erreur] ${item.error}` : item.answer ?? '',
      item.verdict ? verdictLabels[item.verdict] : '',
      item.comment ?? '',
      engineLabel,
      item.answeredAt ?? '',
    ]),
  ])
}

export function summarize(items: EvaluationItem[]) {
  const rated = items.filter((item) => item.verdict)
  const count = (verdict: Verdict) => rated.filter((item) => item.verdict === verdict).length
  return {
    total: items.length,
    answered: items.filter((item) => item.answer !== undefined).length,
    rated: rated.length,
    correct: count('correct'),
    partial: count('partial'),
    incorrect: count('incorrect'),
  }
}

const storageKey = 'gilli.evaluation.v1'

export function loadEvaluation(): EvaluationItem[] {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown
    return Array.isArray(stored) ? stored.filter((item): item is EvaluationItem => typeof item?.id === 'string' && typeof item?.question === 'string') : []
  } catch {
    return []
  }
}

export function saveEvaluation(items: EvaluationItem[]) {
  try {
    if (items.length === 0) localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, JSON.stringify(items))
  } catch {
    // Stockage indisponible : l’évaluation reste disponible jusqu’à la fermeture de la page.
  }
}

export function downloadText(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
