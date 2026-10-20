import { Info, LogIn, MessageSquarePlus, Search, Settings, Star, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Brand } from './Brand'
import type { AppView, Conversation } from '../domain/types'

interface SidebarProps {
  activeView: AppView
  conversations: Conversation[]
  activeConversationId?: string
  isOpen: boolean
  onClose: () => void
  onNavigate: (view: AppView) => void
  onNewConversation: () => void
  onSelectConversation: (conversationId: string) => void
  onRemoveConversation: (conversationId: string) => void
  onToggleFavorite: (conversationId: string) => void
}

export function Sidebar({
  activeView,
  conversations,
  activeConversationId,
  isOpen,
  onClose,
  onNavigate,
  onNewConversation,
  onSelectConversation,
  onRemoveConversation,
  onToggleFavorite,
}: SidebarProps) {
  const [query, setQuery] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
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

  const normalizedQuery = query.trim().toLocaleLowerCase('fr')
  const visibleConversations = conversations.filter((conversation) => (
    (!onlyFavorites || conversation.favorite) && (conversation.title ?? '').toLocaleLowerCase('fr').includes(normalizedQuery)
  ))
  const emptyMessage = conversations.length === 0 ? 'Aucune conversation pour l’instant.' : onlyFavorites ? 'Aucun favori.' : 'Aucun résultat.'

  return (
    <>
      <div className={`drawer-backdrop ${isOpen ? 'is-visible' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${isOpen ? 'is-open' : ''}`} aria-label="Navigation principale">
        <div className="weave-band sidebar-band" aria-hidden="true" />
        <div className="sidebar-top">
          <Brand />
          <button ref={closeButtonRef} className="icon-button close-drawer" type="button" aria-label="Fermer le menu" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-controls">
          <button className="new-chat-button" type="button" onClick={onNewConversation}>
            <MessageSquarePlus size={16} aria-hidden="true" />
            Nouvelle conversation
          </button>
          <label className="sidebar-search">
            <Search size={16} aria-hidden="true" />
            <span className="visually-hidden">Rechercher dans l’historique</span>
            <input type="search" value={query} placeholder="Rechercher dans l’historique" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="filter-tabs" role="group" aria-label="Filtrer les conversations">
            <button type="button" className={!onlyFavorites ? 'is-selected' : ''} aria-pressed={!onlyFavorites} onClick={() => setOnlyFavorites(false)}>Toutes</button>
            <button type="button" className={onlyFavorites ? 'is-selected' : ''} aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(true)}>Favoris</button>
          </div>
        </div>

        <nav className="conversation-list" aria-label="Conversations de cette session">
          <p className="nav-label">Cette session</p>
          <p className="nav-note">Non enregistré : l’historique disparaît à la fermeture de la page.</p>
          {visibleConversations.length === 0 ? (
            <p className="conversation-empty">{emptyMessage}</p>
          ) : (
            <ul>
              {visibleConversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId && activeView === 'chat'
                return (
                  <li key={conversation.id} className="conversation-row">
                    <button
                      type="button"
                      className={`conversation-item ${isActive ? 'is-active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => onSelectConversation(conversation.id)}
                    >
                      {conversation.title || 'Sans titre'}
                    </button>
                    <button
                      type="button"
                      className={`row-action is-star ${conversation.favorite ? 'is-on' : ''}`}
                      aria-label={conversation.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                      aria-pressed={Boolean(conversation.favorite)}
                      onClick={() => onToggleFavorite(conversation.id)}
                    >
                      <Star size={16} fill={conversation.favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button type="button" className="row-action is-delete" aria-label={`Supprimer « ${conversation.title || 'Sans titre'} »`} onClick={() => onRemoveConversation(conversation.id)}>
                      <Trash2 size={16} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </nav>

        <div className="sidebar-foot">
          <button type="button" className={`nav-item ${activeView === 'settings' ? 'is-active' : ''}`} onClick={() => onNavigate('settings')}>
            <Settings size={16} aria-hidden="true" /> Paramètres
          </button>
          <button type="button" className={`nav-item ${activeView === 'about' ? 'is-active' : ''}`} onClick={() => onNavigate('about')}>
            <Info size={16} aria-hidden="true" /> À propos du projet
          </button>
          <button type="button" className="nav-item" disabled>
            <LogIn size={16} aria-hidden="true" /> Connexion
            <span className="soon-badge">Bientôt</span>
          </button>
        </div>
      </aside>
    </>
  )
}
