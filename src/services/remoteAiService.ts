import { AiServiceError, type AiChunk, type AiService } from '../domain/services'
import type { ChatMessage } from '../domain/types'
import { demoAiService } from './demoAiService'

/** Plafonds alignés sur le serveur (server/chat-handler.mjs). */
export const MAX_MESSAGE_CHARS = 32_000
const MAX_HISTORY_MESSAGES = 40
const MAX_HISTORY_CHARS = 60_000
/** Contenu des fichiers renvoyé au moteur : ceux des échanges les plus récents, dans ce budget. */
const MAX_HISTORY_ATTACHMENT_BYTES = 8 * 1024 * 1024

/**
 * Garde les échanges les plus récents dans un budget de taille, pour préserver le quota gratuit
 * sur les longues conversations. L’historique envoyé commence toujours par un message de l’utilisateur.
 */
export function selectHistory(messages: ChatMessage[]) {
  const usable = messages.filter((message) => (message.content.trim() || message.attachments?.length) && message.status !== 'error')
  const selected: ChatMessage[] = []
  let total = 0
  for (let index = usable.length - 1; index >= 0; index--) {
    const message = usable[index]
    if (selected.length >= MAX_HISTORY_MESSAGES || (selected.length > 0 && total + message.content.length > MAX_HISTORY_CHARS)) break
    selected.unshift(message)
    total += message.content.length
  }
  while (selected.length > 1 && selected[0].role !== 'user') selected.shift()

  let attachmentBytes = 0
  const withFiles = selected.reverse().map(({ role, content, attachments = [] }) => {
    const sent = attachments.filter((attachment) => {
      if (!attachment.data || attachmentBytes + attachment.size > MAX_HISTORY_ATTACHMENT_BYTES) return false
      attachmentBytes += attachment.size
      return true
    })
    // Un fichier relu depuis l’historique n’a plus son contenu : le moteur en est informé par son nom.
    const missing = attachments.filter((attachment) => !sent.includes(attachment)).map((attachment) => `[Fichier joint non disponible : ${attachment.name}]`)
    return {
      role,
      content: [content, ...missing].filter(Boolean).join('\n'),
      ...(sent.length > 0 ? { attachments: sent.map(({ name, mimeType, data }) => ({ name, mimeType, data })) } : {}),
    }
  })
  return withFiles.reverse()
}

/**
 * Moteur distant : le serveur Mizanga (/api/chat) relaie la demande vers le modèle configuré
 * (Gemini). La clé d’API reste sur le serveur ; le navigateur ne reçoit que le texte.
 * Réponse attendue : NDJSON, une ligne `{"text": …}` par fragment ou `{"error": …}`.
 */
export function createRemoteAiService({ label, endpoint = '/api/chat' }: { label: string; endpoint?: string }): AiService {
  return {
    isDemonstration: false,
    label,
    async suggestTitle(firstMessage) {
      const response = await fetch('/api/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: firstMessage }),
      })
      if (!response.ok) return null
      const { title } = (await response.json()) as { title?: string | null }
      return typeof title === 'string' && title.trim() ? title.trim().slice(0, 60) : null
    },
    async *generate({ messages, preferences }, { signal }): AsyncGenerator<AiChunk> {
      let response: Response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: selectHistory(messages),
            preferences: { responseLanguage: preferences.responseLanguage, userWritingMode: preferences.userWritingMode },
          }),
          signal,
        })
      } catch (error) {
        if (signal.aborted) throw error
        // Réseau coupé ou serveur injoignable.
        throw new AiServiceError(navigator.onLine ? 'Le serveur de Mizanga est injoignable. Réessayez dans un instant.' : 'Vous êtes hors connexion. Vérifiez votre réseau puis réessayez.')
      }
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new AiServiceError(body?.error ?? 'Le serveur de Mizanga est injoignable. Vérifiez votre connexion et réessayez.')
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as { text?: string; error?: string }
          if (event.error) throw new AiServiceError(event.error)
          // La langue réelle de la réponse n’est pas connue : elle n’est pas indiquée plutôt que devinée.
          if (event.text) yield { text: event.text }
        }
      }
    },
  }
}

/**
 * Choisit le moteur selon ce que le serveur annonce (/api/health). Sans serveur ou sans clé configurée
 * (site statique, test local), l’application reste en démonstration.
 */
const engineStorageKey = 'mizanga.engine.v1'

type Health = { engine?: string; model?: string | null }

const serviceFor = (health: Health) => (
  health.engine === 'gemini' ? createRemoteAiService({ label: health.model ? `Gemini (${health.model})` : 'Gemini' }) : demoAiService
)

export async function detectAiService({ timeoutMs = 2500 } = {}): Promise<AiService> {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(timeoutMs) })
    const health = (await response.json()) as Health
    if (!response.ok) return demoAiService
    try {
      localStorage.setItem(engineStorageKey, JSON.stringify({ engine: health.engine, model: health.model ?? null }))
    } catch {
      // Stockage indisponible : la détection se refera au prochain lancement.
    }
    return serviceFor(health)
  } catch {
    // Application installée lancée hors connexion : on garde le dernier moteur connu, l’interface
    // affichera « hors connexion » au lieu de basculer à tort en démonstration.
    if (!navigator.onLine) {
      try {
        return serviceFor(JSON.parse(localStorage.getItem(engineStorageKey) ?? '{}') as Health)
      } catch {
        return demoAiService
      }
    }
    return demoAiService
  }
}
