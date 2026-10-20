import { demonstrationReply } from '../data/content'
import type { AiChunk, AiService } from '../domain/services'

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Adaptateur de phase 1 : n’appelle aucun moteur et ne lit pas la demande.
 * Il renvoie, par fragments, un message en français qui l’indique explicitement,
 * afin d’exercer le flux et l’annulation de l’interface sans rien simuler de linguistique.
 */
export const demoAiService: AiService = {
  isDemonstration: true,
  async *generate(_request, { signal }): AsyncGenerator<AiChunk> {
    await abortableDelay(600, signal)
    const words = demonstrationReply.split(/(?<= )/)
    for (const [index, word] of words.entries()) {
      if (index > 0) await abortableDelay(18, signal)
      yield { text: word, language: 'fr' }
    }
  },
}
