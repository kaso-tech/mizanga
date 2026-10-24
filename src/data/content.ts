import type { ResponseLanguage, UserWritingMode } from '../domain/types'

/** Langues de réponse proposées dans les paramètres (le mooré n’est plus mis en avant pour l’instant). */
export const offeredResponseLanguages: ResponseLanguage[] = ['auto', 'french', 'english']

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

export const demonstrationReply = [
  '### Mode démonstration',
  'Aucun moteur d’IA n’est encore connecté : cette réponse sert uniquement à tester l’interface.',
].join('\n\n')
