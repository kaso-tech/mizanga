import type { ChatMessage, Conversation } from '../domain/types'

const storageKey = 'mizanga.conversations.v1'

const isString = (value: unknown): value is string => typeof value === 'string'

/** Relit un message enregistré ; une réponse interrompue par le rechargement est marquée « arrêtée ». */
function readMessage(value: unknown): ChatMessage | null {
  const message = value as Partial<ChatMessage> | null
  if (!message || !isString(message.id) || (message.role !== 'user' && message.role !== 'assistant') || !isString(message.content) || !isString(message.createdAt)) return null
  const status = message.status === 'streaming' ? 'stopped' : message.status
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    ...(isString(message.language) ? { language: message.language } : {}),
    ...(status === 'complete' || status === 'stopped' || status === 'error' ? { status } : {}),
    ...(isString(message.errorMessage) ? { errorMessage: message.errorMessage } : {}),
    ...(message.isDemonstration ? { isDemonstration: true } : {}),
    ...(message.rating === 'positive' || message.rating === 'negative' || message.rating === 'correct' ? { rating: message.rating } : {}),
  }
}

/** Conversations enregistrées sur cet appareil ; toute donnée illisible est ignorée plutôt que de bloquer l’application. */
export function loadConversations(): Conversation[] {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown
    if (!Array.isArray(stored)) return []
    return stored.flatMap((value): Conversation[] => {
      const conversation = value as Partial<Conversation> | null
      if (!conversation || !isString(conversation.id) || !Array.isArray(conversation.messages) || !isString(conversation.createdAt) || !isString(conversation.updatedAt)) return []
      const messages = conversation.messages.map(readMessage).filter((message): message is ChatMessage => message !== null)
      if (messages.length === 0) return []
      return [{
        id: conversation.id,
        title: isString(conversation.title) ? conversation.title : undefined,
        favorite: conversation.favorite === true,
        messages,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      }]
    })
  } catch {
    return []
  }
}

/** Renvoie false si l’enregistrement a échoué (stockage plein ou indisponible). */
export function saveConversations(conversations: Conversation[]): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(conversations))
    return true
  } catch {
    return false
  }
}

export function clearStoredConversations() {
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}
