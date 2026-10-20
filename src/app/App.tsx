import { CheckCircle2, Info, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AboutView } from '../components/AboutView'
import { ChatView } from '../components/ChatView'
import { CollectionView } from '../components/CollectionView'
import { Composer } from '../components/Composer'
import { FeedbackDialog } from '../components/FeedbackDialog'
import { Header } from '../components/Header'
import { SettingsView } from '../components/SettingsView'
import { Sidebar } from '../components/Sidebar'
import type { AiService } from '../domain/services'
import { responseLanguageLabels } from '../data/content'
import { defaultPreferences, type AppView, type ChatMessage, type LinguisticFeedback, type LinguisticPreferences, type MessageRating } from '../domain/types'
import { demoAiService } from '../services/demoAiService'
import { MAX_MESSAGE_CHARS } from '../services/remoteAiService'
import { useConversation } from './useConversation'

const routeByView: Record<AppView, string> = {
  chat: '/',
  history: '/historique',
  favorites: '/favoris',
  settings: '/parametres',
  about: '/a-propos',
}

const titleByView: Record<AppView, string> = {
  chat: 'Conversation',
  history: 'Historique',
  favorites: 'Favoris',
  settings: 'Paramètres',
  about: 'À propos',
}

const themeColorByTheme: Record<'light' | 'dark', string> = {
  light: '#fcf9f3',
  dark: '#1a120e',
}

function getViewFromPath(pathname: string): AppView {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  const entry = Object.entries(routeByView).find(([, path]) => path === normalizedPath)
  return (entry?.[0] as AppView | undefined) ?? 'chat'
}

/** Remplace une adresse inconnue ou non canonique (ex. « /parametres/ ») par celle de la vue affichée. */
function syncViewFromLocation(): AppView {
  const view = getViewFromPath(window.location.pathname)
  if (window.location.pathname !== routeByView[view]) window.history.replaceState({}, '', routeByView[view])
  return view
}

const mobileQuery = '(max-width: 1023px)'
const isMobileLayout = () => window.matchMedia(mobileQuery).matches

function useIsMobileLayout() {
  const [isMobile, setIsMobile] = useState(isMobileLayout)
  useEffect(() => {
    const media = window.matchMedia(mobileQuery)
    const onChange = () => setIsMobile(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

const preferencesStorageKey = 'mizanga.preferences.v1'

/** Préférences conservées sur cet appareil uniquement ; une valeur illisible ou inconnue est ignorée. */
function loadPreferences(): LinguisticPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(preferencesStorageKey) ?? '{}') as Partial<LinguisticPreferences>
    return {
      ...defaultPreferences,
      ...(stored.responseLanguage && Object.hasOwn(responseLanguageLabels, stored.responseLanguage) ? { responseLanguage: stored.responseLanguage } : {}),
      ...(stored.userWritingMode === 'standard' || stored.userWritingMode === 'informal' ? { userWritingMode: stored.userWritingMode } : {}),
      ...(stored.theme === 'light' || stored.theme === 'dark' || stored.theme === 'system' ? { theme: stored.theme } : {}),
      ...(typeof stored.saveConversations === 'boolean' ? { saveConversations: stored.saveConversations } : {}),
    }
  } catch {
    return defaultPreferences
  }
}

type ToastTone = 'success' | 'info'

interface AppProps {
  /** Fournisseur d’IA injecté : remplacer l’adaptateur de démonstration ne touche pas l’interface. */
  aiService?: AiService
}

export function App({ aiService = demoAiService }: AppProps) {
  const [activeView, setActiveView] = useState<AppView>(syncViewFromLocation)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [preferences, setPreferences] = useState<LinguisticPreferences>(loadPreferences)
  const storageErrorShown = useRef(false)
  const conversation = useConversation(aiService, preferences, {
    // Appelé plus tard, depuis un effet : `notify` est alors défini.
    onStorageError: () => {
      if (storageErrorShown.current) return
      storageErrorShown.current = true
      notify('L’historique n’a pas pu être enregistré sur cet appareil (stockage plein ou indisponible). Les conversations restent disponibles jusqu’à la fermeture de la page.')
    },
  })
  const [draft, setDraft] = useState('')
  const [focusToken, setFocusToken] = useState(0)
  const [copiedMessageId, setCopiedMessageId] = useState<string>()
  const [reportedMessage, setReportedMessage] = useState<ChatMessage | null>(null)
  const [reportedPassage, setReportedPassage] = useState('')
  const isMobile = useIsMobileLayout()
  const [toast, setToast] = useState<{ message: string; tone: ToastTone }>()
  const toastTimer = useRef<number>()
  const copiedTimer = useRef<number>()

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const theme = preferences.theme === 'system' ? (media.matches ? 'dark' : 'light') : preferences.theme
      document.documentElement.dataset.theme = theme
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColorByTheme[theme])
    }
    applyTheme()
    if (preferences.theme !== 'system') return
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [preferences.theme])

  useEffect(() => {
    try {
      localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences))
    } catch {
      // Stockage indisponible (navigation privée) : les préférences restent valables pour la session.
    }
  }, [preferences])

  const conversationTitle = conversation.activeConversation?.title
  useEffect(() => {
    const pageTitle = activeView === 'chat' ? conversationTitle : titleByView[activeView]
    document.title = pageTitle ? `${pageTitle} — Mizanga` : 'Mizanga'
  }, [activeView, conversationTitle])

  useEffect(() => {
    const syncPath = () => setActiveView(syncViewFromLocation())
    window.addEventListener('popstate', syncPath)
    return () => window.removeEventListener('popstate', syncPath)
  }, [])

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current)
  }, [])

  const notify = (message: string, tone: ToastTone = 'info') => {
    setToast({ message, tone })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(undefined), 4600)
  }

  const navigate = (view: AppView) => {
    const path = routeByView[view]
    if (window.location.pathname !== path) window.history.pushState({}, '', path)
    setActiveView(view)
    setDrawerOpen(false)
  }

  const updatePreferences = (changes: Partial<LinguisticPreferences>) => {
    setPreferences((current) => ({ ...current, ...changes }))
  }

  const startNewConversation = () => {
    conversation.startNew()
    setDraft('')
    navigate('chat')
    setFocusToken((token) => token + 1)
  }

  const selectConversation = (conversationId: string) => {
    conversation.select(conversationId)
    navigate('chat')
  }

  const sendMessage = (content: string) => {
    if (content.length > MAX_MESSAGE_CHARS) {
      notify(`Message trop long (${content.length.toLocaleString('fr')} caractères). La limite est de ${MAX_MESSAGE_CHARS.toLocaleString('fr')} : découpez-le en plusieurs messages.`)
      return
    }
    conversation.send(content)
    setDraft('')
  }

  const stopLabel = aiService.isDemonstration ? 'Arrêter la démonstration' : 'Arrêter la génération'
  const stopGeneration = () => {
    conversation.stop()
    notify(aiService.isDemonstration ? 'La démonstration a été arrêtée. Aucun appel IA n’était en cours.' : 'Génération arrêtée.')
  }

  const copyMessage = async (message: ChatMessage) => {
    try {
      // navigator.clipboard est absent hors contexte sécurisé (HTTP) : l’appel échoue alors comme un refus.
      await navigator.clipboard.writeText(message.content)
    } catch {
      notify('La copie a échoué : votre navigateur n’autorise pas l’accès au presse-papiers. Sélectionnez le texte pour le copier.')
      return
    }
    setCopiedMessageId(message.id)
    notify('Réponse copiée dans le presse-papiers.', 'success')
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopiedMessageId(undefined), 1800)
  }

  const rateMessage = (message: ChatMessage, rating: MessageRating) => {
    conversation.rate(message.id, rating)
    if (message.rating !== rating) notify('Avis noté sur cet appareil : la collecte des retours et la validation linguistique ne sont pas encore activées.')
  }

  const openReport = (message: ChatMessage, selectedPassage: string) => {
    setReportedPassage(selectedPassage)
    setReportedMessage(message)
  }

  const submitReport = (_feedback: LinguisticFeedback) => {
    setReportedMessage(null)
    notify('Merci ! Le signalement est prêt, mais l’enregistrement n’est pas encore connecté : il n’a pas été envoyé.')
  }

  const toggleSidebar = () => {
    if (isMobileLayout()) setDrawerOpen((open) => !open)
    else setSidebarCollapsed((collapsed) => !collapsed)
  }

  const isEmptyChat = activeView === 'chat' && conversation.messages.length === 0
  const composer = (
    <Composer
      value={draft}
      isGenerating={conversation.isGenerating}
      isDemonstration={aiService.isDemonstration}
      stopLabel={stopLabel}
      focusToken={focusToken}
      onValueChange={setDraft}
      onSend={sendMessage}
      onStop={stopGeneration}
      onNotify={notify}
    />
  )

  const renderView = () => {
    switch (activeView) {
      case 'history':
        return <CollectionView kind="history" conversations={conversation.conversations} savesConversations={preferences.saveConversations} onSelectConversation={selectConversation} />
      case 'favorites':
        return <CollectionView kind="favorites" conversations={conversation.conversations} savesConversations={preferences.saveConversations} onSelectConversation={selectConversation} />
      case 'settings':
        return (
          <SettingsView
            preferences={preferences}
            engine={{ label: aiService.label, isDemonstration: aiService.isDemonstration }}
            conversationCount={conversation.conversations.length}
            onChange={updatePreferences}
            onResetPreferences={() => {
              setPreferences(defaultPreferences)
              notify('Préférences réinitialisées.', 'success')
            }}
            onNewConversation={startNewConversation}
            onClearConversations={() => {
              conversation.clearAll()
              setDraft('')
              notify('Toutes les conversations de cette session ont été supprimées.', 'success')
            }}
          />
        )
      case 'about':
        return <AboutView engineLabel={aiService.label} isDemonstration={aiService.isDemonstration} />
      default:
        return (
          <ChatView
            messages={conversation.messages}
            isGenerating={conversation.isGenerating}
            isDemonstration={aiService.isDemonstration}
            responseLanguageLabel={responseLanguageLabels[preferences.responseLanguage]}
            composer={composer}
            copiedMessageId={copiedMessageId}
            onSuggestion={(prompt) => { setDraft(prompt); setFocusToken((token) => token + 1) }}
            onNewConversation={startNewConversation}
            onCopy={copyMessage}
            onRegenerate={conversation.regenerate}
            onRate={rateMessage}
            onReport={openReport}
          />
        )
    }
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <Sidebar
        activeView={activeView}
        conversations={conversation.conversations}
        activeConversationId={conversation.activeConversation?.id}
        savesConversations={preferences.saveConversations}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={navigate}
        onNewConversation={startNewConversation}
        onSelectConversation={selectConversation}
        onRemoveConversation={conversation.remove}
        onToggleFavorite={conversation.toggleFavorite}
      />
      <main className={`main-area ${isEmptyChat ? 'is-empty-chat' : ''}`}>
        <Header
          isMenuOpen={isMobile ? drawerOpen : !sidebarCollapsed}
          showBrand={isMobile || sidebarCollapsed}
          responseLanguage={preferences.responseLanguage}
          onToggleSidebar={toggleSidebar}
          onResponseLanguageChange={(responseLanguage) => updatePreferences({ responseLanguage })}
          onOpenSettings={() => navigate('settings')}
          onGoHome={() => navigate('chat')}
        />
        <div className="content-scroll"><div className="content-frame">{renderView()}</div></div>
        {activeView === 'chat' && !isEmptyChat && (
          <div className="composer-zone">{composer}</div>
        )}
      </main>
      <FeedbackDialog key={reportedMessage?.id ?? 'closed'} message={reportedMessage} initialPassage={reportedPassage} onClose={() => setReportedMessage(null)} onSubmit={submitReport} />
      {/* Zone live permanente : les lecteurs d’écran n’annoncent pas toujours une région créée avec son contenu. */}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast">{toast.tone === 'success' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}<p>{toast.message}</p><button type="button" aria-label="Fermer la notification" onClick={() => setToast(undefined)}><X size={16} /></button></div>}
      </div>
    </div>
  )
}
