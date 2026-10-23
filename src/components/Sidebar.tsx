import { Download, Info, LogIn, MessageSquare, MessageSquarePlus, MoreHorizontal, PawPrint, Pencil, Printer, Search, Settings, ShoppingBag, Sprout, Star, Store, Trash2, X, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { accountInitial, type AccountView } from '../app/accountView'
import { Brand } from './Brand'
import { downloadConversation } from '../app/exportConversation'
import type { AppView, Conversation, ConversationKind, ConversationSummary } from '../domain/types'
import { searchConversations } from '../app/searchConversations'

/** Icône et nom de chaque espace de conversation, pour les reconnaître dans la liste. */
const conversationKinds: Record<ConversationKind, { icon: LucideIcon; label: string }> = {
  general: { icon: MessageSquare, label: 'Généraliste' },
  commerce: { icon: Store, label: 'Commerce' },
  elevage: { icon: PawPrint, label: 'Élevage' },
  agriculture: { icon: Sprout, label: 'Agriculture' },
}

/** Ligne de la liste : conversation du chatbot (sur l’appareil) ou d’un assistant Business (sur le compte). */
type SidebarItem =
  | { kind: 'general'; id: string; title: string; favorite: boolean; createdAt: string; conversation: Conversation }
  | { kind: Exclude<ConversationKind, 'general'>; id: string; title: string; favorite: boolean; createdAt: string; summary: ConversationSummary }

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
  onPrintConversation: (conversationId: string) => void
  account: AccountView
  onSignIn: () => void
  onOpenAccount: () => void
  /** Conversations des assistants de l’Espace Business, enregistrées sur le compte. */
  accountConversations?: ConversationSummary[]
  activeAccountConversationId?: string
  onSelectAccountConversation?: (summary: ConversationSummary) => void
  onRenameAccountConversation?: (id: string, title: string) => void
  onToggleAccountFavorite?: (id: string) => void
  onRemoveAccountConversation?: (id: string) => void
}

/** Tiroir mobile : focus sur « Fermer » à l’ouverture, Échap pour fermer, retour du focus à la fermeture. */
function useDrawerFocus(isOpen: boolean, onClose: () => void) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
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
  return closeButtonRef
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
  onPrintConversation,
  account,
  onSignIn,
  onOpenAccount,
  accountConversations = [],
  activeAccountConversationId,
  onSelectAccountConversation,
  onRenameAccountConversation,
  onToggleAccountFavorite,
  onRemoveAccountConversation,
}: SidebarProps) {
  const [query, setQuery] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const closeButtonRef = useDrawerFocus(isOpen, onClose)

  // Une seule liste, de la plus récente à la plus ancienne ; l’icône indique l’espace de chaque conversation.
  const normalizedQuery = query.trim().toLocaleLowerCase('fr')
  const items: SidebarItem[] = [
    ...searchConversations(conversations, query).map((conversation): SidebarItem => ({ kind: 'general', id: conversation.id, title: conversation.title || 'Sans titre', favorite: Boolean(conversation.favorite), createdAt: conversation.createdAt, conversation })),
    ...accountConversations
      .filter((summary) => summary.kind !== 'general' && (!normalizedQuery || (summary.title ?? '').toLocaleLowerCase('fr').includes(normalizedQuery)))
      .map((summary): SidebarItem => ({ kind: summary.kind as Exclude<ConversationKind, 'general'>, id: summary.id, title: summary.title || 'Sans titre', favorite: summary.favorite, createdAt: summary.createdAt, summary })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const visibleItems = items.filter((item) => !onlyFavorites || item.favorite)
  const emptyMessage = conversations.length + accountConversations.length === 0 ? 'Aucune conversation pour l’instant.' : onlyFavorites ? 'Aucun favori.' : 'Aucun résultat.'

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
            <span className="visually-hidden">Rechercher dans les conversations</span>
            <input type="search" value={query} placeholder="Rechercher dans l’historique" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="filter-tabs" role="group" aria-label="Filtrer les conversations">
            <button type="button" className={!onlyFavorites ? 'is-selected' : ''} aria-pressed={!onlyFavorites} onClick={() => setOnlyFavorites(false)}>Toutes</button>
            <button type="button" className={onlyFavorites ? 'is-selected' : ''} aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(true)}>Favoris</button>
          </div>
        </div>

        <nav className="conversation-list" aria-label="Conversations de cette session">
          <p className="nav-label">{savesConversations ? 'Conversations' : 'Cette session'}</p>
          {!savesConversations && <p className="nav-note">Non enregistré : disparaît à la fermeture.</p>}
          {visibleItems.length === 0 ? (
            <p className="conversation-empty">{emptyMessage}</p>
          ) : (
            <ul>
              {visibleItems.map((item) => (
                item.kind === 'general' ? (
                  <ConversationRow
                    key={item.id}
                    kind={item.kind}
                    title={item.title}
                    favorite={item.favorite}
                    isActive={item.id === activeConversationId && activeView === 'chat'}
                    onSelect={() => onSelectConversation(item.id)}
                    onToggleFavorite={() => onToggleFavorite(item.id)}
                    onRename={(title) => onRenameConversation(item.id, title)}
                    onRemove={() => onRemoveConversation(item.id)}
                    onExport={() => downloadConversation(item.conversation)}
                    onPrint={() => onPrintConversation(item.id)}
                  />
                ) : (
                  <ConversationRow
                    key={item.id}
                    kind={item.kind}
                    title={item.title}
                    favorite={item.favorite}
                    isActive={item.id === activeAccountConversationId && activeView === 'business'}
                    onSelect={() => onSelectAccountConversation?.(item.summary)}
                    onToggleFavorite={() => onToggleAccountFavorite?.(item.id)}
                    onRename={(title) => onRenameAccountConversation?.(item.id, title)}
                    onRemove={() => onRemoveAccountConversation?.(item.id)}
                  />
                )
              ))}
            </ul>
          )}
        </nav>

        <div className="sidebar-foot">
          <button type="button" className={`nav-item ${activeView === 'marketplace' ? 'is-active' : ''}`} aria-current={activeView === 'marketplace' ? 'page' : undefined} onClick={() => onNavigate('marketplace')}>
            <ShoppingBag size={16} aria-hidden="true" /> Marketplace
          </button>
          <button type="button" className={`nav-item ${activeView === 'business' ? 'is-active' : ''}`} aria-current={activeView === 'business' ? 'page' : undefined} onClick={() => onNavigate('business')}>
            <Store size={16} aria-hidden="true" /> Espace Business
          </button>
          <button type="button" className={`nav-item ${activeView === 'settings' ? 'is-active' : ''}`} onClick={() => onNavigate('settings')}>
            <Settings size={16} aria-hidden="true" /> Paramètres
          </button>
          <button type="button" className={`nav-item ${activeView === 'about' ? 'is-active' : ''}`} onClick={() => onNavigate('about')}>
            <Info size={16} aria-hidden="true" /> À propos du projet
          </button>
          {account.status === 'signedIn' ? (
            <button type="button" className="nav-item account-nav" onClick={onOpenAccount}>
              <span className="account-chip is-small" aria-hidden="true">{accountInitial(account.email)}</span>
              <span className="account-nav-email">{account.email ?? 'Mon compte'}</span>
            </button>
          ) : (
            <button type="button" className="nav-item" disabled={account.status !== 'signedOut'} onClick={onSignIn}>
              <LogIn size={16} aria-hidden="true" /> {account.status === 'unavailable' ? 'Connexion' : 'Se connecter'}
              {account.status === 'unavailable' && <span className="soon-badge">Bientôt</span>}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}

interface ConversationRowProps {
  kind: ConversationKind
  title: string
  favorite: boolean
  isActive: boolean
  onSelect: () => void
  onToggleFavorite: () => void
  onRename: (title: string) => void
  onRemove: () => void
  /** Absents (conversations d’assistant) : pas d’export ni d’impression. */
  onExport?: () => void
  onPrint?: () => void
}

/** Ligne de l’historique : espace (icône), ouverture, favori, et menu « … » (renommer, exporter, supprimer). */
function ConversationRow({ kind, title, favorite, isActive, onSelect, onToggleFavorite, onRename, onRemove, onExport, onPrint }: ConversationRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const rowRef = useRef<HTMLLIElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const { icon: KindIcon, label: kindLabel } = conversationKinds[kind]
  const renameId = `rename-${useId()}`

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
        <label className="visually-hidden" htmlFor={renameId}>Nouveau titre</label>
        <input
          id={renameId}
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
      <button type="button" className={`conversation-item ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined} onClick={onSelect} title={`${kindLabel} · ${title}`}>
        <KindIcon size={15} className={`conversation-kind is-${kind}`} aria-hidden="true" />
        <span className="visually-hidden">{kindLabel} : </span>
        <span className="conversation-title">{title}</span>
      </button>
      <button
        type="button"
        className={`row-action is-star ${favorite ? 'is-on' : ''}`}
        aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        aria-pressed={favorite}
        onClick={onToggleFavorite}
      >
        <Star size={16} fill={favorite ? 'currentColor' : 'none'} />
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
          {onExport && (
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onExport() }}>
              <Download size={15} aria-hidden="true" /> Exporter (.md)
            </button>
          )}
          {onPrint && (
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onPrint() }}>
              <Printer size={15} aria-hidden="true" /> Imprimer ou PDF
            </button>
          )}
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); onRemove() }}>
            <Trash2 size={15} aria-hidden="true" /> Supprimer
          </button>
        </div>
      )}
    </li>
  )
}
