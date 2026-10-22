import { AudioLines, Database, Download, Info, Languages, Monitor, Moon, Play, SlidersHorizontal, Sparkles, Sun, Trash2, Upload, UserRound, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { accountInitial, type AccountView } from '../app/accountView'
import { getInstallState, promptInstall, subscribeInstallState } from '../app/installPrompt'
import { MAX_PROMPT_TITLE_CHARS, MAX_SAVED_PROMPTS, type SavedPrompt } from '../app/savedPrompts'
import { isSpeechSupported, listVoices, speak, speechRates, subscribeVoices } from '../app/speech'
import { MAX_CUSTOM_INSTRUCTIONS_CHARS } from '../services/remoteAiService'
import { isVoiceRecordingSupported } from '../app/voiceRecording'
import { responseLanguageLabels, userWritingModeLabels } from '../data/content'
import type { LinguisticPreferences, ModelTier, ResponseLanguage, TextSize, ThemePreference, UserWritingMode } from '../domain/types'

type SectionId = 'general' | 'personnalisation' | 'langue' | 'donnees' | 'voix' | 'compte'

const sections: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: 'general', label: 'Général', icon: SlidersHorizontal },
  { id: 'personnalisation', label: 'Personnalisation', icon: Sparkles },
  { id: 'langue', label: 'Langue et écriture', icon: Languages },
  { id: 'donnees', label: 'Conversations et données', icon: Database },
  { id: 'voix', label: 'Voix', icon: AudioLines },
  { id: 'compte', label: 'Compte', icon: UserRound },
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
  // Seules les marches à suivre manuelles sont expliquées ; sinon le bouton ou l’état suffit.
  const descriptions = {
    installed: undefined,
    available: undefined,
    ios: 'Safari › Partager › « Sur l’écran d’accueil ».',
    unavailable: 'Menu du navigateur › « Installer l’application ».',
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

const instructionExamples = [
  'J’enseigne au primaire à Koudougou.',
  'Réponds de façon courte, avec des exemples tirés de la vie au Burkina Faso.',
  'Appelle-moi Awa et tutoie-moi.',
]

/** Instructions personnelles : brouillon local, enregistré seulement sur demande. */
function CustomInstructions({ value, isDemonstration, onSave }: { value: string; isDemonstration: boolean; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  const isDirty = draft.trim() !== value.trim()
  return (
    <div className="setting-group instructions-group">
      <label className="setting-label" htmlFor="setting-custom-instructions">Instructions personnelles</label>
      {!isDemonstration && <p className="setting-description">Envoyées avec chaque message : pas d’informations sensibles.</p>}
      <textarea
        id="setting-custom-instructions"
        className="instructions-input"
        rows={6}
        maxLength={MAX_CUSTOM_INSTRUCTIONS_CHARS}
        value={draft}
        placeholder={`Par exemple :\n${instructionExamples.map((example) => `• ${example}`).join('\n')}`}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="instructions-footer">
        <span className="char-count" aria-live="polite">{draft.length} / {MAX_CUSTOM_INSTRUCTIONS_CHARS}</span>
        <span className="confirm-actions">
          {value && <button type="button" className="secondary-button" onClick={() => { setDraft(''); onSave('') }}>Effacer</button>}
          <button type="button" className="primary-button" disabled={!isDirty} onClick={() => onSave(draft.trim())}>Enregistrer</button>
        </span>
      </div>
    </div>
  )
}

/** Consignes réutilisables : ajout, liste et suppression. */
function SavedPromptsSettings({ prompts, onAdd, onDelete }: { prompts: SavedPrompt[]; onAdd: (prompt: string, title: string) => boolean; onDelete: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const add = () => {
    if (onAdd(prompt, title)) {
      setTitle('')
      setPrompt('')
    }
  }
  return (
    <div className="setting-group instructions-group">
      <p className="setting-label">Consignes enregistrées</p>
      <p className="setting-description">Proposées sur l’accueil et avec « / » dans la zone de saisie.</p>
      <div className="prompt-form">
        <label className="visually-hidden" htmlFor="new-prompt-title">Titre de la consigne</label>
        <input id="new-prompt-title" className="instructions-input" value={title} maxLength={MAX_PROMPT_TITLE_CHARS} placeholder="Titre (facultatif), par ex. « Résumé en 5 points »" onChange={(event) => setTitle(event.target.value)} />
        <label className="visually-hidden" htmlFor="new-prompt-text">Texte de la consigne</label>
        <textarea id="new-prompt-text" className="instructions-input" rows={3} maxLength={4000} value={prompt} placeholder="Par ex. : Résume le texte suivant en 5 points clairs, puis propose un titre." onChange={(event) => setPrompt(event.target.value)} />
        <div className="instructions-footer">
          <span className="char-count">{prompts.length} / {MAX_SAVED_PROMPTS} consignes</span>
          <button type="button" className="primary-button" disabled={!prompt.trim()} onClick={add}>Ajouter la consigne</button>
        </div>
      </div>
      {prompts.length > 0 && (
        <ul className="saved-prompt-list" aria-label="Vos consignes">
          {prompts.map((item) => (
            <li key={item.id}>
              <span className="setting-text">
                <span className="setting-label">{item.title}</span>
                <span className="setting-description saved-prompt-preview">{item.prompt}</span>
              </span>
              <button type="button" className="icon-button" onClick={() => onDelete(item.id)} aria-label={`Supprimer la consigne « ${item.title} »`} title="Supprimer"><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Voix de l’appareil, mises à jour quand le navigateur finit de les charger. */
function useVoices() {
  const [voices, setVoices] = useState(listVoices)
  useEffect(() => subscribeVoices(() => setVoices(listVoices())), [])
  return voices
}

function VoiceSettings({ preferences, onChange }: { preferences: LinguisticPreferences; onChange: (changes: Partial<LinguisticPreferences>) => void }) {
  const voices = useVoices()
  const supported = isSpeechSupported()
  const unavailable = supported ? undefined : 'Votre navigateur ne propose pas la lecture à voix haute.'
  return (
    <>
      <div className="setting-group">
        <SettingRow
          label="Messages vocaux"
          description="Le mooré parlé n’est pas encore bien compris."
        >
          <span className="value-pill">{isVoiceRecordingSupported() ? 'Disponible' : 'Non pris en charge ici'}</span>
        </SettingRow>
        <SettingRow label="Lecture audio des réponses" htmlFor="setting-read-aloud" description={unavailable}>
          {supported ? <Switch id="setting-read-aloud" checked={preferences.readAloud} onChange={(readAloud) => onChange({ readAloud })} /> : <span className="value-pill">Non pris en charge ici</span>}
        </SettingRow>
        <SettingRow label="Vitesse de lecture" htmlFor="setting-voice-speed">
          <SelectControl
            id="setting-voice-speed"
            value={String(preferences.speechRate)}
            disabled={!supported || !preferences.readAloud}
            options={speechRates.map((rate) => ({ value: String(rate), label: rate === 1 ? 'Normale' : `× ${rate.toLocaleString('fr')}` }))}
            onChange={(rate) => onChange({ speechRate: Number(rate) })}
          />
        </SettingRow>
        <SettingRow label="Voix" htmlFor="setting-voice-variety">
          <span className="confirm-actions">
            <SelectControl
              id="setting-voice-variety"
              value={preferences.voiceName}
              disabled={!supported || !preferences.readAloud || voices.length === 0}
              options={[{ value: '', label: 'Automatique (français)' }, ...voices.map((voice) => ({ value: voice.name, label: `${voice.name} — ${voice.lang}` }))]}
              onChange={(voiceName) => onChange({ voiceName })}
            />
            <button
              type="button"
              className="secondary-button"
              disabled={!supported || !preferences.readAloud}
              onClick={() => speak('Bonjour, je suis Gilli. Voici ma voix.', { rate: preferences.speechRate, voiceName: preferences.voiceName })}
            >
              <Play size={14} aria-hidden="true" /> Essayer
            </button>
          </span>
        </SettingRow>
      </div>
      <p className="settings-callout">
        <Info size={16} aria-hidden="true" />
        <span>Aucune voix mooré n’est encore disponible.</span>
      </p>
    </>
  )
}

interface SettingsViewProps {
  preferences: LinguisticPreferences
  account: AccountView
  onSignIn: () => void
  onSignOut: () => void
  engine: { label: string; isDemonstration: boolean; offersLiteModel?: boolean }
  conversationCount: number
  onChange: (changes: Partial<LinguisticPreferences>) => void
  onResetPreferences: () => void
  onClearConversations: () => void
  onExportConversations: () => void
  onImportConversations: (file: File) => void
  savedPrompts: SavedPrompt[]
  onAddPrompt: (prompt: string, title: string) => boolean
  onDeletePrompt: (id: string) => void
}

export function SettingsView({ preferences, account, onSignIn, onSignOut, engine, conversationCount, onChange, onResetPreferences, onClearConversations, onExportConversations, onImportConversations, savedPrompts, onAddPrompt, onDeletePrompt }: SettingsViewProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const [activeSection, setActiveSection] = useState<SectionId>(initialSection)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const tabRefs = useRef<Record<SectionId, HTMLButtonElement | null>>({ general: null, personnalisation: null, langue: null, donnees: null, voix: null, compte: null })
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
          </div>

          {activeSection === 'general' && (
            <div className="setting-group">
              <SettingRow label="Thème">
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
              <SettingRow label="Taille du texte" htmlFor="setting-text-size">
                <SelectControl<TextSize>
                  id="setting-text-size"
                  value={preferences.textSize}
                  options={[
                    { value: 'small', label: 'Petite' },
                    { value: 'normal', label: 'Normale' },
                    { value: 'large', label: 'Grande' },
                    { value: 'xlarge', label: 'Très grande' },
                  ]}
                  onChange={(textSize) => onChange({ textSize })}
                />
              </SettingRow>
              <InstallRow />
              {engine.offersLiteModel ? (
                <SettingRow
                  label="Modèle de réponses"
                  htmlFor="setting-model-tier"
                >
                  <SelectControl<ModelTier>
                    id="setting-model-tier"
                    value={preferences.modelTier}
                    options={[
                      { value: 'standard', label: 'Standard — plus approfondi' },
                      { value: 'lite', label: 'Économe — plus rapide' },
                    ]}
                    onChange={(modelTier) => onChange({ modelTier })}
                  />
                </SettingRow>
              ) : (
                <SettingRow label="Moteur de réponses">
                  <span className="value-pill">{engine.label}</span>
                </SettingRow>
              )}
              <SettingRow label="Langue de l’interface" htmlFor="setting-interface-language">
                <SelectControl
                  id="setting-interface-language"
                  value="fr"
                  options={[{ value: 'fr', label: 'Français' }, { value: 'mos', label: 'Mooré — bientôt', disabled: true }]}
                  onChange={() => undefined}
                />
              </SettingRow>
            </div>
          )}

          {activeSection === 'personnalisation' && (
            <>
              <CustomInstructions value={preferences.customInstructions} isDemonstration={engine.isDemonstration} onSave={(customInstructions) => onChange({ customInstructions })} />
              <SavedPromptsSettings prompts={savedPrompts} onAdd={onAddPrompt} onDelete={onDeletePrompt} />
            </>
          )}

          {activeSection === 'langue' && (
            <>
              <div className="setting-group">
                <SettingRow label="Langue des réponses" htmlFor="setting-response-language">
                  <SelectControl<ResponseLanguage>
                    id="setting-response-language"
                    value={preferences.responseLanguage}
                    options={Object.entries(responseLanguageLabels).map(([value, label]) => ({ value, label }))}
                    onChange={(responseLanguage) => onChange({ responseLanguage })}
                  />
                </SettingRow>
                <SettingRow label="Ma façon d’écrire le mooré" htmlFor="setting-writing-mode">
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
            </>
          )}

          {activeSection === 'donnees' && (
            <>
              <div className="setting-group">
                <SettingRow
                  label="Enregistrer les conversations sur cet appareil"
                  htmlFor="setting-save-conversations"
                  description={preferences.saveConversations ? 'À désactiver sur un appareil partagé.' : 'L’historique disparaît à la fermeture de la page.'}
                >
                  <Switch id="setting-save-conversations" checked={preferences.saveConversations} onChange={(saveConversations) => onChange({ saveConversations })} />
                </SettingRow>
                <SettingRow label="Historique des conversations">
                  <span className="value-pill">{conversationCount === 0 ? 'Aucune' : `${conversationCount} conversation${conversationCount > 1 ? 's' : ''}`}</span>
                </SettingRow>
                <SettingRow label="Sauvegarder l’historique" description="Sans le contenu des fichiers joints.">
                  <button type="button" className="secondary-button" disabled={conversationCount === 0} onClick={onExportConversations}><Download size={14} aria-hidden="true" /> Exporter</button>
                </SettingRow>
                <SettingRow label="Restaurer une sauvegarde">
                  <button type="button" className="secondary-button" onClick={() => importInputRef.current?.click()}><Upload size={14} aria-hidden="true" /> Importer</button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    aria-label="Fichier de sauvegarde"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) onImportConversations(file)
                    }}
                  />
                </SettingRow>
                <SettingRow
                  label="Vos messages et fichiers"
                  description={engine.isDemonstration ? undefined : 'Google peut les utiliser pour améliorer ses services : évitez les informations sensibles.'}
                >
                  <span className="value-pill">{engine.isDemonstration ? 'Restent sur l’appareil' : 'Envoyés à Google'}</span>
                </SettingRow>
                <SettingRow label="Préférences">
                  <button type="button" className="secondary-button" onClick={onResetPreferences}>Réinitialiser</button>
                </SettingRow>
              </div>

              <div className="danger-zone">
                <SettingRow label="Supprimer toutes les conversations" description="Action définitive.">
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

          {activeSection === 'voix' && <VoiceSettings preferences={preferences} onChange={onChange} />}

          {activeSection === 'compte' && (
            <div className="setting-group">
              <div className="account-card">
                {account.status === 'signedIn'
                  ? <span className="account-chip" aria-hidden="true">{accountInitial(account.email)}</span>
                  : <span className="account-avatar" aria-hidden="true"><UserRound size={20} /></span>}
                <div className="setting-text">
                  <p className="setting-label">{account.status === 'signedIn' ? (account.email ?? 'Compte connecté') : 'Invité'}</p>
                  <p className="setting-description">{account.status === 'signedIn' ? 'Connecté' : account.status === 'loading' ? 'Vérification…' : 'Non connecté'}</p>
                </div>
                {account.status === 'signedIn'
                  ? <button type="button" className="secondary-button" onClick={onSignOut}>Se déconnecter</button>
                  : <button type="button" className="secondary-button" disabled={account.status !== 'signedOut'} onClick={onSignIn}>Se connecter</button>}
              </div>
              <SettingRow label="Synchronisation" description={<span className="soon-badge">Bientôt</span>}>
                <SoonSwitch label="Synchronisation" />
              </SettingRow>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
