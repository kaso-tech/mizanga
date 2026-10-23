import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiChunk, AiService } from '../domain/services'
import { defaultPreferences, type Conversation, type ConversationSummary } from '../domain/types'
import type { ConversationsApi, ConversationUpload, StoredConversation } from '../services/conversationsApi'
import { useAccountConversations } from './useAccountConversations'
import { useConversation } from './useConversation'

const service: AiService = {
  isDemonstration: false,
  label: 'Test',
  async *generate(): AsyncGenerator<AiChunk> {
    yield { text: 'Réponse', language: 'fr' }
  },
}

const message = (id: string, content: string) => ({ id, role: 'user' as const, content, createdAt: '2026-10-20T10:00:00.000Z' })
const local = (id: string, changes: Partial<Conversation> = {}): Conversation => ({ id, title: id, messages: [message(`${id}-m`, `Question ${id}`)], createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T10:00:00.000Z', ...changes })
const stored = (conversation: Conversation, kind: ConversationSummary['kind'] = 'general'): StoredConversation => ({
  id: conversation.id, kind, businessId: kind === 'general' ? null : 'commerce-1', title: conversation.title ?? null, favorite: false,
  createdAt: conversation.createdAt, updatedAt: conversation.updatedAt, messages: conversation.messages,
})

/** Compte factice en mémoire, avec la même règle que le serveur (la version la plus récente l’emporte). */
function fakeAccount(initial: StoredConversation[]) {
  const rows = new Map(initial.map((row) => [row.id, row]))
  const summary = ({ messages: _messages, ...rest }: StoredConversation): ConversationSummary => rest
  const api: ConversationsApi = {
    list: vi.fn(async () => [...rows.values()].map(summary)),
    get: vi.fn(async (id: string) => rows.get(id)!),
    save: vi.fn(async (upload: ConversationUpload) => {
      const existing = rows.get(upload.id)
      if (existing && existing.updatedAt > upload.updatedAt) return { newer: existing }
      const row: StoredConversation = { ...upload, title: upload.title ?? existing?.title ?? null, favorite: upload.favorite ?? false }
      rows.set(upload.id, row)
      return { saved: summary(row) }
    }),
    update: vi.fn(async (id: string, changes: { title?: string; favorite?: boolean }) => {
      const row = { ...rows.get(id)!, ...changes }
      rows.set(id, row)
      return summary(row)
    }),
    remove: vi.fn(async (id: string) => { rows.delete(id) }),
  }
  return { api, rows }
}

function setup(api: ConversationsApi, initialUser: string | null = 'alice') {
  return renderHook(({ userId }) => {
    const conversation = useConversation(service, defaultPreferences)
    const account = useAccountConversations({
      api: userId ? api : null,
      userId,
      isSignedOut: !userId,
      saveEnabled: true,
      conversations: conversation.conversations,
      isGenerating: conversation.isGenerating,
      applyAccountSync: conversation.applyAccountSync,
    })
    return { conversation, account }
  }, { initialProps: { userId: initialUser } })
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.useRealTimers())

describe('conversations enregistrées sur le compte', () => {
  it('réunit l’appareil et le compte à la connexion', async () => {
    localStorage.setItem('gilli.conversations.v1', JSON.stringify([
      local('appareil-seul'),
      local('autre-compte', { accountId: 'bob' }),
      local('supprimee-ailleurs', { accountId: 'alice' }),
      local('plus-ancienne', { title: 'Ancien titre' }),
    ]))
    const { api, rows } = fakeAccount([
      stored(local('compte-seul')),
      stored(local('plus-ancienne', { title: 'Titre récent', updatedAt: '2026-10-21T10:00:00.000Z' })),
      stored(local('assistant-commerce', { title: 'Mes ventes' }), 'commerce'),
    ])
    const { result } = setup(api)

    await waitFor(() => expect(result.current.conversation.conversations.map((item) => item.id).sort()).toEqual(['appareil-seul', 'compte-seul', 'plus-ancienne']))
    // La copie la plus récente l’emporte ; les conversations d’un autre compte et celles supprimées ailleurs quittent l’appareil.
    expect(result.current.conversation.conversations.find((item) => item.id === 'plus-ancienne')?.title).toBe('Titre récent')
    expect(result.current.account.businessConversations.map((item) => item.id)).toEqual(['assistant-commerce'])
    // La conversation créée sur l’appareil avant la connexion rejoint le compte.
    await waitFor(() => expect(rows.has('appareil-seul')).toBe(true), { timeout: 4000 })
    expect(rows.has('autre-compte')).toBe(false)
    await waitFor(() => expect(result.current.conversation.conversations.every((item) => item.accountId === 'alice')).toBe(true))
  })

  it('envoie les modifications et les suppressions, puis retire les conversations du compte à la déconnexion', async () => {
    const { api, rows } = fakeAccount([stored(local('compte-seul'))])
    const { result, rerender } = setup(api)
    await waitFor(() => expect(result.current.conversation.conversations).toHaveLength(1))

    act(() => result.current.conversation.rename('compte-seul', 'Renommée'))
    await waitFor(() => expect(rows.get('compte-seul')?.title).toBe('Renommée'), { timeout: 4000 })

    act(() => result.current.conversation.send('Nouvelle question'))
    await waitFor(() => expect(rows.size).toBe(2), { timeout: 4000 })
    const created = [...rows.values()].find((row) => row.id !== 'compte-seul')!
    await waitFor(() => expect((rows.get(created.id)?.messages ?? []).length).toBe(2), { timeout: 4000 })

    act(() => result.current.conversation.remove('compte-seul'))
    await waitFor(() => expect(rows.has('compte-seul')).toBe(false), { timeout: 4000 })

    // Déconnexion : les conversations restent sur le compte, plus sur l’appareil.
    await waitFor(() => expect(result.current.conversation.conversations[0]?.accountId).toBe('alice'))
    rerender({ userId: null })
    await waitFor(() => expect(result.current.conversation.conversations).toEqual([]))
    expect(rows.has(created.id)).toBe(true)
    expect(api.remove).toHaveBeenCalledTimes(1)
  })

  it('renomme, met en favori et supprime les conversations des assistants', async () => {
    const { api, rows } = fakeAccount([stored(local('assistant-commerce', { title: 'Mes ventes' }), 'commerce')])
    const { result } = setup(api)
    await waitFor(() => expect(result.current.account.businessConversations).toHaveLength(1))
    await act(() => result.current.account.updateBusinessConversation('assistant-commerce', { title: 'Stock du mois', favorite: true }))
    expect(result.current.account.businessConversations[0]).toMatchObject({ title: 'Stock du mois', favorite: true })
    await act(() => result.current.account.removeBusinessConversation('assistant-commerce'))
    expect(result.current.account.businessConversations).toEqual([])
    expect(rows.size).toBe(0)
  })
})
