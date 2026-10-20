import { describe, expect, it } from 'vitest'
import type { Conversation } from '../domain/types'
import { conversationToMarkdown, exportFileName } from './exportConversation'

const conversation: Conversation = {
  id: 'c1',
  title: 'Météo à Ouagadougou ɛ',
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:01:00.000Z',
  messages: [
    { id: 'u1', role: 'user', content: 'Quel temps fera-t-il ?', createdAt: '2026-10-20T10:00:00.000Z', attachments: [{ id: 'f', name: 'carte.png', mimeType: 'image/png', size: 10 }] },
    { id: 'a1', role: 'assistant', content: 'Il fera **chaud**.', createdAt: '2026-10-20T10:00:05.000Z', sources: [{ title: 'Météo', url: 'https://exemple.bf' }] },
    { id: 'a2', role: 'assistant', content: '', createdAt: '2026-10-20T10:00:06.000Z', status: 'error' },
  ],
}

describe('exportConversation', () => {
  it('produit un Markdown lisible avec fichiers, sources et sans les erreurs', () => {
    const markdown = conversationToMarkdown(conversation)
    expect(markdown).toContain('# Météo à Ouagadougou ɛ')
    expect(markdown).toContain('> Fichier joint : carte.png')
    expect(markdown).toContain('Quel temps fera-t-il ?')
    expect(markdown).toContain('Il fera **chaud**.')
    expect(markdown).toContain('- [Météo](https://exemple.bf)')
    expect(markdown.match(/## Mizanga/g)).toHaveLength(1)
  })

  it('donne un nom de fichier sûr', () => {
    expect(exportFileName(conversation)).toBe('mizanga-meteo-a-ouagadougou.md')
    expect(exportFileName({ ...conversation, title: '???' })).toBe('mizanga-conversation.md')
  })
})
