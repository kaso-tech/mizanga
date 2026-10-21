import type { Conversation } from '../domain/types'

const formatDate = (iso: string) => new Date(iso).toLocaleString('fr', { dateStyle: 'long', timeStyle: 'short' })

/** Conversation au format Markdown, lisible tel quel ou dans n’importe quel éditeur. */
export function conversationToMarkdown(conversation: Conversation) {
  const lines = [`# ${conversation.title || 'Conversation Gilli'}`, '', `_Exportée depuis Gilli le ${formatDate(new Date().toISOString())}._`, '']
  for (const message of conversation.messages) {
    if (message.role === 'assistant' && message.status === 'error') continue
    lines.push(`## ${message.role === 'user' ? 'Vous' : 'Gilli'} — ${formatDate(message.createdAt)}`, '')
    for (const attachment of message.attachments ?? []) lines.push(`> Fichier joint : ${attachment.name}`)
    if (message.attachments?.length) lines.push('')
    if (message.content) lines.push(message.content, '')
    if (message.sources?.length) {
      lines.push('Sources :', ...message.sources.map((source) => `- [${source.title}](${source.url})`), '')
    }
    if (message.isDemonstration) lines.push('_Réponse de démonstration : aucun moteur d’IA n’était connecté._', '')
  }
  return `${lines.join('\n').trim()}\n`
}

/** Nom de fichier sûr, sans accents problématiques ni caractères interdits. */
export function exportFileName(conversation: Conversation) {
  const base = (conversation.title || 'conversation')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
  return `gilli-${base || 'conversation'}.md`
}

/** Télécharge un fichier produit dans le navigateur. */
export function downloadFile(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadConversation(conversation: Conversation) {
  downloadFile(exportFileName(conversation), conversationToMarkdown(conversation), 'text/markdown;charset=utf-8')
}
