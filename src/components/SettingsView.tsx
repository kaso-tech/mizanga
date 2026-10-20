import { Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { responseLanguageLabels, userWritingModeLabels } from '../data/content'
import type { LinguisticPreferences, ResponseLanguage, UserWritingMode } from '../domain/types'

interface SettingsViewProps {
  preferences: LinguisticPreferences
  onChange: (changes: Partial<LinguisticPreferences>) => void
  onNewConversation: () => void
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      <div className="settings-section-body">{children}</div>
    </section>
  )
}

interface ChoiceOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Option visible mais pas encore disponible. */
  soon?: boolean
}

/** Groupe de choix exclusifs présenté en pastilles (sémantique de boutons radio). */
function Choice<T extends string>({ label, hint, value, options, onChange }: {
  label: string
  hint?: string
  value: T
  options: ChoiceOption<T>[]
  onChange: (value: T) => void
}) {
  const id = `choice-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="choice-group">
      <p className="field-label" id={id}>{label}</p>
      {hint && <p className="field-hint">{hint}</p>}
      <div className="choice-row" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            disabled={option.soon}
            className={`choice ${value === option.value ? 'is-selected' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
            {option.soon && ' · bientôt'}
          </button>
        ))}
      </div>
    </div>
  )
}

function Upcoming({ label }: { label: string }) {
  return (
    <div className="upcoming-row">
      <span>{label}</span>
      <span className="soon-badge">Bientôt disponible</span>
    </div>
  )
}

export function SettingsView({ preferences, onChange, onNewConversation }: SettingsViewProps) {
  return (
    <div className="page-view settings-view">
      <h1>Paramètres</h1>
      <p className="page-intro">Vos préférences sont enregistrées uniquement sur cet appareil.</p>

      <Section title="Préférences linguistiques">
        <Choice
          label="Langue de l’interface"
          value="fr"
          options={[{ value: 'fr', label: 'Français' }, { value: 'mos', label: 'Mooré', soon: true }]}
          onChange={() => undefined}
        />
        <Choice<ResponseLanguage>
          label="Langue des réponses"
          hint="« Automatique » répond dans la langue de votre message."
          value={preferences.responseLanguage}
          options={(Object.entries(responseLanguageLabels) as Array<[ResponseLanguage, string]>).map(([value, label]) => ({ value, label }))}
          onChange={(responseLanguage) => onChange({ responseLanguage })}
        />
        <Choice<UserWritingMode | 'automatic'>
          label="Ma façon d’écrire le mooré"
          hint="Votre texte original est toujours conservé. Aucune substitution automatique de caractères (par ex. è → ɛ) n’est appliquée."
          value={preferences.userWritingMode}
          options={[
            ...(Object.entries(userWritingModeLabels) as Array<[UserWritingMode, string]>).map(([value, label]) => ({ value, label })),
            { value: 'automatic', label: 'Automatique', soon: true },
          ]}
          onChange={(userWritingMode) => {
            if (userWritingMode !== 'automatic') onChange({ userWritingMode })
          }}
        />
        <Choice
          label="Apparence"
          value={preferences.theme}
          options={[
            { value: 'light', label: 'Clair', icon: <Sun size={16} aria-hidden="true" /> },
            { value: 'dark', label: 'Sombre', icon: <Moon size={16} aria-hidden="true" /> },
          ]}
          onChange={(theme) => onChange({ theme })}
        />
      </Section>

      <Section title="Conversations">
        <div>
          <button type="button" className="primary-button" onClick={onNewConversation}>Démarrer une nouvelle conversation</button>
        </div>
        <div className="settings-text">
          <p className="field-label">Confidentialité</p>
          <p>Les conversations ne sont pas enregistrées : elles restent dans la mémoire de votre navigateur et disparaissent quand vous fermez ou rechargez la page. Aucune donnée n’est envoyée à un serveur dans cette version de démonstration.</p>
          <p>Vous pouvez supprimer une conversation depuis le menu (icône corbeille).</p>
        </div>
      </Section>

      <Section title="Fonctions vocales">
        <Upcoming label="Dictée vocale" />
        <Upcoming label="Lecture audio des réponses" />
        <Upcoming label="Vitesse de lecture" />
        <Upcoming label="Langue et variété vocale" />
      </Section>
    </div>
  )
}
