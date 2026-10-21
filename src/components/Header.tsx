import { ChevronDown, PanelLeft, Settings, UserRound } from 'lucide-react'
import { responseLanguageLabels } from '../data/content'
import type { ResponseLanguage } from '../domain/types'

interface HeaderProps {
  isMenuOpen: boolean
  responseLanguage: ResponseLanguage
  onToggleSidebar: () => void
  onResponseLanguageChange: (language: ResponseLanguage) => void
  onOpenSettings: () => void
}

export function Header({
  isMenuOpen,
  responseLanguage,
  onToggleSidebar,
  onResponseLanguageChange,
  onOpenSettings,
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
        <label className="language-select">
          <span className="visually-hidden">Langue de réponse</span>
          <select value={responseLanguage} onChange={(event) => onResponseLanguageChange(event.target.value as ResponseLanguage)}>
            {Object.entries(responseLanguageLabels).map(([language, label]) => (
              <option key={language} value={language}>{label}</option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        <button className="icon-button" type="button" aria-label="Paramètres" title="Paramètres" onClick={onOpenSettings}>
          <Settings size={20} />
        </button>
        <button className="icon-button" type="button" disabled aria-label="Connexion (bientôt disponible)" title="Connexion — bientôt disponible">
          <UserRound size={20} />
        </button>
      </div>
    </header>
  )
}
