import { AudioLines, Database, Info, Languages, Monitor, Moon, SlidersHorizontal, Sun, UserRound, type LucideIcon } from 'lucide-react'
import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { getInstallState, promptInstall, subscribeInstallState } from '../app/installPrompt'
import { isVoiceRecordingSupported } from '../app/voiceRecording'
import { responseLanguageLabels, userWritingModeLabels } from '../data/content'
import type { LinguisticPreferences, ResponseLanguage, ThemePreference, UserWritingMode } from '../domain/types'

type SectionId = 'general' | 'langue' | 'donnees' | 'voix' | 'compte'

const sections: Array<{ id: SectionId; label: string; description: string; icon: LucideIcon }> = [
  { id: 'general', label: 'Général', description: 'Apparence et langue de l’interface.', icon: SlidersHorizontal },
  { id: 'langue', label: 'Langue et écriture', description: 'La langue de vos échanges avec Mizanga et votre façon d’écrire le mooré.', icon: Languages },
  { id: 'donnees', label: 'Conversations et données', description: 'Ce qui est conservé, où, et comment l’effacer.', icon: Database },
  { id: 'voix', label: 'Voix', description: 'Messages vocaux et lecture audio des réponses.', icon: AudioLines },
  { id: 'compte', label: 'Compte', description: 'Connexion et synchronisation.', icon: UserRound },
]

function initialSection(): SectionId {
  const hash = window.location.hash.slice(1)
  return sections.some((section) => section.id === hash) ? (hash as SectionId) : 'general'
}

/** Ligne de réglage : libellé et description à gauche, contrôle à droite. */
function SettingRow({ label, description, htmlFor, children }: { label: string; description?: ReactNode; htmlFor?: string; children: ReactNode }) {
  const Label = htmlFor ? 'label' : 'p'
  return (
    <div className="setting-row">
      <div className="setting-text">
        <Label className="setting-label" {...(htmlFor ? { htmlFor } : {})}>{label}</Label>
        {description && <p className="setting-description">{description}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function SelectControl<T extends string>({ id, value, options, disabled, onChange }: {
  id: string
  disabled?: boolean
  value: T
  options: Array<{ value: T | string; label: string; disabled?: boolean }>
  onChange: (value: T) => void
}) {
  return (
    <span className="select-control">
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
        ))}
      </select>
    </span>
  )
}

/** Contrôle segmenté fait de vrais boutons radio : les flèches du clavier fonctionnent nativement. */
function SegmentedControl<T extends string>({ name, label, value, options, onChange }: {
  name: string
  label: string
  value: T
  options: Array<{ value: T; label: string; icon?: LucideIcon }>
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
        <label key={optionValue} className={value === optionValue ? 'is-selected' : ''}>
          <input type="radio" name={name} value={optionValue} checked={value === optionValue} onChange={() => onChange(optionValue)} />
          {Icon && <Icon size={15} aria-hidden="true" />}
          {optionLabel}
        </label>
      ))}
    </div>
  )
}

function Switch({ id, checked, onChange }: { id: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" id={id} role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)} />
}

/** Installation sur l’écran d’accueil, selon ce que permet le navigateur. */
function InstallRow() {
  const state = useSyncExternalStore(subscribeInstallState, getInstallState)
  const descriptions = {
    installed: 'Mizanga est installée sur cet appareil.',
    available: 'Ajoutez Mizanga à l’écran d’accueil pour l’ouvrir comme une application, même avec une connexion fragile.',
    ios: 'Sur iPhone ou iPad : touchez le bouton Partager de Safari, puis « Sur l’écran d’accueil ».',
    unavailable: 'Depuis le menu de votre navigateur, choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
  }
  return (
    <SettingRow label="Installer l’application" description={descriptions[state]}>
      {state === 'available' && <button type="button" className="primary-button" onClick={() => void promptInstall()}>Installer</button>}
      {state === 'installed' && <span className="value-pill">Installée</span>}
    </SettingRow>
  )
}

function SoonSwitch({ label }: { label: string }) {
  return <button type="button" role="switch" aria-checked="false" aria-label={`${label} — bientôt disponible`} className="switch" disabled />
}

interface SettingsViewProps {
  preferences: LinguisticPreferences
  engine: { label: string; isDemonstration: boolean }
  conversationCount: number
  onChange: (changes: Partial<LinguisticPreferences>) => void
  onResetPreferences: () => void
  onNewConversation: () => void
  onOpenEvaluation: () => void
  onClearConversations: () => void
}

export function SettingsView({ preferences, engine, conversationCount, onChange, onResetPreferences, onNewConversation, onOpenEvaluation, onClearConversations }: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<SectionId>(initialSection)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const tabRefs = useRef<Record<SectionId, HTMLButtonElement | null>>({ general: null, langue: null, donnees: null, voix: null, compte: null })
  const current = sections.find((section) => section.id === activeSection) ?? sections[0]

  const selectSection = (id: SectionId, focus = false) => {
    setActiveSection(id)
    setConfirmingClear(false)
    window.history.replaceState(window.history.state, '', `#${id}`)
    if (focus) tabRefs.current[id]?.focus()
  }

  // Onglets : flèches, Début et Fin déplacent la sélection (motif ARIA « tabs »).
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = sections.findIndex((section) => section.id === activeSection)
    const keys: Record<string, number> = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: sections.length - 1 }
    if (!(event.key in keys)) return
    event.preventDefault()
    const next = (keys[event.key] + sections.length) % sections.length
    selectSection(sections[next].id, true)
  }

  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1>Paramètres</h1>
        <p>Personnalisez Mizanga. Vos préférences sont enregistrées sur cet appareil uniquement.</p>
      </header>

      <div className="settings-layout">
        <div className="settings-nav" role="tablist" aria-label="Sections des paramètres" aria-orientation="vertical">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              ref={(element) => { tabRefs.current[id] = element }}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={activeSection === id}
              aria-controls={`panel-${id}`}
              tabIndex={activeSection === id ? 0 : -1}
              className={activeSection === id ? 'is-active' : ''}
              onClick={() => selectSection(id)}
              onKeyDown={onTabKeyDown}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <section className="settings-panel" role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`}>
          <div className="panel-heading">
            <h2>{current.label}</h2>
            <p>{current.description}</p>
          </div>

          {activeSection === 'general' && (
            <div className="setting-group">
              <SettingRow label="Thème" description="« Système » suit le réglage clair ou sombre de votre appareil.">
                <SegmentedControl<ThemePreference>
                  name="theme"
                  label="Thème"
                  value={preferences.theme}
                  options={[
                    { value: 'light', label: 'Clair', icon: Sun },
                    { value: 'dark', label: 'Sombre', icon: Moon },
                    { value: 'system', label: 'Système', icon: Monitor },
                  ]}
                  onChange={(theme) => onChange({ theme })}
                />
              </SettingRow>
              <InstallRow />
              <SettingRow label="Moteur de réponses" description={engine.isDemonstration ? 'Aucun moteur d’IA n’est connecté : les réponses sont des messages de démonstration.' : 'Le modèle qui rédige les réponses de Mizanga.'}>
                <span className="value-pill">{engine.label}</span>
              </SettingRow>
              <SettingRow label="Langue de l’interface" htmlFor="setting-interface-language" description="Le mooré sera proposé comme langue d’interface dans une prochaine version.">
                <SelectControl
                  id="setting-interface-language"
                  value="fr"
                  options={[{ value: 'fr', label: 'Français' }, { value: 'mos', label: 'Mooré — bientôt', disabled: true }]}
                  onChange={() => undefined}
                />
              </SettingRow>
            </div>
          )}

          {activeSection === 'langue' && (
            <>
              <div className="setting-group">
                <SettingRow label="Langue des réponses" htmlFor="setting-response-language" description="« Automatique » répond dans la langue de votre message. Aussi modifiable depuis l’en-tête.">
                  <SelectControl<ResponseLanguage>
                    id="setting-response-language"
                    value={preferences.responseLanguage}
                    options={Object.entries(responseLanguageLabels).map(([value, label]) => ({ value, label }))}
                    onChange={(responseLanguage) => onChange({ responseLanguage })}
                  />
                </SettingRow>
                <SettingRow label="Ma façon d’écrire le mooré" htmlFor="setting-writing-mode" description="Aide le futur moteur à comprendre une écriture standardisée ou informelle.">
                  <SelectControl<UserWritingMode>
                    id="setting-writing-mode"
                    value={preferences.userWritingMode}
                    options={[
                      ...Object.entries(userWritingModeLabels).map(([value, label]) => ({ value, label })),
                      { value: 'automatic', label: 'Détection automatique — bientôt', disabled: true },
                    ]}
                    onChange={(userWritingMode) => onChange({ userWritingMode })}
                  />
                </SettingRow>
              </div>
              <div className="setting-group">
                <SettingRow label="Évaluer la qualité du mooré" description="Outil pour les locuteurs : importer des questions, obtenir les réponses de Mizanga, les noter et exporter les résultats.">
                  <button type="button" className="secondary-button" onClick={onOpenEvaluation}>Ouvrir l’outil</button>
                </SettingRow>
              </div>
              <p className="settings-callout">
                <Info size={16} aria-hidden="true" />
                <span>Votre texte original est toujours conservé. Aucune substitution automatique de caractères (par ex. è → ɛ) n’est appliquée.</span>
              </p>
            </>
          )}

          {activeSection === 'donnees' && (
            <>
              <div className="setting-group">
                <SettingRow label="Nouvelle conversation" description="Repartir d’une conversation vide. Les précédentes restent dans le menu.">
                  <button type="button" className="secondary-button" onClick={onNewConversation}>Démarrer</button>
                </SettingRow>
                <SettingRow
                  label="Enregistrer les conversations sur cet appareil"
                  htmlFor="setting-save-conversations"
                  description={preferences.saveConversations
                    ? 'Vos conversations sont gardées dans ce navigateur, même après fermeture. Désactivez-le sur un appareil partagé : l’historique enregistré sera effacé.'
                    : 'Les conversations restent en mémoire et disparaissent à la fermeture ou au rechargement de la page.'}
                >
                  <Switch id="setting-save-conversations" checked={preferences.saveConversations} onChange={(saveConversations) => onChange({ saveConversations })} />
                </SettingRow>
                <SettingRow label="Historique des conversations" description="Recherche, favoris et suppression depuis le menu latéral.">
                  <span className="value-pill">{conversationCount === 0 ? 'Aucune' : `${conversationCount} conversation${conversationCount > 1 ? 's' : ''}`}</span>
                </SettingRow>
                <SettingRow
                  label="Vos messages et fichiers"
                  description={engine.isDemonstration
                    ? 'Aucun message ne quitte votre navigateur : aucun moteur d’IA n’est connecté.'
                    : 'Ils sont transmis au serveur de Mizanga puis à Google (Gemini) pour produire les réponses, y compris les messages vocaux et, si vous l’activez, la recherche web ; les fichiers joints ne sont pas conservés sur l’appareil. Avec l’offre gratuite de Gemini, Google peut utiliser ces échanges pour améliorer ses services : évitez d’y saisir des informations ou documents sensibles.'}
                >
                  <span className="value-pill">{engine.isDemonstration ? 'Restent sur l’appareil' : 'Envoyés à Google'}</span>
                </SettingRow>
                <SettingRow label="Préférences" description="Enregistrées sur cet appareil uniquement.">
                  <button type="button" className="secondary-button" onClick={onResetPreferences}>Réinitialiser</button>
                </SettingRow>
              </div>

              <div className="danger-zone">
                <SettingRow label="Supprimer toutes les conversations" description="Efface définitivement l’historique, favoris compris, y compris sur cet appareil.">
                  {confirmingClear ? (
                    <span className="confirm-actions">
                      <button type="button" className="secondary-button" onClick={() => setConfirmingClear(false)}>Annuler</button>
                      <button type="button" className="danger-button" autoFocus onClick={() => { onClearConversations(); setConfirmingClear(false) }}>Confirmer la suppression</button>
                    </span>
                  ) : (
                    <button type="button" className="danger-button is-outline" disabled={conversationCount === 0} onClick={() => setConfirmingClear(true)}>Tout supprimer</button>
                  )}
                </SettingRow>
              </div>
            </>
          )}

          {activeSection === 'voix' && (
            <div className="setting-group">
              <SettingRow
                label="Messages vocaux"
                description="Touchez le micro de la zone de saisie pour parler à Mizanga (2 minutes au plus). La compréhension du mooré parlé n’est pas encore garantie : le français est mieux compris pour l’instant."
              >
                <span className="value-pill">{isVoiceRecordingSupported() ? 'Disponible' : 'Non pris en charge ici'}</span>
              </SettingRow>
              <SettingRow label="Lecture audio des réponses" description={<>Écouter les réponses à voix haute. <span className="soon-badge">Bientôt</span></>}>
                <SoonSwitch label="Lecture audio des réponses" />
              </SettingRow>
              <SettingRow label="Vitesse de lecture" htmlFor="setting-voice-speed" description="Disponible avec la lecture audio.">
                <SelectControl id="setting-voice-speed" value="normal" options={[{ value: 'normal', label: 'Normale' }]} disabled onChange={() => undefined} />
              </SettingRow>
              <SettingRow label="Langue et variété vocale" htmlFor="setting-voice-variety" description="Disponible avec la lecture audio.">
                <SelectControl id="setting-voice-variety" value="default" options={[{ value: 'default', label: 'Par défaut' }]} disabled onChange={() => undefined} />
              </SettingRow>
            </div>
          )}

          {activeSection === 'compte' && (
            <div className="setting-group">
              <div className="account-card">
                <span className="account-avatar" aria-hidden="true"><UserRound size={20} /></span>
                <div className="setting-text">
                  <p className="setting-label">Invité</p>
                  <p className="setting-description">Non connecté. Les comptes permettront de retrouver votre historique sur tous vos appareils.</p>
                </div>
                <button type="button" className="secondary-button" disabled>Se connecter</button>
              </div>
              <SettingRow label="Synchronisation" description={<>Historique et préférences sur tous vos appareils. <span className="soon-badge">Bientôt</span></>}>
                <SoonSwitch label="Synchronisation" />
              </SettingRow>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
