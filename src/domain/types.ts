export type AppView = 'chat' | 'history' | 'favorites' | 'settings' | 'about'

export type ThemePreference = 'light' | 'dark'
export type UserWritingMode = 'standard' | 'informal' | 'automatic'
export type ResponseWritingMode = 'standard' | 'informal' | 'french' | 'english' | 'other'

export interface LinguisticPreferences {
  interfaceLanguage: 'fr'
  responseLanguage: 'moore-standard' | 'moore-informal' | 'french' | 'english'
  userWritingMode: UserWritingMode
  responseWritingMode: ResponseWritingMode
  theme: ThemePreference
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
  isDemonstration?: boolean
}

/** Prévu pour la persistance future ; aucune conversation n’est stockée en phase 1. */
export interface Conversation {
  id: string
  title?: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

export interface LinguisticFeedback {
  messageId: string
  selectedPassage?: string
  errorType:
    | 'orthographe'
    | 'grammaire'
    | 'vocabulaire'
    | 'traduction'
    | 'expression'
    | 'contexte'
    | 'autre'
  proposal: string
  explanation?: string
}

export const defaultPreferences: LinguisticPreferences = {
  interfaceLanguage: 'fr',
  responseLanguage: 'moore-standard',
  userWritingMode: 'standard',
  responseWritingMode: 'standard',
  theme: 'light',
}
