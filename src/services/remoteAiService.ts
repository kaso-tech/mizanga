import { AiServiceError, type AiChunk, type AiService } from '../domain/services'
import type { ChatMessage } from '../domain/types'
import { demoAiService } from './demoAiService'

/** Plafonds alignés sur le serveur (server/chat-handler.mjs). */
export const MAX_MESSAGE_CHARS = 32_000
const MAX_HISTORY_MESSAGES = 40
const MAX_HISTORY_CHARS = 60_000

/**
 * Garde les échanges les plus récents dans un budget de taille, pour préserver le quota gratuit
 * sur les longues conversations. L’historique envoyé commence toujours par un message de l’utilisateur.
 */
export function selectHistory(messages: ChatMessage[]) {
  const usable = messages.filter((message) => message.content.trim() && message.status !== 'error')
  const selected: ChatMessage[] = []
  let total = 0
  for (let index = usable.length - 1; index >= 0; index--) {
    const message = usable[index]
    if (selected.length >= MAX_HISTORY_MESSAGES || (selected.length > 0 && total + message.content.length > MAX_HISTORY_CHARS)) break
    selected.unshift(message)
    total += message.content.length
  }
  while (selected.length > 1 && selected[0].role !== 'user') selected.shift()
  return selected.map(({ role, content }) => ({ role, content }))
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
    async *generate({ messages, preferences }, { signal }): AsyncGenerator<AiChunk> {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: selectHistory(messages),
          preferences: { responseLanguage: preferences.responseLanguage, userWritingMode: preferences.userWritingMode },
        }),
        signal,
      })
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
export async function detectAiService({ timeoutMs = 2500 } = {}): Promise<AiService> {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(timeoutMs) })
    const health = (await response.json()) as { engine?: string; model?: string | null }
    if (response.ok && health.engine === 'gemini') {
      return createRemoteAiService({ label: health.model ? `Gemini (${health.model})` : 'Gemini' })
    }
  } catch {
    // Pas d’API disponible : démonstration.
  }
  return demoAiService
}
