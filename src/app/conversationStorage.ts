import type { Attachment, ChatMessage, Conversation, ReplyVersion } from '../domain/types'

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

/** Champs d’une réponse relus depuis le stockage ; une réponse interrompue par le rechargement est marquée « arrêtée ». */
function readReplyFields(message: Partial<ChatMessage>) {
  const status = message.status === 'streaming' ? 'stopped' : message.status
  return {
    ...(isString(message.language) ? { language: message.language } : {}),
    ...(Array.isArray(message.sources) ? { sources: message.sources.filter((source) => isString(source?.title) && isString(source?.url) && /^https?:\/\//.test(source.url)).map(({ title, url }) => ({ title, url })) } : {}),
    ...(isString(message.searchSuggestionsHtml) ? { searchSuggestionsHtml: message.searchSuggestionsHtml } : {}),
    ...(status === 'complete' || status === 'stopped' || status === 'error' ? { status } : {}),
    ...(isString(message.errorMessage) ? { errorMessage: message.errorMessage } : {}),
    ...(message.isDemonstration ? { isDemonstration: true } : {}),
    ...(message.rating === 'positive' || message.rating === 'negative' || message.rating === 'correct' ? { rating: message.rating } : {}),
  }
}

function readVersions(message: Partial<ChatMessage>): Pick<ChatMessage, 'versions' | 'versionIndex'> {
  if (!Array.isArray(message.versions)) return {}
  const versions = message.versions.flatMap((value): ReplyVersion[] => {
    const version = value as Partial<ReplyVersion> | null
    if (!version || !isString(version.content) || !isString(version.createdAt)) return []
    return [{ content: version.content, createdAt: version.createdAt, ...readReplyFields(version) }]
  })
  const index = message.versionIndex
  if (versions.length !== message.versions.length || versions.length < 2 || !Number.isInteger(index) || index! < 0 || index! >= versions.length) return {}
  return { versions, versionIndex: index }
}

/** Relit un message enregistré ; toute donnée inattendue est ignorée. */
function readMessage(value: unknown): ChatMessage | null {
  const message = value as Partial<ChatMessage> | null
  if (!message || !isString(message.id) || (message.role !== 'user' && message.role !== 'assistant') || !isString(message.content) || !isString(message.createdAt)) return null
  const attachments = readAttachments(message.attachments)
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(message.webSearch === true ? { webSearch: true } : {}),
    ...readReplyFields(message),
    ...(message.role === 'assistant' ? readVersions(message) : {}),
  }
}

/** Valide une liste de conversations (enregistrement local ou sauvegarde importée) ; toute entrée illisible est ignorée. */
export function parseConversations(stored: unknown): Conversation[] {
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
}

/** Conversations enregistrées sur cet appareil ; toute donnée illisible est ignorée plutôt que de bloquer l’application. */
export function loadConversations(): Conversation[] {
  try {
    return parseConversations(JSON.parse(localStorage.getItem(storageKey) ?? '[]'))
  } catch {
    return []
  }
}

const withoutFileContents = (conversations: Conversation[]) => conversations.map((conversation) => ({
  ...conversation,
  messages: conversation.messages.map((message) => (
    message.attachments ? { ...message, attachments: message.attachments.map(({ data: _data, ...meta }) => meta) } : message
  )),
}))

const backupFormat = 'mizanga-conversations'

/** Fichier de sauvegarde de l’historique (JSON), sans le contenu des fichiers joints. */
export function createBackup(conversations: Conversation[], now = new Date()): string {
  return JSON.stringify({ format: backupFormat, version: 1, exportedAt: now.toISOString(), conversations: withoutFileContents(conversations) }, null, 2)
}

/** Lit un fichier de sauvegarde ; renvoie null s’il ne vient pas de Mizanga ou est illisible. */
export function readBackup(text: string): Conversation[] | null {
  try {
    const backup = JSON.parse(text) as { format?: unknown; conversations?: unknown } | null
    if (backup?.format !== backupFormat || !Array.isArray(backup.conversations)) return null
    return parseConversations(backup.conversations)
  } catch {
    return null
  }
}

/**
 * Ajoute les conversations importées à l’historique. Une conversation déjà présente n’est remplacée
 * que si la version importée est plus récente.
 */
export function mergeConversations(current: Conversation[], imported: Conversation[]): { conversations: Conversation[]; added: number; updated: number } {
  const byId = new Map(current.map((conversation) => [conversation.id, conversation]))
  let added = 0
  let updated = 0
  for (const conversation of imported) {
    const existing = byId.get(conversation.id)
    if (!existing) added++
    else if (conversation.updatedAt > existing.updatedAt) updated++
    else continue
    byId.set(conversation.id, conversation)
  }
  return { conversations: [...byId.values()], added, updated }
}

/** Renvoie false si l’enregistrement a échoué (stockage plein ou indisponible). */
export function saveConversations(conversations: Conversation[]): boolean {
  try {
    // Le contenu des fichiers joints (souvent volumineux) n’est pas enregistré, seulement leur nom.
    localStorage.setItem(storageKey, JSON.stringify(withoutFileContents(conversations)))
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
