export type AppView = 'chat' | 'history' | 'favorites' | 'settings' | 'about' | 'admin' | 'business' | 'marketplace' | 'terms'

/** « system » suit le réglage clair/sombre de l’appareil. */
export type ThemePreference = 'light' | 'dark' | 'system'
export type TextSize = 'small' | 'normal' | 'large' | 'xlarge'
/** « lite » : modèle économe, plus rapide et au quota gratuit plus large, pour les demandes simples. */
export type ModelTier = 'standard' | 'lite'
export type UserWritingMode = 'standard' | 'informal'
/**
 * Langue et registre d’écriture des réponses, réunis en un seul choix pour éviter les combinaisons contradictoires.
 * « auto » : répondre dans la langue du message de l’utilisateur.
 */
export type ResponseLanguage = 'auto' | 'moore-standard' | 'moore-informal' | 'french' | 'english'

export interface LinguisticPreferences {
  interfaceLanguage: 'fr'
  /** Enregistrer les conversations sur cet appareil (stockage du navigateur). */
  saveConversations: boolean
  responseLanguage: ResponseLanguage
  userWritingMode: UserWritingMode
  theme: ThemePreference
  modelTier: ModelTier
  /** Taille du texte des conversations. */
  textSize: TextSize
  /** Ce que Gilli doit savoir sur l’utilisateur et sa façon de répondre ; transmis au moteur avec chaque demande. */
  customInstructions: string
  /** Affiche le bouton « Écouter » sous les réponses (synthèse vocale du navigateur). */
  readAloud: boolean
  /** Vitesse de lecture à voix haute (1 = normale). */
  speechRate: number
  /** Voix choisie parmi celles de l’appareil ; vide : une voix française si possible. */
  voiceName: string
}

/** streaming : en cours de génération ; stopped : interrompue par l’utilisateur ; error : échec du service. */
export type ChatMessageStatus = 'streaming' | 'complete' | 'stopped' | 'error'

/** Fichier joint à un message. Son contenu (`data`) n’est jamais enregistré sur l’appareil. */
export interface Attachment {
  id: string
  name: string
  mimeType: string
  /** Taille en octets du contenu envoyé (après réduction éventuelle d’une image). */
  size: number
  /** Contenu encodé en base64 ; absent pour une pièce jointe relue depuis l’historique. */
  data?: string
}

/** Annonce proposée par l’assistant d’achat, avec son classement calculé par le serveur. */
export interface ShoppingListing {
  rank: number
  id: string
  title: string
  price: number
  currency: string
  unit: string
  condition: string
  city: string
  sellerName: string
  sellerVerified: boolean
  photo: string | null
  score: number
  reasons: string[]
  warnings: string[]
  overBudget: boolean
  whatsapp: string | null
  phone: string | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Horodatage ISO 8601, directement sérialisable pour le futur stockage. */
  createdAt: string
  /** Code de langue BCP 47 (ex. « fr », « mos » pour le Mooré) quand il est connu ; jamais deviné. */
  language?: string
  status?: ChatMessageStatus
  /** Explication montrée quand `status` vaut « error ». */
  errorMessage?: string
  /** « quota » : quota du moteur épuisé. */
  errorCode?: 'quota'
  isDemonstration?: boolean
  attachments?: Attachment[]
  /** Message de l’utilisateur envoyé avec la recherche web activée. */
  /** Ancienne option « Recherche web » (conversations enregistrées avant la recherche automatique). */
  webSearch?: boolean
  /** Réponse : sources web consultées et suggestions de recherche Google associées. */
  sources?: Array<{ title: string; url: string }>
  searchSuggestionsHtml?: string
  /** Réponse de l’assistant d’achat : annonces trouvées dans la marketplace, affichées en fiches. */
  listings?: ShoppingListing[]
  /** Avis local de l’utilisateur ; il n’est envoyé nulle part dans cette version. */
  rating?: MessageRating
  /**
   * Réponse régénérée : toutes ses versions, dans l’ordre. Les champs du message reflètent la version
   * affichée (`versionIndex`), seule transmise au moteur ; l’entrée correspondante peut être en retard.
   */
  versions?: ReplyVersion[]
  versionIndex?: number
}

export type ReplyVersion = Pick<ChatMessage, 'content' | 'createdAt' | 'language' | 'status' | 'errorMessage' | 'errorCode' | 'isDemonstration' | 'sources' | 'searchSuggestionsHtml' | 'listings' | 'rating'>

export type MessageRating = 'positive' | 'negative' | 'correct'

/** Espace d’une conversation : assistant d’achat (accueil) ou assistant de l’Espace vendeur. */
export type ConversationKind = 'general' | 'commerce'

/** Conversation du chatbot généraliste (enregistrée sur l’appareil, et sur le compte une fois connecté). */
export interface Conversation {
  id: string
  title?: string
  favorite?: boolean
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  /** Compte sur lequel la conversation est enregistrée (absent : seulement sur cet appareil). */
  accountId?: string
}

/** Conversation enregistrée sur le compte, sans ses messages (liste du menu latéral). */
export interface ConversationSummary {
  id: string
  kind: ConversationKind
  businessId: string | null
  title: string | null
  favorite: boolean
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
  saveConversations: true,
  responseLanguage: 'auto',
  userWritingMode: 'standard',
  theme: 'light',
  textSize: 'normal',
  modelTier: 'standard',
  customInstructions: '',
  readAloud: true,
  speechRate: 1,
  voiceName: '',
}
