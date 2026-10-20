import type { Attachment, ChatMessage, Conversation } from '../domain/types'

const storageKey = 'mizanga.conversations.v1'

const isString = (value: unknown): value is string => typeof value === 'string'

/** Seuls le nom, le type et la taille des pièces jointes sont relus : leur contenu n’est jamais enregistré. */
function readAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): Attachment[] => {
    const attachment = item as Partial<Attachment> | null
    if (!attachment || !isString(attachment.id) || !isString(attachment.name) || !isString(attachment.mimeType) || typeof attachment.size !== 'number') return []
    return [{ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size }]
  })
}

/** Relit un message enregistré ; une réponse interrompue par le rechargement est marquée « arrêtée ». */
function readMessage(value: unknown): ChatMessage | null {
  const message = value as Partial<ChatMessage> | null
  if (!message || !isString(message.id) || (message.role !== 'user' && message.role !== 'assistant') || !isString(message.content) || !isString(message.createdAt)) return null
  const status = message.status === 'streaming' ? 'stopped' : message.status
  const attachments = readAttachments(message.attachments)
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    ...(isString(message.language) ? { language: message.language } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(message.webSearch === true ? { webSearch: true } : {}),
    ...(Array.isArray(message.sources) ? { sources: message.sources.filter((source) => isString(source?.title) && isString(source?.url) && /^https?:\/\//.test(source.url)).map(({ title, url }) => ({ title, url })) } : {}),
    ...(isString(message.searchSuggestionsHtml) ? { searchSuggestionsHtml: message.searchSuggestionsHtml } : {}),
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
    // Le contenu des fichiers joints (souvent volumineux) n’est pas enregistré, seulement leur nom.
    const withoutFileContents = conversations.map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => (
        message.attachments ? { ...message, attachments: message.attachments.map(({ data: _data, ...meta }) => meta) } : message
      )),
    }))
    localStorage.setItem(storageKey, JSON.stringify(withoutFileContents))
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
