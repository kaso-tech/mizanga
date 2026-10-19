import { CheckCircle2, X } from 'lucide-react'
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

function getViewFromPath(pathname: string): AppView {
  const entry = Object.entries(routeByView).find(([, path]) => path === pathname)
  return (entry?.[0] as AppView | undefined) ?? 'chat'
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>(() => getViewFromPath(window.location.pathname))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [preferences, setPreferences] = useState<LinguisticPreferences>(defaultPreferences)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string>()
  const [reportedMessage, setReportedMessage] = useState<ChatMessage | null>(null)
  const [toast, setToast] = useState<string>()
  const generationTimer = useRef<number>()
  const toastTimer = useRef<number>()

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme
  }, [preferences.theme])

  useEffect(() => {
    const syncPath = () => setActiveView(getViewFromPath(window.location.pathname))
    window.addEventListener('popstate', syncPath)
    return () => window.removeEventListener('popstate', syncPath)
  }, [])

  useEffect(() => () => {
    if (generationTimer.current) window.clearTimeout(generationTimer.current)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
  }, [])

  const notify = (message: string) => {
    setToast(message)
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
    notify('Nouvelle conversation locale prête. Rien n’a été enregistré.')
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

  const copyMessage = (message: ChatMessage) => {
    void navigator.clipboard?.writeText(message.content).catch(() => undefined)
    setCopiedMessageId(message.id)
    notify('Réponse copiée dans le presse-papiers.')
    window.setTimeout(() => setCopiedMessageId(undefined), 1800)
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
      <FeedbackDialog message={reportedMessage} onClose={() => setReportedMessage(null)} onSubmit={submitReport} />
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><p>{toast}</p><button type="button" aria-label="Fermer la notification" onClick={() => setToast(undefined)}><X size={16} /></button></div>}
    </div>
  )
}
