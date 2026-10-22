import { CheckCircle2, Info, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ChatView } from '../components/ChatView'
import { Composer } from '../components/Composer'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import type { AiService } from '../domain/services'
import { responseLanguageLabels } from '../data/content'
import { defaultPreferences, type AppView, type Attachment, type ChatMessage, type LinguisticFeedback, type LinguisticPreferences, type MessageRating } from '../domain/types'
import type { AuthClientFactory, AuthConfig } from '../services/authService'
import { demoAiService } from '../services/demoAiService'
import { MAX_CUSTOM_INSTRUCTIONS_CHARS, MAX_MESSAGE_CHARS } from '../services/remoteAiService'
import { prepareAttachments } from './attachments'
import { createBackup, readBackup } from './conversationStorage'
import { downloadFile } from './exportConversation'
import { addSavedPrompt, loadSavedPrompts, storeSavedPrompts, type SavedPrompt } from './savedPrompts'
import { isSpeechSupported, speak, speechRates, stopSpeaking } from './speech'
import { useAccount } from './useAccount'
import { useConversation } from './useConversation'

// Pages secondaires chargées à la demande : l’accueil s’affiche plus vite sur réseau mobile.
const SettingsView = lazy(() => import('../components/SettingsView').then((module) => ({ default: module.SettingsView })))
// Console d’administration : protégée par le serveur, jamais liée depuis l’interface des utilisateurs.
const AdminView = lazy(() => import('../components/AdminView').then((module) => ({ default: module.AdminView })))
const AboutView = lazy(() => import('../components/AboutView').then((module) => ({ default: module.AboutView })))
const CollectionView = lazy(() => import('../components/CollectionView').then((module) => ({ default: module.CollectionView })))
const AccountDialog = lazy(() => import('../components/AccountDialog').then((module) => ({ default: module.AccountDialog })))
const FeedbackDialog = lazy(() => import('../components/FeedbackDialog').then((module) => ({ default: module.FeedbackDialog })))

const routeByView: Record<AppView, string> = {
  chat: '/',
  history: '/historique',
  favorites: '/favoris',
  settings: '/parametres',
  about: '/a-propos',
  admin: '/admin',
}

/** Anciennes adresses conservées pour les liens existants. */
const legacyRoutes: Record<string, AppView> = { '/evaluation': 'admin' }

const titleByView: Record<AppView, string> = {
  chat: 'Conversation',
  history: 'Historique',
  favorites: 'Favoris',
  settings: 'Paramètres',
  about: 'À propos',
  admin: 'Administration',
}

const themeColorByTheme: Record<'light' | 'dark', string> = {
  light: '#fcf9f3',
  dark: '#1a120e',
}

function getViewFromPath(pathname: string): AppView {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  const entry = Object.entries(routeByView).find(([, path]) => path === normalizedPath)
  return (entry?.[0] as AppView | undefined) ?? legacyRoutes[normalizedPath] ?? 'chat'
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

function useIsOnline() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return isOnline
}

const preferencesStorageKey = 'gilli.preferences.v1'

/** Préférences conservées sur cet appareil uniquement ; une valeur illisible ou inconnue est ignorée. */
function loadPreferences(): LinguisticPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(preferencesStorageKey) ?? '{}') as Partial<LinguisticPreferences>
    return {
      ...defaultPreferences,
      ...(stored.responseLanguage && Object.hasOwn(responseLanguageLabels, stored.responseLanguage) ? { responseLanguage: stored.responseLanguage } : {}),
      ...(stored.userWritingMode === 'standard' || stored.userWritingMode === 'informal' ? { userWritingMode: stored.userWritingMode } : {}),
      ...(stored.theme === 'light' || stored.theme === 'dark' || stored.theme === 'system' ? { theme: stored.theme } : {}),
      ...(stored.modelTier === 'standard' || stored.modelTier === 'lite' ? { modelTier: stored.modelTier } : {}),
      ...(stored.textSize && ['small', 'normal', 'large', 'xlarge'].includes(stored.textSize) ? { textSize: stored.textSize } : {}),
      ...(typeof stored.saveConversations === 'boolean' ? { saveConversations: stored.saveConversations } : {}),
      ...(typeof stored.customInstructions === 'string' ? { customInstructions: stored.customInstructions.slice(0, MAX_CUSTOM_INSTRUCTIONS_CHARS) } : {}),
      ...(typeof stored.readAloud === 'boolean' ? { readAloud: stored.readAloud } : {}),
      ...(typeof stored.speechRate === 'number' && speechRates.includes(stored.speechRate) ? { speechRate: stored.speechRate } : {}),
      ...(typeof stored.voiceName === 'string' ? { voiceName: stored.voiceName } : {}),
    }
  } catch {
    return defaultPreferences
  }
}

type ToastTone = 'success' | 'info'

/** FileReader plutôt que `file.text()`, absent des navigateurs anciens. */
const readTextFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result ?? ''))
  reader.onerror = () => reject(reader.error)
  reader.readAsText(file)
})

interface AppProps {
  /** Fournisseur d’IA injecté : remplacer l’adaptateur de démonstration ne touche pas l’interface. */
  aiService?: AiService
  /** Accès à Supabase Auth annoncé par le serveur ; absent, les comptes sont indisponibles. */
  authConfig?: AuthConfig
  /** Création du client d’authentification (remplaçable dans les tests). */
  createAuthClient?: AuthClientFactory
}

export function App({ aiService = demoAiService, authConfig, createAuthClient }: AppProps) {
  const account = useAccount(authConfig, createAuthClient)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [settingsVisit, setSettingsVisit] = useState(0)
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
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([])
  const [isPreparingFiles, setIsPreparingFiles] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const [copiedMessageId, setCopiedMessageId] = useState<string>()
  const [reportedMessage, setReportedMessage] = useState<ChatMessage | null>(null)
  const [reportedPassage, setReportedPassage] = useState('')
  const [speakingMessageId, setSpeakingMessageId] = useState<string>()
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>(loadSavedPrompts)
  const isMobile = useIsMobileLayout()
  // La démonstration fonctionne sans réseau ; un vrai moteur, non.
  const isOffline = !useIsOnline() && !aiService.isDemonstration
  const [toast, setToast] = useState<{ message: string; tone: ToastTone }>()
  const [sendWhenOnline, setSendWhenOnline] = useState(false)
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

  useEffect(() => {
    document.documentElement.dataset.textSize = preferences.textSize
  }, [preferences.textSize])

  const conversationTitle = conversation.activeConversation?.title
  useEffect(() => {
    const pageTitle = activeView === 'chat' ? conversationTitle : titleByView[activeView]
    document.title = pageTitle ? `${pageTitle} — Gilli` : 'Gilli'
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

  const accountView = { status: account.status, email: account.user?.email ?? null }

  /** Ouvre Paramètres › Compte (remonte la page pour afficher le bon onglet). */
  const openAccountSettings = () => {
    window.history.pushState({}, '', `${routeByView.settings}#compte`)
    setActiveView('settings')
    setSettingsVisit((visit) => visit + 1)
    setDrawerOpen(false)
  }

  const signOut = async () => {
    try {
      await account.client?.signOut()
      notify('Vous êtes déconnecté.', 'success')
    } catch {
      notify('La déconnexion a échoué. Réessayez.')
    }
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

  // La lecture à voix haute s’arrête quand on change de conversation ou de page.
  const activeConversationId = conversation.activeConversation?.id
  useEffect(() => {
    stopSpeaking()
    setSpeakingMessageId(undefined)
  }, [activeConversationId, activeView])

  const toggleSpeech = (message: ChatMessage) => {
    if (speakingMessageId === message.id) {
      stopSpeaking()
      setSpeakingMessageId(undefined)
      return
    }
    setSpeakingMessageId(message.id)
    speak(message.content, {
      rate: preferences.speechRate,
      voiceName: preferences.voiceName,
      onEnd: () => setSpeakingMessageId((current) => (current === message.id ? undefined : current)),
    })
  }

  const savedPromptsLoaded = useRef(false)
  useEffect(() => {
    if (!savedPromptsLoaded.current) {
      savedPromptsLoaded.current = true
      return
    }
    storeSavedPrompts(savedPrompts)
  }, [savedPrompts])

  /** Renvoie vrai si la consigne a été enregistrée. */
  const savePrompt = (prompt: string, title?: string) => {
    const result = addSavedPrompt(savedPrompts, prompt, title)
    if (result.problem === 'duplicate') notify('Cette consigne est déjà enregistrée.')
    else if (result.problem === 'full') notify('Vous avez atteint la limite de consignes enregistrées. Supprimez-en une dans Paramètres › Personnalisation.')
    if (result.problem) return false
    setSavedPrompts(result.prompts)
    notify('Consigne enregistrée. Retrouvez-la sur l’accueil ou en tapant « / » dans la zone de saisie.', 'success')
    return true
  }

  /** Quota du modèle principal épuisé : bascule sur le modèle économe (quota distinct) et relance. */
  const switchToLiteModel = () => {
    updatePreferences({ modelTier: 'lite' })
    conversation.regenerate({ modelTier: 'lite' })
    notify('Modèle économe activé. Vous pourrez revenir au modèle standard dans Paramètres › Général.', 'success')
  }

  const exportConversations = () => {
    downloadFile(`gilli-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, createBackup(conversation.conversations), 'application/json')
    notify('Sauvegarde téléchargée. Le contenu des fichiers joints n’y figure pas.', 'success')
  }

  const importConversations = async (file: File) => {
    const imported = readBackup(await readTextFile(file).catch(() => ''))
    if (!imported) {
      notify('Ce fichier n’est pas une sauvegarde de Gilli lisible.')
      return
    }
    const { added, updated } = conversation.importConversations(imported)
    const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`
    notify(added + updated === 0
      ? 'Aucune nouvelle conversation dans cette sauvegarde : votre historique est déjà à jour.'
      : `Sauvegarde restaurée : ${plural(added, 'conversation ajoutée')}${updated ? `, ${plural(updated, 'mise')} à jour` : ''}.`, 'success')
  }

  const startNewConversation = () => {
    conversation.startNew()
    setDraft('')
    setDraftAttachments([])
    navigate('chat')
    setFocusToken((token) => token + 1)
  }

  // Impression (ou PDF) : la conversation est ouverte, puis imprimée une fois ses réponses mises en forme.
  const [printToken, setPrintToken] = useState(0)
  useEffect(() => {
    if (printToken === 0) return
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts++
      if (document.querySelector('.markdown-fallback, .page-loading') && attempts < 20) return
      window.clearInterval(timer)
      window.print()
    }, 100)
    return () => window.clearInterval(timer)
  }, [printToken])

  const printConversation = (conversationId: string) => {
    selectConversation(conversationId)
    setPrintToken((token) => token + 1)
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
    conversation.send(content, draftAttachments)
    setDraft('')
    setDraftAttachments([])
  }

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    setIsPreparingFiles(true)
    try {
      const { attachments, problems } = await prepareAttachments(files, draftAttachments)
      setDraftAttachments((current) => [...current, ...attachments])
      if (problems.length > 0) notify(problems.join(' '))
    } catch {
      notify('Le fichier n’a pas pu être lu. Essayez un autre format ou une image plus petite.')
    } finally {
      setIsPreparingFiles(false)
    }
  }

  // Message mis en attente hors connexion : il part dès le retour du réseau (sauf s’il a été vidé entre-temps).
  const hasDraft = draft.trim().length > 0 || draftAttachments.length > 0
  useEffect(() => {
    if (!sendWhenOnline) return
    if (!hasDraft) {
      setSendWhenOnline(false)
      return
    }
    if (isOffline || conversation.isGenerating) return
    setSendWhenOnline(false)
    sendMessage(draft)
    notify('Connexion rétablie : votre message a été envoyé.', 'success')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- seul le retour du réseau (ou un brouillon vidé) doit déclencher l’envoi
  }, [isOffline, sendWhenOnline, hasDraft])

  const stopLabel = aiService.isDemonstration ? 'Arrêter la démonstration' : 'Arrêter la génération'
  const stopGeneration = () => {
    conversation.stop()
    notify(aiService.isDemonstration ? 'La démonstration a été arrêtée. Aucun appel IA n’était en cours.' : 'Génération arrêtée.')
  }

  // Raccourcis : Échap arrête la génération, Ctrl/Cmd + Maj + O ouvre une nouvelle conversation.
  const shortcutsRef = useRef({ isGenerating: false, stop: stopGeneration, startNew: () => {} })
  shortcutsRef.current = { isGenerating: conversation.isGenerating, stop: stopGeneration, startNew: () => startNewConversation() }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"]')) return
      if (event.key === 'Escape' && shortcutsRef.current.isGenerating) {
        event.preventDefault()
        shortcutsRef.current.stop()
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        shortcutsRef.current.startNew()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const copyMessage = async (message: ChatMessage) => {
    try {
      // navigator.clipboard est absent hors contexte sécurisé (HTTP) : l’appel échoue alors comme un refus.
      await navigator.clipboard.writeText(message.content)
    } catch {
      notify('La copie a échoué : votre navigateur n’autorise pas l’accès au presse-papiers. Sélectionnez le texte pour le copier.')
      return
    }
    setCopiedMessageId(message.id)
    notify(message.role === 'user' ? 'Message copié dans le presse-papiers.' : 'Réponse copiée dans le presse-papiers.', 'success')
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
      isOffline={isOffline}
      isQueued={sendWhenOnline}
      onQueueChange={setSendWhenOnline}
      stopLabel={stopLabel}
      focusToken={focusToken}
      attachments={draftAttachments}
      isPreparingFiles={isPreparingFiles}
      onAddFiles={(files) => void addFiles(files)}
      onRemoveAttachment={(id) => setDraftAttachments((current) => current.filter((attachment) => attachment.id !== id))}
      onValueChange={setDraft}
      onSend={sendMessage}
      onStop={stopGeneration}
      onNotify={notify}
      savedPrompts={savedPrompts}
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
            key={settingsVisit}
            preferences={preferences}
            account={accountView}
            onSignIn={() => setAccountDialogOpen(true)}
            onSignOut={() => void signOut()}
            engine={{ label: aiService.label, isDemonstration: aiService.isDemonstration, offersLiteModel: aiService.offersLiteModel }}
            conversationCount={conversation.conversations.length}
            onChange={updatePreferences}
            onResetPreferences={() => {
              setPreferences(defaultPreferences)
              notify('Préférences réinitialisées.', 'success')
            }}
            onClearConversations={() => {
              conversation.clearAll()
              setDraft('')
              notify('Toutes les conversations de cette session ont été supprimées.', 'success')
            }}
            onExportConversations={exportConversations}
            savedPrompts={savedPrompts}
            onAddPrompt={savePrompt}
            onDeletePrompt={(id) => setSavedPrompts((current) => current.filter((item) => item.id !== id))}
            onImportConversations={(file) => void importConversations(file)}
          />
        )
      case 'admin':
        return <AdminView aiService={aiService} preferences={preferences} onNotify={notify} />
      case 'about':
        return <AboutView engineLabel={aiService.label} isDemonstration={aiService.isDemonstration} />
      default:
        return (
          <ChatView
            messages={conversation.messages}
            isGenerating={conversation.isGenerating}
            isDemonstration={aiService.isDemonstration}
            composer={composer}
            copiedMessageId={copiedMessageId}
            onSuggestion={(prompt) => { setDraft(prompt); setFocusToken((token) => token + 1) }}
            onNewConversation={startNewConversation}
            onCopy={copyMessage}
            onRegenerate={() => conversation.regenerate()}
            onUseLiteModel={aiService.offersLiteModel && preferences.modelTier !== 'lite' ? switchToLiteModel : undefined}
            onEditLastMessage={conversation.editLastUserMessage}
            onRate={rateMessage}
            onReport={openReport}
            speakingMessageId={speakingMessageId}
            onSelectVersion={(message, index) => conversation.selectVersion(message.id, index)}
            savedPrompts={savedPrompts}
            onSavePrompt={(prompt) => void savePrompt(prompt)}
            onSpeak={preferences.readAloud && isSpeechSupported() ? toggleSpeech : undefined}
            title={conversation.activeConversation?.title}
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
        onRenameConversation={conversation.rename}
        onToggleFavorite={conversation.toggleFavorite}
        onPrintConversation={printConversation}
        account={accountView}
        onSignIn={() => { setDrawerOpen(false); setAccountDialogOpen(true) }}
        onOpenAccount={openAccountSettings}
      />
      <main className={`main-area ${isEmptyChat ? 'is-empty-chat' : ''}`}>
        <Header
          isMenuOpen={isMobile ? drawerOpen : !sidebarCollapsed}
          isDemonstration={aiService.isDemonstration}
          offersLiteModel={Boolean(aiService.offersLiteModel)}
          modelTier={preferences.modelTier}
          onToggleSidebar={toggleSidebar}
          onModelTierChange={(modelTier) => updatePreferences({ modelTier })}
          onOpenSettings={() => navigate('settings')}
          account={accountView}
          onSignIn={() => setAccountDialogOpen(true)}
          onOpenAccount={openAccountSettings}
        />
        <div className="content-scroll"><div className="content-frame"><Suspense fallback={<div className="page-loading" aria-busy="true" />}>{renderView()}</Suspense></div></div>
        {activeView === 'chat' && !isEmptyChat && (
          <div className="composer-zone">{composer}</div>
        )}
      </main>
      {accountDialogOpen && account.client && (
        <Suspense fallback={null}>
          <AccountDialog
            client={account.client}
            onClose={() => setAccountDialogOpen(false)}
            onSignedIn={() => {
              setAccountDialogOpen(false)
              notify('Vous êtes connecté.', 'success')
            }}
          />
        </Suspense>
      )}
      {reportedMessage && (
        <Suspense fallback={null}>
        <FeedbackDialog key={reportedMessage?.id ?? 'closed'} message={reportedMessage} initialPassage={reportedPassage} onClose={() => setReportedMessage(null)} onSubmit={submitReport} />
        </Suspense>
      )}
      {/* Zone live permanente : les lecteurs d’écran n’annoncent pas toujours une région créée avec son contenu. */}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast">{toast.tone === 'success' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}<p>{toast.message}</p><button type="button" aria-label="Fermer la notification" onClick={() => setToast(undefined)}><X size={16} /></button></div>}
      </div>
    </div>
  )
}
