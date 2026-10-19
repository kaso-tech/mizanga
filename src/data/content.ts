import type { AppView, LinguisticPreferences } from '../domain/types'

export const welcomeText =
  'Bienvenue sur Mooré AI. Posez vos questions, explorez les expressions du Mooré, traduisez vos textes ou découvrez de nouvelles connaissances dans votre langue.'

export const suggestions = [
  'Traduis ce texte en Mooré.',
  'Explique-moi cette expression en Mooré.',
  'Aide-moi à comprendre un proverbe mooré.',
  'Recherche des informations sur un sujet et explique-les-moi en Mooré.',
  'Aide-moi à apprendre le Mooré.',
]

export const navigationItems: Array<{ view: AppView; label: string }> = [
  { view: 'chat', label: 'Nouvelle conversation' },
  { view: 'history', label: 'Historique' },
  { view: 'favorites', label: 'Favoris' },
  { view: 'settings', label: 'Paramètres' },
  { view: 'about', label: 'À propos du projet' },
]

export const responseLanguageLabels: Record<LinguisticPreferences['responseLanguage'], string> = {
  'moore-standard': 'Mooré standardisé',
  'moore-informal': 'Mooré informel',
  french: 'Français',
  english: 'Anglais',
}

export const demonstrationReply =
  'Aucune IA n’a produit cette réponse. Le moteur linguistique de Mooré AI n’est pas encore connecté : votre message est seulement affiché pour tester l’interface, et aucune traduction ni réponse en Mooré n’a été générée.'
