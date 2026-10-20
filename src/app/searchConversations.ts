import type { Conversation } from '../domain/types'

/** Minuscules sans accents latins (é → e) ; les lettres du mooré (ɛ, ɩ, ʋ) restent distinctes. */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr')

/** Conversations dont le titre ou un message contient chacun des mots recherchés. */
export function searchConversations(conversations: Conversation[], query: string): Conversation[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return conversations
  return conversations.filter((conversation) => {
    const text = fold([conversation.title ?? '', ...conversation.messages.map((message) => message.content)].join('\n'))
    return words.every((word) => text.includes(word))
  })
}
