import { ChevronUp, CircleHelp, Clock3, Bookmark, LogIn, PanelLeftClose, Search, Settings2, SquarePen, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Brand } from './Brand'
import type { AppView, Conversation } from '../domain/types'

interface SidebarProps {
  activeView: AppView
  conversations: Conversation[]
  activeConversationId?: string
  isOpen: boolean
  onClose: () => void
  onCollapse: () => void
  onNavigate: (view: AppView) => void
  onNewConversation: () => void
  onSelectConversation: (conversationId: string) => void
  onNotify: (message: string) => void
}

const menuItems: Array<{ label: string; view: AppView; icon: typeof Clock3 }> = [
  { label: 'Paramètres', view: 'settings', icon: Settings2 },
  { label: 'Historique', view: 'history', icon: Clock3 },
  { label: 'Favoris', view: 'favorites', icon: Bookmark },
  { label: 'À propos de Mizanga', view: 'about', icon: CircleHelp },
]

export function Sidebar({
  activeView,
  conversations,
  activeConversationId,
  isOpen,
  onClose,
  onCollapse,
  onNavigate,
  onNewConversation,
  onSelectConversation,
  onNotify,
}: SidebarProps) {
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Tiroir mobile : focus sur « Fermer » à l’ouverture, Échap pour fermer, retour du focus à la fermeture.
  useEffect(() => {
    if (!isOpen) return
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (returnFocusTo?.isConnected) returnFocusTo.focus()
    }
  }, [isOpen])

  // Menu du compte : fermeture au clic extérieur ou avec Échap.
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [menuOpen])

  const normalizedQuery = query.trim().toLocaleLowerCase('fr')
  const visibleConversations = normalizedQuery
    ? conversations.filter((conversation) => conversation.title?.toLocaleLowerCase('fr').includes(normalizedQuery))
    : conversations

  return (
    <>
      <div className={`drawer-backdrop ${isOpen ? 'is-visible' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${isOpen ? 'is-open' : ''}`} aria-label="Navigation principale">
        <div className="sidebar-top">
          <Brand />
          <button className="icon-button collapse-sidebar" type="button" aria-label="Replier la barre latérale" title="Replier la barre latérale" onClick={onCollapse}>
            <PanelLeftClose size={18} />
          </button>
          <button ref={closeButtonRef} className="icon-button close-drawer" type="button" aria-label="Fermer le menu" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <button className="new-chat-button" type="button" onClick={onNewConversation}>
          <SquarePen size={17} aria-hidden="true" />
          Nouvelle conversation
        </button>

        <label className="sidebar-search">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Rechercher dans les conversations</span>
          <input type="search" value={query} placeholder="Rechercher" onChange={(event) => setQuery(event.target.value)} />
        </label>

        <nav className="conversation-list" aria-label="Conversations de cette session">
          {conversations.length > 0 && <p className="nav-label">Cette session</p>}
          {visibleConversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`conversation-item ${conversation.id === activeConversationId && activeView === 'chat' ? 'is-active' : ''}`}
              aria-current={conversation.id === activeConversationId && activeView === 'chat' ? 'page' : undefined}
              onClick={() => onSelectConversation(conversation.id)}
            >
              {conversation.title}
            </button>
          ))}
          {conversations.length === 0 && (
            <p className="conversation-empty">Vos conversations apparaîtront ici. Elles ne sont pas encore enregistrées après la fermeture de la page.</p>
          )}
          {conversations.length > 0 && visibleConversations.length === 0 && (
            <p className="conversation-empty">Aucune conversation ne correspond à « {query.trim()} ».</p>
          )}
        </nav>

        <div className="sidebar-foot" ref={accountRef}>
          {menuOpen && (
            <div className="account-menu" id="account-menu">
              {menuItems.map(({ label, view, icon: Icon }) => (
                <button
                  key={view}
                  type="button"
                  className={activeView === view ? 'is-active' : ''}
                  onClick={() => {
                    setMenuOpen(false)
                    onNavigate(view)
                  }}
                >
                  <Icon size={17} aria-hidden="true" />
                  {label}
                </button>
              ))}
              <span className="account-menu-divider" />
              <button type="button" onClick={() => { setMenuOpen(false); onNotify('La connexion sera intégrée avec un backend sécurisé dans une prochaine phase.') }}>
                <LogIn size={17} aria-hidden="true" />
                Se connecter
              </button>
            </div>
          )}
          <button className="account-button" type="button" aria-expanded={menuOpen} aria-controls="account-menu" onClick={() => setMenuOpen((open) => !open)}>
            <span className="guest-avatar" aria-hidden="true">I</span>
            <span className="account-text"><strong>Invité</strong><small>Paramètres · À propos</small></span>
            <ChevronUp size={16} aria-hidden="true" className={menuOpen ? '' : 'is-flipped'} />
          </button>
        </div>
      </aside>
    </>
  )
}
