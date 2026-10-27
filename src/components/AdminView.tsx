import { ArrowLeft, Eye, EyeOff, Flag, LoaderCircle, LockKeyhole, LogOut, Menu, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useBackToClose } from '../app/useBackToClose'
import { BrandMark } from './Brand'
import type { AiService } from '../domain/services'
import type { LinguisticPreferences } from '../domain/types'
import { formatResetTime } from '../services/remoteAiService'
import { EvaluationView } from './EvaluationView'
import { ModerationPanel } from './marketplace/ModerationPanel'
import { PaymentsPanel } from './marketplace/PaymentsPanel'
import { adminSectionFromHash, adminSections as sections, type AdminSectionId as SectionId } from '../app/adminSections'

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

type Session = { configured: boolean; authenticated: boolean; email?: string }

async function readJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null
}

/** Page de connexion de la console : adresse e-mail et mot de passe, rien d’autre n’est visible. */
function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }) })
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
    <form className="admin-auth-card" onSubmit={(event) => void submit(event)} aria-labelledby="admin-login-title">
      <h1 id="admin-login-title">Connexion</h1>
      <p className="admin-auth-help">Accès réservé à l’équipe Gilli.</p>
      <div className="field">
        <label className="field-label" htmlFor="admin-email">Adresse e-mail</label>
        <input id="admin-email" type="email" inputMode="email" autoComplete="username" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="admin-password">Mot de passe</label>
        <div className="password-field">
          <input id="admin-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button type="button" className="icon-button" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      <button type="submit" className="primary-button is-block" disabled={!email.trim() || !password || isSubmitting}>
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
  /** Quitte la console pour l’application des utilisateurs. */
  onExit: () => void
}

/** Écran d’accueil de la console (non connecté, fermée ou serveur injoignable) : une carte centrée. */
function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-auth">
      <div className="admin-auth-brand">
        <BrandMark />
        <span>Gilli <strong>Administration</strong></span>
      </div>
      {children}
    </div>
  )
}

/** Menu de la console : ses sections, l’administrateur connecté et la déconnexion. */
function ConsoleNav({ active, email, onSelect, onLogout, onExit }: { active: SectionId; email?: string; onSelect: (section: SectionId) => void; onLogout: () => void; onExit: () => void }) {
  return (
    <>
      <div className="admin-nav-brand"><BrandMark /><span>Gilli <strong>Administration</strong></span></div>
      <nav className="admin-nav" aria-label="Sections de la console">
        {sections.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={`admin-nav-item ${active === id ? 'is-active' : ''}`} aria-current={active === id ? 'page' : undefined} onClick={() => onSelect(id)}>
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>
      <div className="admin-nav-foot">
        {email && <p className="admin-nav-user" title={email}><ShieldCheck size={14} aria-hidden="true" /> <span>{email}</span></p>}
        <button type="button" className="admin-nav-item" onClick={onLogout}><LogOut size={16} aria-hidden="true" /> Se déconnecter</button>
        <button type="button" className="admin-nav-item" onClick={onExit}><ArrowLeft size={16} aria-hidden="true" /> Ouvrir Gilli</button>
      </div>
    </>
  )
}

/** Menu de la console sur téléphone : tiroir fermé par le bouton « retour » d’Android ou Échap. */
function ConsoleDrawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useBackToClose(onClose)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return (
    <>
      <div className="admin-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="admin-sidebar is-drawer" aria-label="Menu de la console">
        <button ref={closeRef} type="button" className="icon-button admin-drawer-close" aria-label="Fermer le menu" onClick={onClose}><X size={20} /></button>
        {children}
      </aside>
    </>
  )
}

/**
 * Console d’administration : application distincte de celle des utilisateurs (ni leur menu, ni leur en-tête).
 * Avant connexion, seule la page de connexion est visible ; la protection est assurée par le serveur.
 */
export function AdminView({ aiService, preferences, onNotify, onExit }: AdminViewProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [activeSection, setActiveSection] = useState<SectionId>(() => adminSectionFromHash(window.location.hash))
  const [menuOpen, setMenuOpen] = useState(false)
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
    setMenuOpen(false)
    setSession((current) => (current ? { ...current, authenticated: false, email: undefined } : current))
    onNotify('Vous êtes déconnecté de la console.')
  }

  // Adresse de la section (/admin#moderation). Choisie depuis le menu du téléphone, elle s’écrit une fois
  // le menu fermé : sa fermeture retire d’abord l’entrée d’historique ajoutée pour le bouton « retour ».
  const pendingHash = useRef<SectionId | null>(null)
  useEffect(() => {
    const writePending = () => {
      if (!pendingHash.current) return
      window.history.replaceState(window.history.state, '', `/admin#${pendingHash.current}`)
      pendingHash.current = null
    }
    window.addEventListener('popstate', writePending)
    return () => window.removeEventListener('popstate', writePending)
  }, [])
  const selectSection = (section: SectionId) => {
    setActiveSection(section)
    if (!menuOpen) {
      window.history.replaceState(window.history.state, '', `/admin#${section}`)
      return
    }
    pendingHash.current = section
    setMenuOpen(false)
  }
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  if (session === null) return <AuthScreen><div className="page-loading" aria-busy="true" /></AuthScreen>
  if (!session.authenticated) {
    return (
      <AuthScreen>
        {loadError ? (
          <div className="admin-auth-card"><p className="message-error" role="alert">{loadError}</p><button type="button" className="secondary-button is-block" onClick={() => void refresh()}><RefreshCw size={14} aria-hidden="true" /> Réessayer</button></div>
        ) : !session.configured ? (
          <div className="admin-auth-card">
            <h1><LockKeyhole size={18} aria-hidden="true" /> Console fermée</h1>
            <p className="admin-auth-help">Définissez les secrets <code>ADMIN_EMAIL</code> et <code>ADMIN_PASSWORD</code> (12 caractères au moins) dans l’environnement du serveur, puis redémarrez-le.</p>
          </div>
        ) : (
          <LoginForm onLoggedIn={() => void refresh()} />
        )}
        <button type="button" className="text-button admin-auth-exit" onClick={onExit}><ArrowLeft size={14} aria-hidden="true" /> Retour à Gilli</button>
      </AuthScreen>
    )
  }

  const current = sections.find((section) => section.id === activeSection) ?? sections[0]
  const nav = <ConsoleNav active={current.id} email={session.email} onSelect={selectSection} onLogout={() => void logout()} onExit={onExit} />

  return (
    <div className="admin-console">
      <aside className="admin-sidebar" aria-label="Menu de la console">{nav}</aside>
      {menuOpen && <ConsoleDrawer onClose={closeMenu}>{nav}</ConsoleDrawer>}
      <div className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="icon-button admin-menu-button" aria-label="Ouvrir le menu de la console" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <h1>{current.label}</h1>
          {overview?.version && <span className="admin-version">v{overview.version.version} · {overview.version.commit}</span>}
        </header>
        <main className="admin-content" id={`admin-panel-${current.id}`}>
          {!overview && activeSection !== 'evaluation' && activeSection !== 'signalements' && activeSection !== 'moderation' && activeSection !== 'paiements' && <div className="page-loading" aria-busy="true" />}
          {activeSection === 'moderation' && <ModerationPanel onNotify={onNotify} />}
          {activeSection === 'paiements' && <PaymentsPanel onNotify={onNotify} />}
          {overview && activeSection === 'apercu' && <EnginePanel overview={overview} />}
          {overview && activeSection === 'reference' && <ReferencePanel reference={overview.reference} />}
          {activeSection === 'evaluation' && <EvaluationView aiService={aiService} preferences={preferences} onNotify={onNotify} />}
          {activeSection === 'signalements' && (
            <p className="settings-callout">
              <Flag size={16} aria-hidden="true" />
              <span>À venir. Les signalements sont aujourd’hui préparés sur l’appareil de l’utilisateur sans être envoyés : leur relecture ici demandera d’abord un stockage sur le serveur (base de données).</span>
            </p>
          )}
        </main>
      </div>
    </div>
  )
}
