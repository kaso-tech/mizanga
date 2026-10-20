import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AiChunk, AiService } from '../domain/services'
import { defaultPreferences } from '../domain/types'
import { useConversation } from './useConversation'

/** Service factice : renvoie les fragments donnés, ou attend une annulation si `hang` est vrai. */
function fakeService({ chunks = ['Bonjour', ' à vous'], hang = false, fail = false } = {}): AiService {
  return {
    isDemonstration: false,
    label: 'Test',
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

  it('garde les versions précédentes d’une réponse régénérée et permet d’y revenir', async () => {
    let call = 0
    const service: AiService = {
      isDemonstration: false,
      label: 'Test',
      async *generate() {
        call++
        if (call === 3) throw new Error('panne')
        yield { text: `Version ${call}` }
      },
    }
    const { result } = setup(service)
    act(() => result.current.send('Question'))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    act(() => result.current.rate(result.current.messages[1].id, 'positive'))

    act(() => result.current.regenerate())
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    expect(result.current.messages[1]).toMatchObject({ content: 'Version 2', versionIndex: 1 })
    expect(result.current.messages[1].versions).toHaveLength(2)

    // Retour à la première version : son avis est conservé.
    act(() => result.current.selectVersion(result.current.messages[1].id, 0))
    expect(result.current.messages[1]).toMatchObject({ content: 'Version 1', rating: 'positive', versionIndex: 0 })

    // Un échec de régénération reste une version consultable, sans effacer les précédentes.
    act(() => result.current.regenerate())
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    expect(result.current.messages[1]).toMatchObject({ content: '', status: 'error', versionIndex: 2 })
    act(() => result.current.selectVersion(result.current.messages[1].id, 1))
    expect(result.current.messages[1]).toMatchObject({ content: 'Version 2', status: 'complete' })
    expect(result.current.messages[1].versions?.map((version) => version.content)).toEqual(['Version 1', 'Version 2', ''])
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

  it('modifie le dernier message et relance la réponse', async () => {
    const { result } = setup(fakeService())
    act(() => result.current.send('Premièr messag'))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))

    act(() => result.current.editLastUserMessage('Premier message'))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    expect(result.current.messages.map((message) => message.content)).toEqual(['Premier message', 'Bonjour à vous'])
  })

  it('demande un titre au moteur après le premier échange réussi', async () => {
    const service = { ...fakeService(), suggestTitle: vi.fn().mockResolvedValue('Titre proposé') }
    const { result } = setup(service)
    act(() => result.current.send('Une longue question sur la photosynthèse'))
    await waitFor(() => expect(result.current.activeConversation?.title).toBe('Titre proposé'))
    expect(service.suggestTitle).toHaveBeenCalledWith('Une longue question sur la photosynthèse')

    act(() => result.current.send('Suite'))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    expect(service.suggestTitle).toHaveBeenCalledTimes(1)
  })

  it('demande la recherche web pour le message concerné et enregistre les sources', async () => {
    const generate = vi.fn(async function* (request: { webSearch?: boolean }) {
      yield { text: 'Réponse' }
      if (request.webSearch) yield { text: '', sources: [{ title: 'Source', url: 'https://exemple.bf' }], searchSuggestionsHtml: '<b>chips</b>' }
    })
    const { result } = setup({ isDemonstration: false, label: 'Test', generate })
    act(() => result.current.send('Actualités', [], { webSearch: true }))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    expect(generate.mock.calls[0][0]).toMatchObject({ webSearch: true })
    expect(result.current.messages[0].webSearch).toBe(true)
    expect(result.current.messages[1]).toMatchObject({ content: 'Réponse', sources: [{ title: 'Source', url: 'https://exemple.bf' }], searchSuggestionsHtml: '<b>chips</b>' })

    act(() => result.current.regenerate())
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    expect(generate.mock.calls[1][0]).toMatchObject({ webSearch: true })
  })

  it('renomme une conversation en ignorant les titres vides', async () => {
    const { result } = setup(fakeService())
    act(() => result.current.send('Question'))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    const id = result.current.activeConversation!.id
    act(() => result.current.rename(id, '  Mon titre  '))
    expect(result.current.activeConversation?.title).toBe('Mon titre')
    act(() => result.current.rename(id, '   '))
    expect(result.current.activeConversation?.title).toBe('Mon titre')
  })
})
