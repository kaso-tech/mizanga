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
import { demonstrationReply } from '../data/content'
import { defaultPreferences, type AppView, type ChatMessage, type LinguisticFeedback, type LinguisticPreferences } from '../domain/types'

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
  light: '#f4f7fc',
  dark: '#111b2d',
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

type ToastTone = 'success' | 'info'

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>(syncViewFromLocation)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [preferences, setPreferences] = useState<LinguisticPreferences>(defaultPreferences)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string>()
  const [reportedMessage, setReportedMessage] = useState<ChatMessage | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: ToastTone }>()
  const generationTimer = useRef<number>()
  const toastTimer = useRef<number>()
  const copiedTimer = useRef<number>()

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColorByTheme[preferences.theme])
  }, [preferences.theme])

  useEffect(() => {
    document.title = `${titleByView[activeView]} — Mizanga`
  }, [activeView])

  useEffect(() => {
    const syncPath = () => setActiveView(syncViewFromLocation())
    window.addEventListener('popstate', syncPath)
    return () => window.removeEventListener('popstate', syncPath)
  }, [])

  useEffect(() => () => {
    if (generationTimer.current) window.clearTimeout(generationTimer.current)
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
    if (generationTimer.current) window.clearTimeout(generationTimer.current)
    setMessages([])
    setDraft('')
    setIsGenerating(false)
    navigate('chat')
    notify('Nouvelle conversation locale prête. Rien n’a été enregistré.', 'success')
  }

  const sendMessage = (content: string) => {
    const userMessage: ChatMessage = {
      id: createId('user'),
      role: 'user',
      content,
      createdAt: new Date(),
    }
    setMessages((current) => [...current, userMessage])
    setDraft('')
    setIsGenerating(true)
    generationTimer.current = window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: createId('demo'),
          role: 'assistant',
          content: demonstrationReply,
          createdAt: new Date(),
          language: 'fr',
          isDemonstration: true,
        },
      ])
      setIsGenerating(false)
    }, 750)
  }

  const stopGeneration = () => {
    if (generationTimer.current) window.clearTimeout(generationTimer.current)
    setIsGenerating(false)
    notify('La démonstration a été arrêtée. Aucun appel IA n’était en cours.')
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
    notify(positive ? 'Merci. Cet avis est local, non enregistré et ne constitue pas une validation linguistique.' : 'Merci pour votre retour. Il reste local : la collecte et la validation ne sont pas encore activées.')
  }

  const submitReport = (_feedback: LinguisticFeedback) => {
    setReportedMessage(null)
    notify('Signalement préparé localement : il n’a été ni enregistré ni validé.')
  }

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
        return <ChatView messages={messages} isGenerating={isGenerating} copiedMessageId={copiedMessageId} onSuggestion={(suggestion) => { setDraft(suggestion); notify('Suggestion ajoutée au champ de saisie.') }} onCopy={copyMessage} onFeedback={recordFeedback} onReport={setReportedMessage} />
    }
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={navigate} onNewConversation={startNewConversation} onNotify={notify} />
      <main className="main-area">
        <Header isDrawerOpen={drawerOpen} preferences={preferences} onMenuToggle={() => setDrawerOpen((open) => !open)} onPreferencesChange={updatePreferences} onOpenSettings={() => navigate('settings')} onNotify={notify} />
        <div className="content-scroll"><div className="content-frame">{renderView()}</div></div>
        {activeView === 'chat' && <div className="composer-zone"><Composer value={draft} isSending={isGenerating} onValueChange={setDraft} onSend={sendMessage} onNotify={notify} />{isGenerating && <button className="stop-button" type="button" onClick={stopGeneration}>Arrêter la démonstration</button>}</div>}
      </main>
      <FeedbackDialog key={reportedMessage?.id ?? 'closed'} message={reportedMessage} onClose={() => setReportedMessage(null)} onSubmit={submitReport} />
      {/* Zone live permanente : les lecteurs d’écran n’annoncent pas toujours une région créée avec son contenu. */}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast">{toast.tone === 'success' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}<p>{toast.message}</p><button type="button" aria-label="Fermer la notification" onClick={() => setToast(undefined)}><X size={16} /></button></div>}
      </div>
    </div>
  )
}
