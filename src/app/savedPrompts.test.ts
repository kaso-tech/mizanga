import { describe, expect, it } from 'vitest'
import { MAX_SAVED_PROMPTS, addSavedPrompt, filterSavedPrompts, loadSavedPrompts, promptTitle, storeSavedPrompts } from './savedPrompts'

describe('savedPrompts', () => {
  it('ajoute une consigne en tête avec un titre tiré de sa première ligne', () => {
    const { prompts } = addSavedPrompt([], '  Résume ce texte en 5 points\npuis propose un titre  ')
    expect(prompts[0]).toMatchObject({ title: 'Résume ce texte en 5 points', prompt: 'Résume ce texte en 5 points\npuis propose un titre' })
    expect(addSavedPrompt(prompts, 'Autre', 'Mon titre').prompts.map((item) => item.title)).toEqual(['Mon titre', 'Résume ce texte en 5 points'])
  })

  it('refuse une consigne vide, en double ou au-delà de la limite', () => {
    const { prompts } = addSavedPrompt([], 'A')
    expect(addSavedPrompt(prompts, '   ').problem).toBe('empty')
    expect(addSavedPrompt(prompts, ' A ').problem).toBe('duplicate')
    const full = Array.from({ length: MAX_SAVED_PROMPTS }, (_, index) => ({ id: `${index}`, title: `${index}`, prompt: `${index}` }))
    expect(addSavedPrompt(full, 'Nouvelle').problem).toBe('full')
  })

  it('raccourcit les titres trop longs', () => {
    expect(promptTitle('a'.repeat(100))).toHaveLength(60)
  })

  it('filtre sans tenir compte des accents', () => {
    const prompts = [{ id: '1', title: 'Courrier', prompt: 'Rédige une lettre' }, { id: '2', title: 'Résumé', prompt: 'Résume' }]
    expect(filterSavedPrompts(prompts, 'resum').map((item) => item.id)).toEqual(['2'])
    expect(filterSavedPrompts(prompts, 'REDIGE').map((item) => item.id)).toEqual(['1'])
    expect(filterSavedPrompts(prompts, '')).toHaveLength(2)
  })

  it('enregistre et relit les consignes en ignorant les entrées invalides', () => {
    storeSavedPrompts([{ id: '1', title: 'T', prompt: 'P' }])
    expect(loadSavedPrompts()).toEqual([{ id: '1', title: 'T', prompt: 'P' }])
    localStorage.setItem('mizanga.prompts.v1', JSON.stringify([{ id: 2 }, null, { id: '3', title: 'T', prompt: ' ' }]))
    expect(loadSavedPrompts()).toEqual([])
  })
})
