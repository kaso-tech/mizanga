import { Languages, Mic2, Moon, ShieldCheck, SunMedium, Volume2 } from 'lucide-react'
import { responseLanguageLabels, userWritingModeLabels } from '../data/content'
import type { LinguisticPreferences } from '../domain/types'

interface SettingsViewProps {
  preferences: LinguisticPreferences
  onChange: (changes: Partial<LinguisticPreferences>) => void
  onNewConversation: () => void
  onNotify: (message: string) => void
}

export function SettingsView({ preferences, onChange, onNewConversation, onNotify }: SettingsViewProps) {
  return (
    <section className="settings-view page-view">
      <div className="page-heading"><p className="eyebrow">Votre expérience</p><h1>Paramètres</h1><p>Ces préférences restent dans cette session de démonstration et ne sont pas encore enregistrées.</p></div>

      <div className="settings-section"><div className="section-heading"><span><Languages size={18} /></span><div><h2>Préférences linguistiques</h2><p>Préparez votre manière d’écrire et de recevoir le Mooré.</p></div></div>
        <div className="settings-card">
          <label><span>Langue de l’interface<small>Le français est actuellement la langue disponible.</small></span><select value="fr" disabled><option value="fr">Français</option></select></label>
          <label><span>Votre mode d’écriture<small>Le texte original sera toujours conservé ; aucune substitution automatique n’est appliquée.</small></span><select value={preferences.userWritingMode} onChange={(event) => onChange({ userWritingMode: event.target.value as LinguisticPreferences['userWritingMode'] })}>{Object.entries(userWritingModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="automatic" disabled>Automatique — bientôt disponible</option></select></label>
          <label><span>Langue et écriture des réponses<small>Le même choix est accessible depuis l’en-tête.</small></span><select value={preferences.responseLanguage} onChange={(event) => onChange({ responseLanguage: event.target.value as LinguisticPreferences['responseLanguage'] })}>{Object.entries(responseLanguageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="other" disabled>Autre langue — bientôt disponible</option></select></label>
        </div>
      </div>

      <div className="settings-section"><div className="section-heading"><span>{preferences.theme === 'light' ? <SunMedium size={18} /> : <Moon size={18} />}</span><div><h2>Apparence</h2><p>Choisissez le contraste qui vous convient.</p></div></div>
        <div className="theme-toggle" role="group" aria-label="Choix du thème"><button className={preferences.theme === 'light' ? 'is-selected' : ''} type="button" onClick={() => onChange({ theme: 'light' })}><SunMedium size={17} /> Clair</button><button className={preferences.theme === 'dark' ? 'is-selected' : ''} type="button" onClick={() => onChange({ theme: 'dark' })}><Moon size={17} /> Sombre</button></div>
      </div>

      <div className="settings-section split-settings"><div className="settings-action-card"><ShieldCheck size={21} /><div><h2>Confidentialité</h2><p>Aucune conversation n’est enregistrée dans cette version. Les règles de stockage seront expliquées avant toute connexion de compte.</p></div></div><div className="settings-action-card is-muted"><Volume2 size={21} /><div><h2>Voix et lecture audio</h2><p>Dictée, lecture, vitesse et variétés vocales seront configurables quand les services seront testés.</p></div><span className="coming-label">Bientôt</span></div></div>

      <div className="settings-footer"><button className="secondary-button" type="button" onClick={onNewConversation}>Démarrer une nouvelle conversation</button><button className="text-button" type="button" onClick={() => onNotify('La dictée vocale et la lecture audio ne sont pas encore disponibles.') }><Mic2 size={16} /> En savoir plus sur les fonctions vocales</button></div>
    </section>
  )
}
