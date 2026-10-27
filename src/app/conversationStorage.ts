import type { Attachment, ChatMessage, Conversation, ReplyVersion, ShoppingListing } from '../domain/types'

const storageKey = 'gilli.conversations.v1'

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
    ...(message.errorCode === 'quota' ? { errorCode: 'quota' as const } : {}),
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

/** Annonces d’une réponse de l’assistant d’achat ; une fiche incomplète est ignorée. */
function readListings(value: unknown): ShoppingListing[] {
  if (!Array.isArray(value)) return []
  const strings = (items: unknown) => (Array.isArray(items) ? items.filter(isString).slice(0, 10) : [])
  return value.slice(0, 10).flatMap((item): ShoppingListing[] => {
    const listing = item as Partial<ShoppingListing> | null
    if (!listing || !isString(listing.id) || !isString(listing.title) || typeof listing.price !== 'number' || typeof listing.rank !== 'number') return []
    return [{
      rank: listing.rank,
      id: listing.id,
      title: listing.title,
      price: listing.price,
      currency: isString(listing.currency) ? listing.currency : 'XOF',
      unit: isString(listing.unit) ? listing.unit : 'pièce',
      condition: isString(listing.condition) ? listing.condition : 'new',
      city: isString(listing.city) ? listing.city : '',
      sellerName: isString(listing.sellerName) ? listing.sellerName : '',
      sellerVerified: listing.sellerVerified === true,
      sellerRating: typeof listing.sellerRating === 'number' && listing.sellerRating >= 1 && listing.sellerRating <= 5 ? listing.sellerRating : null,
      sellerReviews: typeof listing.sellerReviews === 'number' && listing.sellerReviews >= 0 ? Math.floor(listing.sellerReviews) : 0,
      // Seules les photos servies par Gilli (adresse relative ou https) sont gardées.
      photo: isString(listing.photo) && /^(\/|https:\/\/)/.test(listing.photo) ? listing.photo : null,
      score: typeof listing.score === 'number' ? listing.score : 0,
      reasons: strings(listing.reasons),
      warnings: strings(listing.warnings),
      overBudget: listing.overBudget === true,
      whatsapp: isString(listing.whatsapp) && /^\d{8,15}$/.test(listing.whatsapp) ? listing.whatsapp : null,
      phone: isString(listing.phone) && /^\d{8,15}$/.test(listing.phone) ? listing.phone : null,
    }]
  })
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
    ...(message.role === 'assistant' && readListings(message.listings).length > 0 ? { listings: readListings(message.listings) } : {}),
    ...(message.role === 'assistant' ? readVersions(message) : {}),
  }
}

/** Relit les messages d’une conversation enregistrée (sur l’appareil ou sur le compte) ; les illisibles sont ignorés. */
export function parseMessages(stored: unknown): ChatMessage[] {
  return Array.isArray(stored) ? stored.map(readMessage).filter((message): message is ChatMessage => message !== null) : []
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
      ...(isString(conversation.accountId) ? { accountId: conversation.accountId } : {}),
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

export const withoutFileContents = (conversations: Conversation[]) => conversations.map((conversation) => ({
  ...conversation,
  messages: conversation.messages.map((message) => (
    message.attachments ? { ...message, attachments: message.attachments.map(({ data: _data, ...meta }) => meta) } : message
  )),
}))

const backupFormat = 'gilli-conversations'
/** Sauvegardes exportées quand l’application s’appelait Mizanga : toujours importables. */
const legacyBackupFormat = 'mizanga-conversations'

/** Fichier de sauvegarde de l’historique (JSON), sans le contenu des fichiers joints. */
export function createBackup(conversations: Conversation[], now = new Date()): string {
  // Le compte d’origine n’est pas exporté : une sauvegarde importée appartient à l’appareil qui l’importe.
  const exported = withoutFileContents(conversations).map(({ accountId: _accountId, ...conversation }) => conversation)
  return JSON.stringify({ format: backupFormat, version: 1, exportedAt: now.toISOString(), conversations: exported }, null, 2)
}

/** Lit un fichier de sauvegarde ; renvoie null s’il ne vient pas de Gilli ou est illisible. */
export function readBackup(text: string): Conversation[] | null {
  try {
    const backup = JSON.parse(text) as { format?: unknown; conversations?: unknown } | null
    if ((backup?.format !== backupFormat && backup?.format !== legacyBackupFormat) || !Array.isArray(backup.conversations)) return null
    return parseConversations(backup.conversations).map(({ accountId: _accountId, ...conversation }) => conversation)
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
