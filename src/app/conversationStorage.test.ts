import { describe, expect, it } from 'vitest'
import type { Conversation } from '../domain/types'
import { clearStoredConversations, loadConversations, saveConversations } from './conversationStorage'

const conversation: Conversation = {
  id: 'c1',
  title: 'Bonjour ɛ',
  favorite: true,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:01:00.000Z',
  messages: [
    { id: 'u1', role: 'user', content: 'Bonjour ɛ ʋ', createdAt: '2026-10-20T10:00:00.000Z' },
    { id: 'a1', role: 'assistant', content: 'Réponse', createdAt: '2026-10-20T10:00:01.000Z', status: 'streaming', rating: 'correct' },
  ],
}

describe('conversationStorage', () => {
  it('enregistre et relit les conversations ; une réponse coupée par le rechargement devient « arrêtée »', () => {
    expect(saveConversations([conversation])).toBe(true)
    const [loaded] = loadConversations()
    expect(loaded).toMatchObject({ id: 'c1', title: 'Bonjour ɛ', favorite: true })
    expect(loaded.messages[0].content).toBe('Bonjour ɛ ʋ')
    expect(loaded.messages[1]).toMatchObject({ status: 'stopped', rating: 'correct' })
  })

  it('ignore les données illisibles ou incomplètes', () => {
    localStorage.setItem('mizanga.conversations.v1', '{pas du json')
    expect(loadConversations()).toEqual([])
    localStorage.setItem('mizanga.conversations.v1', JSON.stringify([{ id: 'x' }, { ...conversation, messages: [{ role: 'pirate' }] }, conversation]))
    expect(loadConversations().map((item) => item.id)).toEqual(['c1'])
  })

  it('efface l’historique enregistré', () => {
    saveConversations([conversation])
    clearStoredConversations()
    expect(loadConversations()).toEqual([])
  })
})
