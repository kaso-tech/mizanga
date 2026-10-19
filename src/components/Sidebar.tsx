import {
  Bookmark,
  CircleHelp,
  Clock3,
  LogIn,
  MessageCirclePlus,
  Search,
  Settings2,
  X,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Brand } from './Brand'
import type { AppView } from '../domain/types'

interface SidebarProps {
  activeView: AppView
  isOpen: boolean
  onClose: () => void
  onNavigate: (view: AppView) => void
  onNewConversation: () => void
  onNotify: (message: string) => void
}

const primaryItems: Array<{ label: string; view: AppView; icon: typeof Clock3 }> = [
  { label: 'Historique', view: 'history', icon: Clock3 },
  { label: 'Favoris', view: 'favorites', icon: Bookmark },
]

const secondaryItems: Array<{ label: string; view: AppView; icon: typeof Settings2 }> = [
  { label: 'Paramètres', view: 'settings', icon: Settings2 },
  { label: 'À propos du projet', view: 'about', icon: CircleHelp },
]

export function Sidebar({ activeView, isOpen, onClose, onNavigate, onNewConversation, onNotify }: SidebarProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
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

  return (
    <>
      <div className={`drawer-backdrop ${isOpen ? 'is-visible' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${isOpen ? 'is-open' : ''}`} aria-label="Navigation principale">
        <div className="sidebar-top">
          <Brand />
          <button ref={closeButtonRef} className="icon-button close-drawer" type="button" aria-label="Fermer le menu" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <button className="new-chat-button" type="button" onClick={onNewConversation}>
          <MessageCirclePlus size={18} strokeWidth={2} />
          Nouvelle conversation
        </button>

        <div className="nav-section">
          <p className="nav-label">Conversations</p>
          <button className="nav-item search-item" type="button" disabled>
            <Search size={18} aria-hidden="true" />
            Rechercher
            <span className="coming-label">Bientôt</span>
          </button>
          {primaryItems.map(({ label, view, icon: Icon }) => (
            <button
              key={view}
              className={`nav-item ${activeView === view ? 'is-active' : ''}`}
              type="button"
              onClick={() => onNavigate(view)}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="nav-section nav-section-bottom">
          {secondaryItems.map(({ label, view, icon: Icon }) => (
            <button
              key={view}
              className={`nav-item ${activeView === view ? 'is-active' : ''}`}
              type="button"
              onClick={() => onNavigate(view)}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="guest-row">
            <span className="guest-avatar" aria-hidden="true">I</span>
            <span><strong>Mode invité</strong><small>Non connecté</small></span>
          </div>
          <button className="login-row" type="button" onClick={() => onNotify('La connexion sera intégrée avec un backend sécurisé dans une prochaine phase.') }>
            <LogIn size={17} />
            Se connecter
          </button>
        </div>
      </aside>
    </>
  )
}
