import { Download, Info, LogIn, MessageSquarePlus, MoreHorizontal, Pencil, Search, Settings, Star, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Brand } from './Brand'
import { downloadConversation } from '../app/exportConversation'
import type { AppView, Conversation } from '../domain/types'

interface SidebarProps {
  activeView: AppView
  conversations: Conversation[]
  activeConversationId?: string
  savesConversations: boolean
  isOpen: boolean
  onClose: () => void
  onNavigate: (view: AppView) => void
  onNewConversation: () => void
  onSelectConversation: (conversationId: string) => void
  onRemoveConversation: (conversationId: string) => void
  onRenameConversation: (conversationId: string, title: string) => void
  onToggleFavorite: (conversationId: string) => void
}

export function Sidebar({
  activeView,
  conversations,
  activeConversationId,
  savesConversations,
  isOpen,
  onClose,
  onNavigate,
  onNewConversation,
  onSelectConversation,
  onRemoveConversation,
  onRenameConversation,
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
          <p className="nav-label">{savesConversations ? 'Conversations' : 'Cette session'}</p>
          <p className="nav-note">{savesConversations ? 'Enregistré sur cet appareil uniquement.' : 'Non enregistré : l’historique disparaît à la fermeture de la page.'}</p>
          {visibleConversations.length === 0 ? (
            <p className="conversation-empty">{emptyMessage}</p>
          ) : (
            <ul>
              {visibleConversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId && activeView === 'chat'
                return (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    isActive={isActive}
                    onSelect={() => onSelectConversation(conversation.id)}
                    onToggleFavorite={() => onToggleFavorite(conversation.id)}
                    onRename={(title) => onRenameConversation(conversation.id, title)}
                    onRemove={() => onRemoveConversation(conversation.id)}
                  />
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

interface ConversationRowProps {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
  onToggleFavorite: () => void
  onRename: (title: string) => void
  onRemove: () => void
}

/** Ligne de l’historique : ouverture, favori, et menu « … » (renommer, exporter, supprimer). */
function ConversationRow({ conversation, isActive, onSelect, onToggleFavorite, onRename, onRemove }: ConversationRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const rowRef = useRef<HTMLLIElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const title = conversation.title || 'Sans titre'

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    // Échap ferme le menu sans fermer le tiroir mobile qui le contient.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [menuOpen])

  if (renaming !== null) {
    const save = () => {
      if (renaming.trim()) onRename(renaming)
      setRenaming(null)
    }
    return (
      <li className="conversation-row">
        <label className="visually-hidden" htmlFor={`rename-${conversation.id}`}>Nouveau titre</label>
        <input
          id={`rename-${conversation.id}`}
          className="rename-input"
          autoFocus
          maxLength={80}
          value={renaming}
          onChange={(event) => setRenaming(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
            if (event.key === 'Escape') {
              event.stopPropagation()
              setRenaming(null)
            }
          }}
        />
      </li>
    )
  }

  return (
    <li ref={rowRef} className="conversation-row">
      <button type="button" className={`conversation-item ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined} onClick={onSelect}>
        {title}
      </button>
      <button
        type="button"
        className={`row-action is-star ${conversation.favorite ? 'is-on' : ''}`}
        aria-label={conversation.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        aria-pressed={Boolean(conversation.favorite)}
        onClick={onToggleFavorite}
      >
        <Star size={16} fill={conversation.favorite ? 'currentColor' : 'none'} />
      </button>
      <button
        ref={menuButtonRef}
        type="button"
        className="row-action"
        aria-label={`Options pour « ${title} »`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoreHorizontal size={16} />
      </button>
      {menuOpen && (
        <div className="row-menu" role="menu" aria-label={`Options pour « ${title} »`}>
          <button type="button" role="menuitem" autoFocus onClick={() => { setMenuOpen(false); setRenaming(title) }}>
            <Pencil size={15} aria-hidden="true" /> Renommer
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); downloadConversation(conversation) }}>
            <Download size={15} aria-hidden="true" /> Exporter (.md)
          </button>
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); onRemove() }}>
            <Trash2 size={15} aria-hidden="true" /> Supprimer
          </button>
        </div>
      )}
    </li>
  )
}
