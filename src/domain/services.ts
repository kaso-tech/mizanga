import type { ChatMessage, Conversation, LinguisticFeedback, LinguisticPreferences } from './types'

export interface SourceReference {
  title: string
  url: string
  language?: string
}

export interface AiGenerationRequest {
  /** Historique complet de la conversation, dernier message utilisateur inclus. Le texte n’est jamais normalisé. */
  messages: ChatMessage[]
  preferences: LinguisticPreferences
}

/** Fragment de réponse. `language` (BCP 47) n’est fourni que si le service le connaît réellement. */
export interface AiChunk {
  text: string
  language?: string
  /** Sources web réellement consultées par le moteur (jamais inventées). */
  sources?: SourceReference[]
  /** Suggestions de recherche Google, à afficher telles quelles avec la réponse (conditions de Google). */
  searchSuggestionsHtml?: string
}

/**
 * Fournisseur d’IA remplaçable. Une implémentation produit la réponse par fragments et doit
 * s’arrêter en levant une `AbortError` dès que `signal` est annulé.
 */
export interface AiService {
  /** Vrai tant qu’aucun moteur linguistique réel n’est branché : l’interface doit l’afficher. */
  readonly isDemonstration: boolean
  /** Nom du moteur montré à l’utilisateur (transparence). */
  readonly label: string
  /** Vrai si le moteur propose aussi un modèle économe (choix dans les paramètres). */
  readonly offersLiteModel?: boolean
  generate(request: AiGenerationRequest, options: { signal: AbortSignal }): AsyncIterable<AiChunk>
  /** Facultatif : propose un titre court pour une conversation à partir de son premier message. */
  suggestTitle?(firstMessage: string): Promise<string | null>
}

/** Erreur d’un service d’IA dont le message peut être montré tel quel à l’utilisateur. */
export class AiServiceError extends Error {
  /** `retryAt` : moment où la limite d’utilisation sera réinitialisée, quand le moteur l’indique. */
  /** `code` « quota » : quota du moteur épuisé (un autre modèle peut avoir le sien). */
  constructor(readonly userMessage: string, readonly retryAt?: Date, readonly code?: 'quota') {
    super(userMessage)
    this.name = 'AiServiceError'
  }
}

export interface ResearchService {
  search(query: string, preferredLanguage: string): Promise<SourceReference[]>
}

/** Contrat réservé à un futur backend sécurisé avec règles d’accès par utilisateur. */
export interface ConversationStorageService {
  listConversations(): Promise<Conversation[]>
  saveConversation(conversation: Conversation): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  loadPreferences(): Promise<LinguisticPreferences | null>
  savePreferences(preferences: LinguisticPreferences): Promise<void>
  submitLinguisticFeedback(feedback: LinguisticFeedback): Promise<void>
}

/** Les transcriptions et lectures futures restent derrière cette frontière remplaçable. */
export interface VoiceService {
  transcribe(): Promise<string>
  speak(text: string, options?: { language?: string; rate?: number }): Promise<void>
}

export type LinguisticEntryStatus = 'draft' | 'to-review' | 'validated' | 'rejected'

/** Contrat pour le futur espace privé de vérification linguistique. */
export interface LinguisticAdministrationService {
  listEntries(status?: LinguisticEntryStatus): Promise<unknown[]>
  updateEntryStatus(entryId: string, status: LinguisticEntryStatus): Promise<void>
}

/**
 * Adaptateur temporaire : aucune recherche n’est effectuée pendant la phase 1.
 * L’adaptateur IA de démonstration se trouve dans `src/services/demoAiService.ts`.
 */
export const unavailableResearchService: ResearchService = {
  async search() {
    return []
  },
}
