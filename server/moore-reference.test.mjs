// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildReferenceText, cleanSheet, createReferenceLoader, DEFAULT_REFERENCE_DIR, parseCsv, readReference } from './moore-reference.mjs'

// Données fictives : aucun texte en mooré n’est inventé dans les tests.
/** @type {string[]} */
const dirs = []
const makeDir = (/** @type {Record<string, string>} */ files) => {
  const dir = mkdtempSync(join(tmpdir(), 'moore-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('référence du mooré', () => {
  it('les fichiers livrés sont des modèles vides : rien n’est envoyé au moteur', () => {
    const reference = readReference(DEFAULT_REFERENCE_DIR)
    expect(reference).toMatchObject({ sheet: '', examples: [], entries: [], problems: [] })
    expect(buildReferenceText(reference).text).toBe('')
    expect(readFileSync(join(DEFAULT_REFERENCE_DIR, 'fiche.md'), 'utf8')).toContain('## Orthographe')
  })

  it('lit un CSV d’Excel : BOM, « ; », guillemets et cellules sur plusieurs lignes', () => {
    expect(parseCsv('\uFEFFa;b\n"x; y";"ligne 1\nligne 2"\r\n\n"dit ""oui""";z')).toEqual([['a', 'b'], ['x; y', 'ligne 1\nligne 2'], ['dit "oui"', 'z']])
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('ne garde de la fiche que le texte écrit hors commentaires, sans les sections vides', () => {
    expect(cleanSheet('# Fiche\n<!-- consigne -->\n## Vide\n<!-- à remplir -->\n## Orthographe\nRègle A.\n<!-- note -->')).toBe('## Orthographe\nRègle A.')
  })

  it('n’envoie que les lignes validées et signale les problèmes', () => {
    const dir = makeDir({
      'fiche.md': '## Règles\nRègle de test.',
      'exemples.csv': 'statut;question;reponse;contexte;valide_par\nValidé;Q1;R1;;AB\nbrouillon;Q2;R2;;\nvalidé;Q3;;;AB\nà relire;Q4;R4;;',
      'lexique.csv': 'statut;francais;moore;categorie;exemple_moore;traduction_exemple;remarque;valide_par\nvalidé;eau;mot-1;vie courante;phrase-1;phrase 1;;AB\nvalidé;eau;mot-1;;;;;AB\nvalidé;pain;mot-2;;;;;\npeut-être;sel;mot-3;;;;;AB\nrejeté;riz;mot-4;;;;;AB',
    })
    const reference = readReference(dir)
    expect(reference.examples).toEqual([{ question: 'Q1', reponse: 'R1', contexte: '' }])
    expect(reference.entries.map((entry) => entry.moore)).toEqual(['mot-1', 'mot-2'])
    expect(reference.counts).toEqual({ draft: 1, review: 1, rejected: 1 })
    expect(reference.problems).toEqual([
      'exemples.csv, ligne 4 : question ou réponse vide.',
      'lexique.csv, ligne 3 : « eau → mot-1 » est en double.',
      'lexique.csv, ligne 4 : validée sans relecteur (colonne valide_par).',
      'lexique.csv, ligne 5 : statut « peut-être » inconnu (brouillon, à relire, validé, rejeté).',
    ])

    const { text } = buildReferenceText(reference)
    expect(text).toContain('### Règles\n## Règles\nRègle de test.')
    expect(text).toContain('Question : Q1\nRéponse : R1')
    expect(text).toContain('- eau → mot-1 (vie courante ; ex. : phrase-1 = phrase 1)')
  })

  it('signale les colonnes manquantes', () => {
    expect(readReference(makeDir({ 'lexique.csv': 'statut;mot\nvalidé;x' })).problems).toEqual(['lexique.csv : colonnes manquantes (francais, moore).'])
  })

  it('respecte la taille maximale et compte ce qui n’est pas envoyé', () => {
    const entries = Array.from({ length: 50 }, (_, index) => ({ francais: `mot ${index}`, moore: `m-${index}`, categorie: '', exemple: '', traduction: '', remarque: '' }))
    const result = buildReferenceText({ sheet: '', examples: [], entries, problems: [], counts: { draft: 0, review: 0, rejected: 0 } }, 300)
    expect(result.text.length).toBeLessThanOrEqual(300)
    expect(result.omittedEntries).toBeGreaterThan(0)
  })

  it('relit les fichiers modifiés sans redémarrage', () => {
    const dir = makeDir({ 'fiche.md': '## A\nPremière version.' })
    let clock = 0
    const load = createReferenceLoader(dir, { checkEveryMs: 1000, now: () => clock })
    expect(load().text).toContain('Première version.')
    writeFileSync(join(dir, 'fiche.md'), '## A\nSeconde version, plus longue.')
    clock = 500
    expect(load().text).toContain('Première version.')
    clock = 2000
    expect(load().text).toContain('Seconde version, plus longue.')
  })
})
