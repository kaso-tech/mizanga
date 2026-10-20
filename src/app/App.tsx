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
import { defaultPreferences, type AppView, type ChatMessage, type LinguisticFeedback, type LinguisticPreferences } from '../domain/types'
import { demoAiService } from '../services/demoAiService'
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

const themeColorByTheme: Record<LinguisticPreferences['theme'], string> = {
  light: '#ffffff',
  dark: '#141518',
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

const isMobileLayout = () => window.matchMedia('(max-width: 780px)').matches

type ToastTone = 'success' | 'info'

interface AppProps {
  /** Fournisseur d’IA injecté : remplacer l’adaptateur de démonstration ne touche pas l’interface. */
  aiService?: AiService
}

export function App({ aiService = demoAiService }: AppProps) {
  const [activeView, setActiveView] = useState<AppView>(syncViewFromLocation)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [preferences, setPreferences] = useState<LinguisticPreferences>(defaultPreferences)
  const conversation = useConversation(aiService, preferences)
  const [draft, setDraft] = useState('')
  const [focusToken, setFocusToken] = useState(0)
  const [copiedMessageId, setCopiedMessageId] = useState<string>()
  const [reportedMessage, setReportedMessage] = useState<ChatMessage | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: ToastTone }>()
  const toastTimer = useRef<number>()
  const copiedTimer = useRef<number>()

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColorByTheme[preferences.theme])
  }, [preferences.theme])

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

  const recordFeedback = (_message: ChatMessage, positive: boolean) => {
    notify(positive ? 'Merci. Cet avis reste local : la collecte des retours n’est pas encore activée.' : 'Merci pour votre retour. Il reste local : la collecte des retours n’est pas encore activée.')
  }

  const submitReport = (_feedback: LinguisticFeedback) => {
    setReportedMessage(null)
    notify('Correction préparée localement : elle n’a été ni enregistrée ni validée.')
  }

  const toggleSidebar = () => {
    if (isMobileLayout()) setDrawerOpen((open) => !open)
    else setSidebarCollapsed(false)
  }

  const isEmptyChat = activeView === 'chat' && conversation.messages.length === 0
  const composer = (
    <Composer
      value={draft}
      placeholder={isEmptyChat ? 'Demandez n’importe quoi à Mizanga…' : 'Répondre à Mizanga…'}
      isGenerating={conversation.isGenerating}
      stopLabel={stopLabel}
      responseLanguage={preferences.responseLanguage}
      focusToken={focusToken}
      onValueChange={setDraft}
      onResponseLanguageChange={(responseLanguage) => updatePreferences({ responseLanguage })}
      onSend={sendMessage}
      onStop={stopGeneration}
      onNotify={notify}
    />
  )

  const renderView = () => {
    switch (activeView) {
      case 'history':
        return <CollectionView kind="history" />
      case 'favorites':
        return <CollectionView kind="favorites" />
      case 'settings':
        return <SettingsView preferences={preferences} onChange={updatePreferences} onNewConversation={startNewConversation} onNotify={notify} />
      case 'about':
        return <AboutView />
      default:
        return (
          <ChatView
            messages={conversation.messages}
            isGenerating={conversation.isGenerating}
            isDemonstration={aiService.isDemonstration}
            composer={composer}
            copiedMessageId={copiedMessageId}
            onSuggestion={(prompt) => { setDraft(prompt); setFocusToken((token) => token + 1) }}
            onCopy={copyMessage}
            onRegenerate={conversation.regenerate}
            onFeedback={recordFeedback}
            onReport={setReportedMessage}
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
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCollapse={() => setSidebarCollapsed(true)}
        onNavigate={navigate}
        onNewConversation={startNewConversation}
        onSelectConversation={selectConversation}
        onNotify={notify}
      />
      <main className={`main-area ${isEmptyChat ? 'is-empty-chat' : ''}`}>
        <Header
          title={activeView === 'chat' ? conversationTitle ?? 'Mizanga' : titleByView[activeView]}
          isDrawerOpen={drawerOpen}
          isSidebarCollapsed={sidebarCollapsed}
          canShare={activeView === 'chat' && !isEmptyChat}
          onMenuToggle={toggleSidebar}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          onNewConversation={startNewConversation}
          onNotify={notify}
        />
        {/* Filet signature : le repère textile décrit dans plan.md. Masqué sur
            l'accueil, où l'en-tête se confond avec le vide de la colonne. */}
        <div className="thread-filet" aria-hidden="true" />
        <div className="content-scroll"><div className="content-frame">{renderView()}</div></div>
        {activeView === 'chat' && !isEmptyChat && (
          <div className="composer-zone">
            {composer}
            <p className="disclaimer">Mizanga peut faire des erreurs ; vérifiez les informations importantes.</p>
          </div>
        )}
      </main>
      <FeedbackDialog key={reportedMessage?.id ?? 'closed'} message={reportedMessage} onClose={() => setReportedMessage(null)} onSubmit={submitReport} />
      {/* Zone live permanente : les lecteurs d’écran n’annoncent pas toujours une région créée avec son contenu. */}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast">{toast.tone === 'success' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}<p>{toast.message}</p><button type="button" aria-label="Fermer la notification" onClick={() => setToast(undefined)}><X size={16} /></button></div>}
      </div>
    </div>
  )
}
