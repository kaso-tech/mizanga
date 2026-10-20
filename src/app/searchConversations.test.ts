import { describe, expect, it } from 'vitest'
import type { Conversation } from '../domain/types'
import { searchConversations } from './searchConversations'

const conversation = (id: string, title: string, contents: string[]): Conversation => ({
  id,
  title,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  messages: contents.map((content, index) => ({ id: `${id}-${index}`, role: index % 2 ? 'assistant' : 'user', content, createdAt: '2026-10-20T10:00:00.000Z' })),
})

const list = [
  conversation('a', 'Recette du tô', ['Comment préparer le tô ?', 'Il faut de la farine de mil.']),
  conversation('b', 'Lettre', ['Rédige une lettre de motivation', 'Voici une lettre avec ɛ.']),
]

describe('searchConversations', () => {
  it('cherche dans le titre et dans les messages', () => {
    expect(searchConversations(list, 'farine').map((item) => item.id)).toEqual(['a'])
    expect(searchConversations(list, 'lettre').map((item) => item.id)).toEqual(['b'])
  })

  it('ignore la casse et les accents, exige tous les mots', () => {
    expect(searchConversations(list, 'REDIGE motivation').map((item) => item.id)).toEqual(['b'])
    expect(searchConversations(list, 'farine motivation')).toEqual([])
  })

  it('distingue les lettres du mooré et renvoie tout pour une recherche vide', () => {
    expect(searchConversations(list, 'ɛ').map((item) => item.id)).toEqual(['b'])
    expect(searchConversations(list, '  ')).toHaveLength(2)
  })
})
