import { describe, expect, it } from 'vitest'
import { itemsFromCsv, parseCsv, resultsCsv, summarize, templateCsv } from './evaluation'

describe('evaluation', () => {
  it('lit un CSV « ; » d’Excel avec BOM, guillemets et retours à la ligne', () => {
    const csv = '﻿id;question;reponse_attendue;langue_de_reponse\r\n1;"Question ɛ ; avec ""guillemets""";"ligne 1\nligne 2";moore-standard\r\n'
    expect(parseCsv(csv)).toEqual([
      ['id', 'question', 'reponse_attendue', 'langue_de_reponse'],
      ['1', 'Question ɛ ; avec "guillemets"', 'ligne 1\nligne 2', 'moore-standard'],
    ])
  })

  it('accepte aussi les virgules et ignore les lignes d’exemple du modèle', () => {
    expect(itemsFromCsv(templateCsv()).items).toEqual([])
    const { items, problems } = itemsFromCsv('id,question,langue_de_reponse\nA,Bonjour ʋ,klingon\nB,Deuxième,french\n')
    expect(items).toEqual([
      { id: 'A', question: 'Bonjour ʋ', expected: undefined, responseLanguage: undefined },
      { id: 'B', question: 'Deuxième', expected: undefined, responseLanguage: 'french' },
    ])
    expect(problems[0]).toContain('klingon')
  })

  it('exporte les résultats et calcule le résumé', () => {
    const items = [
      { id: '1', question: 'Q1', answer: 'R1', verdict: 'correct' as const, comment: 'ok; parfait' },
      { id: '2', question: 'Q2', error: 'Quota atteint.' },
      { id: '3', question: 'Q3', answer: 'R3', verdict: 'incorrect' as const },
    ]
    const csv = resultsCsv(items, 'Gemini')
    expect(csv.startsWith('﻿id;question;reponse_attendue')).toBe(true)
    expect(csv).toContain('1;Q1;;auto;R1;Correcte;"ok; parfait";Gemini;')
    expect(csv).toContain('[Erreur] Quota atteint.')
    expect(summarize(items)).toEqual({ total: 3, answered: 2, rated: 2, correct: 1, partial: 0, incorrect: 1 })
  })
})
