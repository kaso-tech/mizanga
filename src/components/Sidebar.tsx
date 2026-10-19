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
  const navigate = (view: AppView) => {
    onNavigate(view)
    onClose()
  }

  return (
    <>
      <div className={`drawer-backdrop ${isOpen ? 'is-visible' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${isOpen ? 'is-open' : ''}`} aria-label="Navigation principale">
        <div className="sidebar-top">
          <Brand />
          <button className="icon-button close-drawer" type="button" aria-label="Fermer le menu" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <button className="new-chat-button" type="button" onClick={() => { onNewConversation(); onClose() }}>
          <MessageCirclePlus size={18} strokeWidth={2} />
          Nouvelle conversation
        </button>

        <div className="nav-section">
          <p className="nav-label">Conversations</p>
          <button className="nav-item search-item" type="button" onClick={() => navigate('history')}>
            <Search size={18} aria-hidden="true" />
            Rechercher dans l’historique
          </button>
          {primaryItems.map(({ label, view, icon: Icon }) => (
            <button
              key={view}
              className={`nav-item ${activeView === view ? 'is-active' : ''}`}
              type="button"
              onClick={() => navigate(view)}
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
              onClick={() => navigate(view)}
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
