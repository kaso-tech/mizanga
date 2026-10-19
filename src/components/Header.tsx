import { ChevronDown, Menu, Settings2, Sparkles } from 'lucide-react'
import { Brand } from './Brand'
import type { LinguisticPreferences } from '../domain/types'
import { responseLanguageLabels } from '../data/content'

interface HeaderProps {
  isDrawerOpen: boolean
  preferences: LinguisticPreferences
  onMenuToggle: () => void
  onPreferencesChange: (preferences: Partial<LinguisticPreferences>) => void
  onOpenSettings: () => void
  onNotify: (message: string) => void
}

export function Header({
  isDrawerOpen,
  preferences,
  onMenuToggle,
  onPreferencesChange,
  onOpenSettings,
  onNotify,
}: HeaderProps) {
  return (
    <header className="topbar">
      <button
        className="icon-button mobile-menu-button"
        type="button"
        aria-label={isDrawerOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        onClick={onMenuToggle}
      >
        <Menu size={21} strokeWidth={1.9} />
      </button>

      <div className="mobile-brand">
        <Brand compact />
      </div>

      <div className="topbar-actions">
        <label className="language-switcher" aria-label="Langue de réponse">
          <Sparkles size={15} strokeWidth={1.8} aria-hidden="true" />
          <select
            value={preferences.responseLanguage}
            onChange={(event) =>
              onPreferencesChange({
                responseLanguage: event.target.value as LinguisticPreferences['responseLanguage'],
              })
            }
          >
            {Object.entries(responseLanguageLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>

        <button className="icon-button" type="button" aria-label="Ouvrir les paramètres" onClick={onOpenSettings}>
          <Settings2 size={19} strokeWidth={1.8} />
        </button>
        <button className="account-button" type="button" onClick={() => onNotify('Les comptes utilisateurs seront disponibles dans une prochaine phase.') }>
          Se connecter
        </button>
      </div>
    </header>
  )
}
