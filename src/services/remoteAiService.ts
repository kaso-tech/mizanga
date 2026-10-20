import { AiServiceError, type AiChunk, type AiService } from '../domain/services'
import { demoAiService } from './demoAiService'

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
          messages: messages.map(({ role, content }) => ({ role, content })),
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
