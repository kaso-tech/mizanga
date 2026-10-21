// Vérifie la référence du mooré avant envoi : `pnpm moore:check [dossier]`.
// Affiche ce qui sera transmis au moteur et les problèmes à corriger ; code de sortie 1 s’il y en a.
import { buildReferenceText, DEFAULT_REFERENCE_DIR, MAX_REFERENCE_CHARS, readReference } from './moore-reference.mjs'

const dir = process.argv[2] ?? DEFAULT_REFERENCE_DIR
const reference = readReference(dir)
const { text, omittedExamples, omittedEntries } = buildReferenceText(reference)
const plural = (/** @type {number} */ count, /** @type {string} */ word) => `${count} ${word}${count > 1 ? 's' : ''}`

console.log(`Référence du mooré — ${dir}\n`)
console.log(`  Fiche de règles : ${reference.sheet ? `${reference.sheet.length.toLocaleString('fr')} caractères` : 'vide (aucune règle écrite hors commentaires)'}`)
console.log(`  Exemples validés : ${reference.examples.length}`)
console.log(`  Mots validés : ${reference.entries.length}`)
console.log(`  En attente : ${plural(reference.counts.draft, 'brouillon')}, ${reference.counts.review} à relire ; ${plural(reference.counts.rejected, 'rejet')}`)
console.log(`  Envoyé au moteur à chaque demande : ${text.length.toLocaleString('fr')} / ${MAX_REFERENCE_CHARS.toLocaleString('fr')} caractères`)

const problems = [...reference.problems]
if (omittedExamples || omittedEntries) {
  problems.push(`Taille dépassée : ${plural(omittedExamples, 'exemple')} et ${plural(omittedEntries, 'mot')} ne seront pas envoyés. Raccourcissez la fiche ou passez à une recherche dans la base (voir LISEZMOI.md).`)
}

if (problems.length === 0) {
  console.log('\nAucun problème.')
} else {
  console.log(`\n${plural(problems.length, 'problème')} :`)
  for (const problem of problems) console.log(`  - ${problem}`)
  process.exitCode = 1
}
