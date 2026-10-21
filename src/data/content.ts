import type { LinguisticErrorType, ResponseLanguage, UserWritingMode } from '../domain/types'

/** Caractères propres au mooré, proposés par le clavier de la zone de saisie. */
export const mooreCharacters = ['ɛ', 'ɩ', 'ʋ', 'ã', 'ẽ', 'ĩ', 'õ', 'ũ', 'Ɛ', 'Ɩ', 'Ʋ']

export const responseLanguageLabels: Record<ResponseLanguage, string> = {
  auto: 'Automatique',
  'moore-standard': 'Mooré standardisé',
  'moore-informal': 'Mooré informel',
  french: 'Français',
  english: 'Anglais',
}

export const userWritingModeLabels: Record<UserWritingMode, string> = {
  standard: 'Écriture standardisée',
  informal: 'Écriture informelle (Internet)',
}

export const errorTypeLabels: Record<LinguisticErrorType, string> = {
  orthographe: 'Orthographe',
  grammaire: 'Grammaire',
  vocabulaire: 'Vocabulaire',
  traduction: 'Traduction',
  expression: 'Expression idiomatique',
  contexte: 'Contexte culturel',
  autre: 'Autre',
}

export const demonstrationReply = [
  '### Mode démonstration',
  'Aucun moteur d’IA n’est encore connecté. **Cette réponse n’est pas une traduction ni une explication en mooré.** Elle sert uniquement à tester l’interface.',
].join('\n\n')
