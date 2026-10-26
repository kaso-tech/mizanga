import { PanelLeft, Settings, ShoppingBag, UserRound } from 'lucide-react'
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
        <button className="icon-button" type="button" aria-label="Paramètres" title="Paramètres" onClick={onOpenSettings}>
          <Settings size={20} />
        </button>
        {account.status === 'signedIn' ? (
          <button className="account-chip" type="button" aria-label={`Compte : ${account.email ?? 'connecté'}`} title={account.email ?? 'Compte'} onClick={onOpenAccount}>
            {accountInitial(account.email)}
          </button>
        ) : (
          <button
            className="icon-button"
            type="button"
            disabled={account.status !== 'signedOut'}
            aria-label={account.status === 'unavailable' ? 'Connexion (bientôt disponible)' : 'Se connecter'}
            title={account.status === 'unavailable' ? 'Connexion — bientôt disponible' : 'Se connecter'}
            onClick={onSignIn}
          >
            <UserRound size={20} />
          </button>
        )}
      </div>
    </header>
  )
}
