import { describe, expect, it } from 'vitest'
import { defaultPreferences, type ChatMessage } from '../domain/types'
import { demoAiService } from './demoAiService'

const userMessage = (content: string): ChatMessage => ({ id: 'u1', role: 'user', content, createdAt: '2026-10-20T00:00:00.000Z' })

async function collect(content: string, signal = new AbortController().signal) {
  let text = ''
  const languages = new Set<string | undefined>()
  for await (const chunk of demoAiService.generate({ messages: [userMessage(content)], preferences: defaultPreferences }, { signal })) {
    text += chunk.text
    languages.add(chunk.language)
  }
  return { text, languages }
}

describe('demoAiService', () => {
  it('se présente comme une démonstration', () => {
    expect(demoAiService.isDemonstration).toBe(true)
  })

  it('cite le message de l’utilisateur tel quel, caractères du mooré compris', async () => {
    const { text, languages } = await collect('Première ligne ?\nɛ ɩ ʋ ã ẽ')
    expect(text).toContain('Aucun moteur d’IA n’est encore connecté')
    expect(text).toContain('> Première ligne ?\n> ɛ ɩ ʋ ã ẽ')
    expect(text).toContain('Réponse souhaitée : Automatique')
    expect([...languages]).toEqual(['fr'])
  })

  it('s’arrête avec une AbortError quand la génération est annulée', async () => {
    const controller = new AbortController()
    const pending = collect('Bonjour', controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
