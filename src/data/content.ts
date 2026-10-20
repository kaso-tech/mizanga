import type { LinguisticErrorType, ResponseLanguage, UserWritingMode } from '../domain/types'

export type SuggestionIcon = 'write' | 'summarize' | 'explain' | 'plan' | 'homework' | 'moore'

/** Tâches variées : Mizanga est un assistant généraliste ; le mooré est un atout, pas le seul sujet. */
export const suggestions: Array<{ label: string; prompt: string; icon: SuggestionIcon; highlight?: boolean }> = [
  { label: 'Rédiger un courrier', prompt: 'Rédige un courrier pour ', icon: 'write' },
  { label: 'Résumer un document', prompt: 'Résume ce texte en quelques points clés : ', icon: 'summarize' },
  { label: 'Expliquer un concept', prompt: 'Explique-moi simplement ', icon: 'explain' },
  { label: 'Préparer un plan', prompt: 'Aide-moi à préparer un plan pour ', icon: 'plan' },
  { label: 'Aide aux devoirs', prompt: 'Aide-moi à comprendre cet exercice : ', icon: 'homework' },
  { label: 'Discuter en mooré', prompt: 'Réponds-moi en mooré : ', icon: 'moore', highlight: true },
]

export const responseLanguageLabels: Record<ResponseLanguage, string> = {
  auto: 'Automatique',
  'moore-standard': 'Mooré standardisé',
  'moore-informal': 'Mooré informel',
  french: 'Français',
  english: 'Anglais',
}

/** Libellés des codes BCP 47 portés par les messages. */
export const messageLanguageLabels: Record<string, string> = {
  fr: 'Français',
  en: 'Anglais',
  mos: 'Mooré',
}

export const userWritingModeLabels: Record<UserWritingMode, string> = {
  standard: 'Écriture standardisée du mooré',
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
  'Aucune IA n’a produit cette réponse. Le moteur de Mizanga n’est pas encore connecté : votre message est seulement affiché pour tester l’interface, et aucune réponse — en français, en mooré ou dans une autre langue — n’a été générée.'
