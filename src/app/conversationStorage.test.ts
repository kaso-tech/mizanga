import { describe, expect, it } from 'vitest'
import type { Conversation } from '../domain/types'
import { clearStoredConversations, createBackup, loadConversations, mergeConversations, readBackup, saveConversations } from './conversationStorage'

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

  it('n’enregistre jamais le contenu des fichiers joints, seulement leur nom', () => {
    const withFile: Conversation = {
      ...conversation,
      messages: [{ ...conversation.messages[0], attachments: [{ id: 'f1', name: 'photo.jpg', mimeType: 'image/jpeg', size: 2048, data: 'AAAA' }] }],
    }
    saveConversations([withFile])
    expect(localStorage.getItem('mizanga.conversations.v1')).not.toContain('AAAA')
    expect(loadConversations()[0].messages[0].attachments).toEqual([{ id: 'f1', name: 'photo.jpg', mimeType: 'image/jpeg', size: 2048 }])
  })

  it('crée une sauvegarde relisible, sans le contenu des fichiers joints', () => {
    const withFile: Conversation = { ...conversation, messages: [{ ...conversation.messages[0], attachments: [{ id: 'f1', name: 'photo.jpg', mimeType: 'image/jpeg', size: 10, data: 'AAAA' }] }] }
    const backup = createBackup([withFile], new Date('2026-10-20T12:00:00Z'))
    expect(backup).not.toContain('AAAA')
    const [restored] = readBackup(backup) ?? []
    expect(restored.title).toBe('Bonjour ɛ')
    expect(restored.messages[0].attachments).toEqual([{ id: 'f1', name: 'photo.jpg', mimeType: 'image/jpeg', size: 10 }])
  })

  it('refuse un fichier qui n’est pas une sauvegarde de Mizanga', () => {
    expect(readBackup('pas du JSON')).toBeNull()
    expect(readBackup(JSON.stringify([conversation]))).toBeNull()
  })

  it('fusionne une sauvegarde : ajoute les nouvelles conversations, ne remplace que par plus récent', () => {
    const older = { ...conversation, title: 'Ancien', updatedAt: '2026-10-19T00:00:00.000Z' }
    const newer = { ...conversation, title: 'Récent', updatedAt: '2026-10-21T00:00:00.000Z' }
    const other = { ...conversation, id: 'c2' }
    expect(mergeConversations([conversation], [older, other])).toMatchObject({ added: 1, updated: 0 })
    expect(mergeConversations([conversation], [older]).conversations[0].title).toBe('Bonjour ɛ')
    const merged = mergeConversations([conversation], [newer])
    expect(merged).toMatchObject({ added: 0, updated: 1 })
    expect(merged.conversations[0].title).toBe('Récent')
  })

  it('relit les versions d’une réponse et ignore des versions incohérentes', () => {
    const reply = { id: 'a1', role: 'assistant' as const, content: 'B', createdAt: '2026-10-20T10:00:02.000Z', status: 'complete' as const }
    const versions = [{ content: 'A', createdAt: '2026-10-20T10:00:01.000Z', status: 'complete' as const, rating: 'positive' as const }, { content: 'B', createdAt: '2026-10-20T10:00:02.000Z' }]
    saveConversations([{ ...conversation, messages: [conversation.messages[0], { ...reply, versions, versionIndex: 1 }] }])
    expect(loadConversations()[0].messages[1]).toMatchObject({ versionIndex: 1, versions: [{ content: 'A', rating: 'positive' }, { content: 'B' }] })

    saveConversations([{ ...conversation, messages: [conversation.messages[0], { ...reply, versions, versionIndex: 5 }] }])
    expect(loadConversations()[0].messages[1].versions).toBeUndefined()
  })
})
