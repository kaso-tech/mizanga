import type { LinguisticErrorType, ResponseLanguage, UserWritingMode } from '../domain/types'

export type SuggestionIcon = 'mail' | 'summarize' | 'ideas' | 'code' | 'advice' | 'explain'

/** Tâches variées : Mizanga est un assistant généraliste qui répond aussi en mooré. */
export const suggestions: Array<{ label: string; prompt: string; icon: SuggestionIcon }> = [
  { label: 'Rédiger un e-mail', prompt: 'Rédige un e-mail professionnel pour demander un rendez-vous à ', icon: 'mail' },
  { label: 'Résumer un document', prompt: 'Résume ce texte en quelques points clés : ', icon: 'summarize' },
  { label: 'Trouver des idées', prompt: 'Propose-moi 5 idées de petite entreprise rentable au Burkina Faso.', icon: 'ideas' },
  { label: 'Aide en programmation', prompt: 'Explique-moi ce code et corrige les erreurs : ', icon: 'code' },
  { label: 'Conseils pratiques', prompt: 'Donne-moi des conseils pour améliorer le rendement de mon champ de maïs.', icon: 'advice' },
  { label: 'Expliquer un sujet', prompt: 'Explique-moi simplement comment fonctionne ', icon: 'explain' },
]

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
