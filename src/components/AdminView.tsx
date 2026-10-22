import { BookOpenCheck, ClipboardCheck, Cpu, Flag, LoaderCircle, LockKeyhole, LogOut, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { AiService } from '../domain/services'
import type { LinguisticPreferences } from '../domain/types'
import { formatResetTime } from '../services/remoteAiService'
import { EvaluationView } from './EvaluationView'
import { ModerationPanel } from './marketplace/ModerationPanel'

type SectionId = 'apercu' | 'moderation' | 'reference' | 'evaluation' | 'signalements'

const sections: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: 'apercu', label: 'Moteur', icon: Cpu },
  { id: 'moderation', label: 'Modération marketplace', icon: ShieldCheck },
  { id: 'reference', label: 'Référence du mooré', icon: BookOpenCheck },
  { id: 'evaluation', label: 'Évaluation', icon: ClipboardCheck },
  { id: 'signalements', label: 'Signalements', icon: Flag },
]

interface Overview {
  version: { version: string; commit: string; builtAt: string } | null
  engine: { provider: string; configured: boolean; model: string; liteModel: string }
  engineErrors?: Array<{ at: string; feature: string; model: string; httpStatus: number; quotas: string[]; message: string }>
  reference: {
    sheetChars: number
    examples: number
    entries: number
    counts: { draft: number; review: number; rejected: number }
    problems: string[]
    sentChars: number
    maxChars: number
    omittedExamples: number
    omittedEntries: number
  }
}

type Session = { configured: boolean; authenticated: boolean }

async function readJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null
}

function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      const body = await readJson<{ error?: string; retryAt?: string }>(response)
      if (response.ok) {
        setPassword('')
        onLoggedIn()
        return
      }
      const retryAt = body?.retryAt ? new Date(body.retryAt) : undefined
      setError(`${body?.error ?? 'Connexion impossible.'}${retryAt ? ` Réessayez ${formatResetTime(retryAt)}.` : ''}`)
    } catch {
      setError('Le serveur est injoignable. Vérifiez votre connexion.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="admin-login settings-section" onSubmit={(event) => void submit(event)}>
      <h2><LockKeyhole size={18} aria-hidden="true" /> Connexion administrateur</h2>
      <p className="evaluation-help">Réservé à l’équipe Gilli.</p>
      <div className="field">
        <label className="field-label" htmlFor="admin-password">Mot de passe</label>
        <input id="admin-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      <button type="submit" className="primary-button" disabled={!password || isSubmitting}>
        {isSubmitting ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null} Se connecter
      </button>
    </form>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-value">{value}</span>
      <span className="admin-stat-label">{label}</span>
    </div>
  )
}

function EnginePanel({ overview }: { overview: Overview }) {
  return (
    <div className="setting-group">
      <div className="setting-row">
        <div className="setting-text"><p className="setting-label">Version déployée</p><p className="setting-description">Interface : {__BUILD_INFO__.commit}</p></div>
        <code className="value-pill">{overview.version ? `${overview.version.version} · ${overview.version.commit}` : 'inconnue'}</code>
      </div>
      <div className="setting-row">
        <div className="setting-text"><p className="setting-label">Fournisseur</p><p className="setting-description">AI_PROVIDER</p></div>
        <code className="value-pill">{overview.engine.provider}</code>
      </div>
      <div className="setting-row">
        <div className="setting-text"><p className="setting-label">Clé d’API Gemini</p><p className="setting-description">GEMINI_API_KEY</p></div>
        <span className="value-pill">{overview.engine.configured ? 'Configurée' : 'Absente'}</span>
      </div>
      <div className="setting-row">
        <div className="setting-text"><p className="setting-label">Modèle standard</p><p className="setting-description">GEMINI_MODEL</p></div>
        <code className="value-pill">{overview.engine.model}</code>
      </div>
      <div className="setting-row">
        <div className="setting-text"><p className="setting-label">Modèle économe</p><p className="setting-description">GEMINI_LITE_MODEL (aussi pour les titres)</p></div>
        <code className="value-pill">{overview.engine.liteModel}</code>
      </div>
      <div className="settings-section engine-errors">
        <h3>Derniers refus du moteur</h3>
        {!overview.engineErrors?.length ? (
          <p className="setting-description">Aucun refus depuis le dernier démarrage du serveur.</p>
        ) : (
          <ol>
            {overview.engineErrors.map((error) => (
              <li key={`${error.at}-${error.feature}`}>
                <p><strong>{new Date(error.at).toLocaleString('fr', { dateStyle: 'short', timeStyle: 'medium' })}</strong> · {error.feature} · <code>{error.model}</code> · HTTP {error.httpStatus}</p>
                {error.quotas.length > 0 && <p>Limite dépassée : {error.quotas.map((quota) => <code key={quota}>{quota}</code>)}</p>}
                {error.message && <p className="setting-description">{error.message}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function ReferencePanel({ reference }: { reference: Overview['reference'] }) {
  const usage = Math.min(100, Math.round((reference.sentChars / reference.maxChars) * 100))
  return (
    <>
      <div className="admin-stats">
        <Stat label="Fiche de règles" value={reference.sheetChars ? `${reference.sheetChars.toLocaleString('fr')} car.` : 'Vide'} />
        <Stat label="Exemples validés" value={String(reference.examples)} />
        <Stat label="Mots validés" value={String(reference.entries)} />
        <Stat label="En attente" value={`${reference.counts.draft + reference.counts.review}`} />
      </div>
      <div className="settings-section">
        <h3>Taille envoyée au moteur</h3>
        <div className="admin-meter" role="meter" aria-valuemin={0} aria-valuemax={reference.maxChars} aria-valuenow={reference.sentChars} aria-label="Taille de la référence envoyée">
          <span style={{ width: `${usage}%` }} />
        </div>
        <p className="evaluation-help">
          {reference.sentChars.toLocaleString('fr')} / {reference.maxChars.toLocaleString('fr')} caractères à chaque demande.
          {(reference.omittedExamples || reference.omittedEntries) ? ` Limite dépassée : ${reference.omittedExamples} exemple(s) et ${reference.omittedEntries} mot(s) ne sont pas envoyés.` : ''}
        </p>
      </div>
      <div className="settings-section">
        <h3>Problèmes à corriger</h3>
        {reference.problems.length === 0
          ? <p className="evaluation-help">Aucun problème détecté.</p>
          : <ul className="admin-problems">{reference.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
      </div>
      <div className="settings-section">
        <h3>Modifier la référence</h3>
        <p className="evaluation-help">
          Les fichiers sont dans le dépôt, dossier <code>server/knowledge/moore/</code> : <code>fiche.md</code>, <code>exemples.csv</code> et <code>lexique.csv</code>, avec le guide <code>LISEZMOI.md</code>. Seules les lignes au statut « validé » sont envoyées. Après modification, vérifiez avec <code>pnpm moore:check</code> puis redéployez.
        </p>
        <p className="evaluation-help">{reference.counts.draft} brouillon(s), {reference.counts.review} à relire, {reference.counts.rejected} rejeté(s).</p>
      </div>
    </>
  )
}

interface AdminViewProps {
  aiService: AiService
  preferences: LinguisticPreferences
  onNotify: (message: string) => void
}

/** Console d’administration : protégée côté serveur, invisible des utilisateurs. */
export function AdminView({ aiService, preferences, onNotify }: AdminViewProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [activeSection, setActiveSection] = useState<SectionId>('apercu')
  const [loadError, setLoadError] = useState('')

  const refresh = useCallback(async () => {
    setLoadError('')
    try {
      const current = await readJson<Session>(await fetch('/api/admin/session'))
      setSession(current ?? { configured: false, authenticated: false })
      if (!current?.authenticated) {
        setOverview(null)
        return
      }
      const response = await fetch('/api/admin/overview')
      if (response.status === 401) {
        setSession({ ...current, authenticated: false })
        return
      }
      setOverview(await readJson<Overview>(response))
    } catch {
      setLoadError('Le serveur est injoignable. La console demande une connexion au serveur de Gilli.')
      setSession({ configured: false, authenticated: false })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => null)
    setOverview(null)
    setSession((current) => (current ? { ...current, authenticated: false } : current))
    onNotify('Vous êtes déconnecté de la console.')
  }

  const current = sections.find((section) => section.id === activeSection) ?? sections[0]

  return (
    <div className="settings-page admin-page">
      <header className="settings-header admin-header">
        <h1>Console d’administration</h1>
        {session?.authenticated && (
          <button type="button" className="secondary-button" onClick={() => void logout()}><LogOut size={14} aria-hidden="true" /> Se déconnecter</button>
        )}
      </header>

      {session === null && <div className="page-loading" aria-busy="true" />}
      {loadError && <p className="message-error" role="alert">{loadError}</p>}
      {session && !session.configured && !loadError && (
        <p className="settings-callout">
          <LockKeyhole size={16} aria-hidden="true" />
          <span>La console est fermée : définissez le secret <code>ADMIN_PASSWORD</code> (12 caractères au moins) dans l’environnement du serveur, puis redémarrez-le.</span>
        </p>
      )}
      {session?.configured && !session.authenticated && <LoginForm onLoggedIn={() => void refresh()} />}

      {session?.authenticated && (
        <div className="settings-layout">
          <div className="settings-nav" role="tablist" aria-label="Sections de la console" aria-orientation="vertical">
            {sections.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" role="tab" id={`admin-tab-${id}`} aria-selected={activeSection === id} aria-controls={`admin-panel-${id}`} className={activeSection === id ? 'is-active' : ''} onClick={() => setActiveSection(id)}>
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <section className="settings-panel" role="tabpanel" id={`admin-panel-${current.id}`} aria-labelledby={`admin-tab-${current.id}`}>
            <div className="panel-heading">
              <h2>{current.label}</h2>
            </div>
            {!overview && activeSection !== 'evaluation' && activeSection !== 'signalements' && activeSection !== 'moderation' && <div className="page-loading" aria-busy="true" />}
            {activeSection === 'moderation' && <ModerationPanel onNotify={onNotify} />}
            {overview && activeSection === 'apercu' && <EnginePanel overview={overview} />}
            {overview && activeSection === 'reference' && <ReferencePanel reference={overview.reference} />}
            {activeSection === 'evaluation' && <EvaluationView aiService={aiService} preferences={preferences} onNotify={onNotify} />}
            {activeSection === 'signalements' && (
              <p className="settings-callout">
                <Flag size={16} aria-hidden="true" />
                <span>À venir. Les signalements sont aujourd’hui préparés sur l’appareil de l’utilisateur sans être envoyés : leur relecture ici demandera d’abord un stockage sur le serveur (base de données).</span>
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
