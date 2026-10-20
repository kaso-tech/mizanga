import type { LinguisticErrorType, ResponseLanguage, UserWritingMode } from '../domain/types'

export const welcomeText =
  'Bienvenue sur Mizanga. Posez vos questions, explorez les expressions du Mooré, traduisez vos textes ou découvrez de nouvelles connaissances dans votre langue.'

export const suggestions = [
  'Traduis ce texte en Mooré.',
  'Explique-moi cette expression en Mooré.',
  'Aide-moi à comprendre un proverbe mooré.',
  'Recherche des informations sur un sujet et explique-les-moi en Mooré.',
  'Aide-moi à apprendre le Mooré.',
]

export const responseLanguageLabels: Record<ResponseLanguage, string> = {
  'moore-standard': 'Mooré standardisé',
  'moore-informal': 'Mooré informel',
  french: 'Français',
  english: 'Anglais',
}

export const userWritingModeLabels: Record<UserWritingMode, string> = {
  standard: 'Écriture standardisée du Mooré',
  informal: 'Écriture informelle sur Internet',
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

export const demonstrationReply =
  'Aucune IA n’a produit cette réponse. Le moteur linguistique de Mizanga n’est pas encore connecté : votre message est seulement affiché pour tester l’interface, et aucune traduction ni réponse en Mooré n’a été générée.'
