import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AiChunk, AiService } from '../domain/services'
import { defaultPreferences } from '../domain/types'
import { useConversation } from './useConversation'

/** Service factice : renvoie les fragments donnés, ou attend une annulation si `hang` est vrai. */
function fakeService({ chunks = ['Bonjour', ' à vous'], hang = false, fail = false } = {}): AiService {
  return {
    isDemonstration: false,
    async *generate(_request, { signal }): AsyncGenerator<AiChunk> {
      if (fail) throw new Error('panne')
      for (const text of chunks) yield { text, language: 'fr' }
      if (hang) {
        await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
      }
    },
  }
}

const setup = (service: AiService) => renderHook(() => useConversation(service, defaultPreferences))

describe('useConversation', () => {
  it('crée une conversation titrée et diffuse la réponse jusqu’à son terme', async () => {
    const { result } = setup(fakeService())
    act(() => result.current.send('Rédige un courrier\nseconde ligne'))

    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.activeConversation?.title).toBe('Rédige un courrier')
    await waitFor(() => expect(result.current.isGenerating).toBe(false))

    const [user, reply] = result.current.messages
    expect(user).toMatchObject({ role: 'user', content: 'Rédige un courrier\nseconde ligne' })
    expect(reply).toMatchObject({ role: 'assistant', content: 'Bonjour à vous', status: 'complete', language: 'fr' })
  })

  it('arrête la génération et garde la réponse partielle', async () => {
    const { result } = setup(fakeService({ hang: true }))
    act(() => result.current.send('Question'))
    await waitFor(() => expect(result.current.messages[1]?.content).toBe('Bonjour à vous'))

    act(() => result.current.stop())
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    expect(result.current.messages[1].status).toBe('stopped')
  })

  it('affiche une erreur quand le service échoue', async () => {
    const { result } = setup(fakeService({ fail: true }))
    act(() => result.current.send('Question'))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant', status: 'error' })
  })

  it('régénère en remplaçant la dernière réponse', async () => {
    const { result } = setup(fakeService())
    act(() => result.current.send('Question'))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    const firstReplyId = result.current.messages[1].id

    act(() => result.current.regenerate())
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1].id).not.toBe(firstReplyId)
  })

  it('gère avis, favoris, suppression et effacement complet', async () => {
    const { result } = setup(fakeService())
    act(() => result.current.send('Première'))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    const replyId = result.current.messages[1].id

    act(() => result.current.rate(replyId, 'correct'))
    expect(result.current.messages[1].rating).toBe('correct')
    act(() => result.current.rate(replyId, 'correct'))
    expect(result.current.messages[1].rating).toBeUndefined()

    const firstId = result.current.activeConversation!.id
    act(() => result.current.toggleFavorite(firstId))
    expect(result.current.conversations[0].favorite).toBe(true)

    act(() => result.current.startNew())
    act(() => result.current.send('Seconde'))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    expect(result.current.conversations.map((conversation) => conversation.title)).toEqual(['Seconde', 'Première'])

    act(() => result.current.remove(firstId))
    expect(result.current.conversations.map((conversation) => conversation.title)).toEqual(['Seconde'])

    act(() => result.current.clearAll())
    expect(result.current.conversations).toEqual([])
    expect(result.current.activeConversation).toBeUndefined()
  })
})
