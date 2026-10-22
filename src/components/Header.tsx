import { ChevronDown, PanelLeft, Settings, UserRound } from 'lucide-react'
import { accountInitial, type AccountView } from '../app/accountView'
import type { ModelTier } from '../domain/types'

interface HeaderProps {
  isMenuOpen: boolean
  isDemonstration: boolean
  /** Vrai si le moteur propose un modèle économe en plus du standard. */
  offersLiteModel: boolean
  modelTier: ModelTier
  onToggleSidebar: () => void
  onModelTierChange: (modelTier: ModelTier) => void
  onOpenSettings: () => void
  account: AccountView
  onSignIn: () => void
  onOpenAccount: () => void
}

const modelLabels: Record<ModelTier, string> = {
  standard: 'Standard',
  lite: 'Économe',
}

export function Header({
  isMenuOpen,
  isDemonstration,
  offersLiteModel,
  modelTier,
  onToggleSidebar,
  onModelTierChange,
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
        {offersLiteModel ? (
          <label className="model-select" title="Standard : plus approfondi. Économe : plus rapide, quota plus large.">
            <span className="visually-hidden">Modèle</span>
            <select value={modelTier} onChange={(event) => onModelTierChange(event.target.value as ModelTier)}>
              {Object.entries(modelLabels).map(([tier, label]) => (
                <option key={tier} value={tier}>{label}</option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </label>
        ) : isDemonstration ? (
          <span className="model-badge">Démonstration</span>
        ) : null}
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
