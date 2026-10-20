import { demonstrationReply, responseLanguageLabels, userWritingModeLabels } from '../data/content'
import type { AiChunk, AiGenerationRequest, AiService } from '../domain/services'

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

/** Réponse de démonstration : elle cite la demande telle quelle et n’en produit aucune interprétation. */
function buildReply({ messages, preferences }: AiGenerationRequest) {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  const lastUserMessage = lastUser?.content ?? ''
  const files = lastUser?.attachments?.map((attachment) => `- ${attachment.name}`).join('\n')
  return [
    demonstrationReply,
    'Votre message a été reçu tel quel, sans modification :',
    lastUserMessage ? lastUserMessage.split(/\r?\n/).map((line) => `> ${line}`).join('\n') : '> (aucun texte)',
    ...(files ? ['Fichiers joints reçus, mais non lus en démonstration :', files] : []),
    'Préférences transmises au futur moteur :',
    `- Écriture de l’utilisateur : ${userWritingModeLabels[preferences.userWritingMode]}\n- Réponse souhaitée : ${responseLanguageLabels[preferences.responseLanguage]}`,
  ].join('\n\n')
}

/**
 * Adaptateur de phase 1 : n’appelle aucun moteur. Il renvoie, par fragments, un message en français
 * qui l’indique explicitement, afin d’exercer le flux et l’annulation sans rien simuler de linguistique.
 */
export const demoAiService: AiService = {
  isDemonstration: true,
  label: 'Démonstration (aucun moteur connecté)',
  async *generate(request, { signal }): AsyncGenerator<AiChunk> {
    await abortableDelay(600, signal)
    const tokens = buildReply(request).match(/\S+\s*/g) ?? []
    for (const token of tokens) {
      await abortableDelay(18, signal)
      yield { text: token, language: 'fr' }
    }
  },
}
