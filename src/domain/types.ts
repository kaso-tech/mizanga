export type AppView = 'chat' | 'history' | 'favorites' | 'settings' | 'about'

export type ThemePreference = 'light' | 'dark'
export type UserWritingMode = 'standard' | 'informal'
/**
 * Langue et registre d’écriture des réponses, réunis en un seul choix pour éviter les combinaisons contradictoires.
 * « auto » : répondre dans la langue du message de l’utilisateur.
 */
export type ResponseLanguage = 'auto' | 'moore-standard' | 'moore-informal' | 'french' | 'english'

export interface LinguisticPreferences {
  interfaceLanguage: 'fr'
  responseLanguage: ResponseLanguage
  userWritingMode: UserWritingMode
  theme: ThemePreference
}

/** streaming : en cours de génération ; stopped : interrompue par l’utilisateur ; error : échec du service. */
export type ChatMessageStatus = 'streaming' | 'complete' | 'stopped' | 'error'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Horodatage ISO 8601, directement sérialisable pour le futur stockage. */
  createdAt: string
  /** Code de langue BCP 47 (ex. « fr », « mos » pour le Mooré) quand il est connu ; jamais deviné. */
  language?: string
  status?: ChatMessageStatus
  isDemonstration?: boolean
  /** Avis local de l’utilisateur ; il n’est envoyé nulle part dans cette version. */
  rating?: MessageRating
}

export type MessageRating = 'positive' | 'negative' | 'correct'

/** Prévu pour la persistance future ; aucune conversation n’est stockée en phase 1. */
export interface Conversation {
  id: string
  title?: string
  favorite?: boolean
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export type LinguisticErrorType =
  | 'orthographe'
  | 'grammaire'
  | 'vocabulaire'
  | 'traduction'
  | 'expression'
  | 'contexte'
  | 'autre'

export interface LinguisticFeedback {
  messageId: string
  selectedPassage?: string
  errorType: LinguisticErrorType
  proposal: string
  explanation?: string
}

export const defaultPreferences: LinguisticPreferences = {
  interfaceLanguage: 'fr',
  responseLanguage: 'auto',
  userWritingMode: 'standard',
  theme: 'light',
}
