import type { ChatMessage, Conversation, LinguisticFeedback, LinguisticPreferences } from './types'

export interface SourceReference {
  title: string
  language: string
  url: string
}

export interface AiService {
  generate(input: string, preferences: LinguisticPreferences): Promise<ChatMessage>
  stop(): void
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
 * Adaptateurs temporaires : aucun appel IA, recherche, stockage ou traitement vocal
 * n’est effectué pendant la phase 1. Des implémentations réelles remplaceront ces objets.
 */
export const unavailableAiService: AiService = {
  async generate() {
    throw new Error('Le moteur IA n’est pas encore connecté.')
  },
  stop() {
    // Aucun flux à interrompre tant que le moteur n’est pas intégré.
  },
}

export const unavailableResearchService: ResearchService = {
  async search() {
    return []
  },
}
