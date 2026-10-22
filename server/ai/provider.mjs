// Service IA centralisé : toutes les demandes au modèle passent par ce contrat. Changer de fournisseur
// (Gemini aujourd’hui, Qwen ou un autre demain) revient à ajouter une implémentation et à la choisir
// par configuration serveur (AI_PROVIDER), sans toucher au reste de l’application.
import { createGeminiProvider } from './gemini.mjs'

/**
 * @typedef {{ name: string, mimeType: string, data: string }} AiAttachment
 * @typedef {{ role: 'user' | 'assistant', content: string, attachments?: AiAttachment[] }} AiMessage
 * @typedef {{ responseLanguage?: string, userWritingMode?: string, customInstructions?: string }} AiPreferences
 * @typedef {{ title: string, url: string }} AiSource
 * @typedef {{ inputTokens: number, outputTokens: number }} AiUsage
 * @typedef {{ name: string, description: string, parameters: Record<string, unknown> }} AiFunction
 * @typedef {{ text: string } | { sources: AiSource[], searchSuggestionsHtml?: string } | { usage: AiUsage } | { functionCall: { name: string, args: Record<string, unknown> } }} AiReplyEvent
 *
 * @typedef {object} AiProvider
 * @property {string} name Identifiant du fournisseur (annoncé par /api/health, ex. « gemini »).
 * @property {boolean} configured Vrai si le fournisseur peut répondre (clé présente…).
 * @property {{ standard: string, lite: string }} models Modèles réellement utilisés (console d’administration).
 * @property {(request: { messages: AiMessage[], preferences: AiPreferences, reference?: string, instructions?: string, webSearch?: boolean, functions?: AiFunction[], tier?: 'standard' | 'lite', signal?: AbortSignal }) => AsyncGenerator<AiReplyEvent>} streamReply
 *   Réponse diffusée par fragments, terminée par les jetons consommés (`usage`) quand le fournisseur
 *   les donne ; `instructions` remplace les consignes générales, `webSearch: false` retire la recherche
 *   web ; `functions` propose des actions que le modèle demande par `functionCall`. Lève une UpstreamError (server/ai/errors.mjs) en cas d’échec.
 * @property {(request: { text: string, signal?: AbortSignal }) => Promise<string | null>} generateTitle
 *   Titre court d’une conversation à partir de son premier message.
 * @property {(request: { instructions: string, text: string, images?: Array<{ mimeType: string, data: string }>, schema: Record<string, unknown>, signal?: AbortSignal }) => Promise<unknown>} [generateJson]
 *   Réponse structurée (JSON) pour les contrôles automatiques, comme la modération des annonces.
 */

export const AI_PROVIDERS = ['gemini']

/**
 * Crée le fournisseur choisi côté serveur. Un nom inconnu est une erreur de configuration :
 * mieux vaut refuser de démarrer que répondre avec un autre moteur que celui demandé.
 * @param {{ provider?: string, apiKey?: string, model?: string, liteModel?: string, apiBase?: string }} [config]
 * @returns {AiProvider}
 */
export function createAiProvider({ provider = 'gemini', ...config } = {}) {
  switch (provider) {
    case 'gemini':
      return createGeminiProvider(config)
    default:
      throw new Error(`Fournisseur d’IA inconnu : « ${provider} » (AI_PROVIDER). Valeurs possibles : ${AI_PROVIDERS.join(', ')}.`)
  }
}
