import { LogIn, LogOut, PanelLeft, Settings, ShoppingBag, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { accountInitial, type AccountView } from '../app/accountView'

interface HeaderProps {
  isMenuOpen: boolean
  isDemonstration: boolean
  onToggleSidebar: () => void
  /** Ouvre la marketplace (accessible depuis l’en-tête, sur toutes les pages). */
  onOpenMarketplace: () => void
  isMarketplaceActive: boolean
  /** Nouvelles annonces trouvées par les alertes de recherche (pastille). */
  marketplaceAlerts?: number
  onOpenSettings: () => void
  account: AccountView
  onSignIn: () => void
  onOpenAccount: () => void
  onSignOut: () => void
}

/**
 * Bouton profil de l’en-tête et son menu : connexion ou compte, paramètres et déconnexion,
 * regroupés pour ne garder que l’essentiel dans l’en-tête.
 */
function ProfileMenu({ account, onSignIn, onOpenAccount, onOpenSettings, onSignOut }: Pick<HeaderProps, 'account' | 'onSignIn' | 'onOpenAccount' | 'onOpenSettings' | 'onSignOut'>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const signedIn = account.status === 'signedIn'

  useEffect(() => {
    if (!open) return
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const choose = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        className={signedIn ? 'account-chip' : 'icon-button'}
        type="button"
        aria-label={signedIn ? `Compte : ${account.email ?? 'connecté'}` : 'Profil'}
        title={signedIn ? (account.email ?? 'Compte') : 'Profil'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {signedIn ? accountInitial(account.email) : <UserRound size={20} />}
      </button>
      {open && (
        <div className="profile-menu-panel" role="menu" aria-label="Profil">
          {signedIn ? (
            <>
              <p className="profile-menu-email">{account.email ?? 'Connecté'}</p>
              <button type="button" role="menuitem" onClick={choose(onOpenAccount)}><UserRound size={16} aria-hidden="true" /> Mon compte</button>
            </>
          ) : (
            <button type="button" role="menuitem" disabled={account.status !== 'signedOut'} onClick={choose(onSignIn)}>
              <LogIn size={16} aria-hidden="true" /> {account.status === 'unavailable' ? 'Connexion (bientôt disponible)' : 'Se connecter'}
            </button>
          )}
          <button type="button" role="menuitem" onClick={choose(onOpenSettings)}><Settings size={16} aria-hidden="true" /> Paramètres</button>
          {signedIn && <button type="button" role="menuitem" onClick={choose(onSignOut)}><LogOut size={16} aria-hidden="true" /> Se déconnecter</button>}
        </div>
      )}
    </div>
  )
}

export function Header({
  isMenuOpen,
  isDemonstration,
  onToggleSidebar,
  onOpenMarketplace,
  isMarketplaceActive,
  marketplaceAlerts = 0,
  onOpenSettings,
  account,
  onSignIn,
  onOpenAccount,
  onSignOut,
}: HeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-start">
        <button
          className="icon-button"
          type="button"
          aria-label={isMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={isMenuOpen}
          onClick={onToggleSidebar}
        >
          <PanelLeft size={20} />
        </button>
      </div>

      <div className="topbar-actions">
        {isDemonstration && <span className="model-badge">Démonstration</span>}
        <button
          className={`icon-button ${isMarketplaceActive ? 'is-active' : ''}`}
          type="button"
          aria-label={marketplaceAlerts > 0 ? `Marketplace, ${marketplaceAlerts} nouvelle${marketplaceAlerts > 1 ? 's' : ''} annonce${marketplaceAlerts > 1 ? 's' : ''} pour vos alertes` : 'Marketplace'}
          aria-current={isMarketplaceActive ? 'page' : undefined}
          title="Marketplace"
          onClick={onOpenMarketplace}
        >
          <ShoppingBag size={20} />
          {marketplaceAlerts > 0 && <span className="icon-badge" aria-hidden="true">{marketplaceAlerts > 9 ? '9+' : marketplaceAlerts}</span>}
        </button>
        <ProfileMenu account={account} onSignIn={onSignIn} onOpenAccount={onOpenAccount} onOpenSettings={onOpenSettings} onSignOut={onSignOut} />
      </div>
    </header>
  )
}
