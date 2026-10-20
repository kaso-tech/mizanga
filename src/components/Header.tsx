import { Menu, PanelLeftOpen, SquarePen } from 'lucide-react'

interface HeaderProps {
  title: string
  isDrawerOpen: boolean
  isSidebarCollapsed: boolean
  canShare: boolean
  onMenuToggle: () => void
  onExpandSidebar: () => void
  onNewConversation: () => void
  onNotify: (message: string) => void
}

export function Header({
  title,
  isDrawerOpen,
  isSidebarCollapsed,
  canShare,
  onMenuToggle,
  onExpandSidebar,
  onNewConversation,
  onNotify,
}: HeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-start">
        <button className="icon-button mobile-menu-button" type="button" aria-label={isDrawerOpen ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={onMenuToggle}>
          <Menu size={21} strokeWidth={1.9} />
        </button>
        {isSidebarCollapsed && (
          <button className="icon-button expand-sidebar" type="button" aria-label="Afficher la barre latérale" title="Afficher la barre latérale" onClick={onExpandSidebar}>
            <PanelLeftOpen size={18} />
          </button>
        )}
        <p className="topbar-title">{title}</p>
      </div>

      <div className="topbar-actions">
        {canShare && (
          <button className="pill-button share-button" type="button" onClick={() => onNotify('Le partage de conversations sera disponible avec les comptes utilisateurs.')}>
            Partager
          </button>
        )}
        <button className="pill-button is-strong login-button" type="button" onClick={() => onNotify('Les comptes utilisateurs seront disponibles dans une prochaine phase.')}>
          Se connecter
        </button>
        <button className="icon-button mobile-new-chat" type="button" aria-label="Nouvelle conversation" onClick={onNewConversation}>
          <SquarePen size={19} />
        </button>
      </div>
    </header>
  )
}
