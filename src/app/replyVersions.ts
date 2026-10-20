import type { ChatMessage, ReplyVersion } from '../domain/types'

/** Nombre maximal de versions gardées pour une même réponse (les plus anciennes sont oubliées). */
export const MAX_REPLY_VERSIONS = 10

export const snapshotReply = (message: ChatMessage): ReplyVersion => ({
  content: message.content,
  createdAt: message.createdAt,
  language: message.language,
  status: message.status,
  errorMessage: message.errorMessage,
  errorCode: message.errorCode,
  isDemonstration: message.isDemonstration,
  sources: message.sources,
  searchSuggestionsHtml: message.searchSuggestionsHtml,
  rating: message.rating,
})

/** Toutes les versions d’une réponse, celle affichée étant mise à jour (avis donné entre-temps…). */
export function replyVersions(message: ChatMessage): ReplyVersion[] {
  if (!message.versions?.length) return [snapshotReply(message)]
  return message.versions.map((version, index) => (index === message.versionIndex ? snapshotReply(message) : version))
}

/**
 * Versions à conserver quand une réponse est régénérée : les versions vides (échecs) sont écartées.
 * Renvoie une liste vide s’il n’y a rien à garder.
 */
export function versionsBeforeRegeneration(previousReply: ChatMessage | undefined): ReplyVersion[] {
  if (previousReply?.role !== 'assistant') return []
  return replyVersions(previousReply).filter((version) => version.content.trim()).slice(-(MAX_REPLY_VERSIONS - 1))
}

/** Affiche une autre version d’une réponse. */
export function showReplyVersion(message: ChatMessage, index: number): ChatMessage {
  const versions = replyVersions(message)
  const version = versions[index]
  if (!version || index === message.versionIndex) return message
  return { ...message, ...version, versions, versionIndex: index }
}
