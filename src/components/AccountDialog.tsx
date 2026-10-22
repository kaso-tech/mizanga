import { LoaderCircle, Mail, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useModalFocus } from '../app/useModalFocus'
import { AuthError, isValidEmail, type AuthClient } from '../services/authService'

/** Délai avant de pouvoir redemander un code (les e-mails de Supabase sont limités). */
const RESEND_DELAY_SECONDS = 60

interface AccountDialogProps {
  client: AuthClient
  /** Vrai dès que la connexion a abouti, y compris par le lien ouvert dans un autre onglet. */
  isSignedIn: boolean
  onClose: () => void
  onSignedIn: () => void
}

/**
 * Connexion sans mot de passe : Supabase envoie un e-mail contenant un lien de connexion (et un code
 * si le modèle d’e-mail le prévoit, ce qui demande un service d’envoi personnalisé).
 */
export function AccountDialog({ client, isSignedIn, onClose, onSignedIn }: AccountDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  useModalFocus(dialogRef, emailRef, onClose)

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const [showCode, setShowCode] = useState(false)

  // Lien ouvert dans un autre onglet du même navigateur : la session y est partagée, on ferme ici.
  const onSignedInRef = useRef(onSignedIn)
  onSignedInRef.current = onSignedIn
  useEffect(() => {
    if (isSignedIn) onSignedInRef.current()
  }, [isSignedIn])

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendIn])

  useEffect(() => {
    if (showCode) codeRef.current?.focus()
  }, [showCode])

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true)
    setError('')
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof AuthError ? caught.userMessage : 'La connexion a échoué. Réessayez dans un instant.')
    } finally {
      setIsBusy(false)
    }
  }

  const sendCode = (event?: FormEvent) => {
    event?.preventDefault()
    if (!isValidEmail(email)) {
      setError('Cette adresse e-mail n’est pas valide.')
      return
    }
    void run(async () => {
      await client.sendCode(email)
      setStep('code')
      setShowCode(false)
      setCode('')
      setResendIn(RESEND_DELAY_SECONDS)
    })
  }

  const cleanCode = code.replace(/\s/g, '')

  const verifyCode = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await client.verifyCode(email, cleanCode)
      onSignedIn()
    })
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className="dialog account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button dialog-close" type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button>
        <h2 id="account-title">Se connecter à Gilli</h2>

        {step === 'email' ? (
          <form onSubmit={sendCode}>
            <label className="field">
              <span className="field-label">Adresse e-mail</span>
              <input ref={emailRef} type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {error && <p className="message-error" role="alert">{error}</p>}
            <button type="submit" className="primary-button is-block" disabled={isBusy || !email.trim()}>
              {isBusy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />} Recevoir un lien de connexion
            </button>
            <p className="dialog-footnote">Pas de mot de passe : un lien vous est envoyé par e-mail à chaque connexion.</p>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <p className="dialog-description" role="status">
              E-mail envoyé à <strong>{email.trim()}</strong>. Ouvrez le lien qu’il contient <strong>sur cet appareil, dans ce navigateur</strong> : vous serez connecté automatiquement. Pensez aux courriers indésirables.
            </p>
            {!showCode && (
              <button type="button" className="text-button" onClick={() => setShowCode(true)}>J’ai reçu un code</button>
            )}
            {showCode && (<>
            <label className="field">
              <span className="field-label">Code reçu par e-mail</span>
              <input
                ref={codeRef}
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/[^\d\s]/g, ''))}
              />
            </label>
            <button type="submit" className="primary-button is-block" disabled={isBusy || cleanCode.length < 6}>
              {isBusy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null} Se connecter
            </button>
            </>)}
            {error && <p className="message-error" role="alert">{error}</p>}
            <div className="account-dialog-links">
              <button type="button" className="text-button" onClick={() => { setStep('email'); setError('') }}>Changer d’adresse</button>
              <button type="button" className="text-button" disabled={resendIn > 0 || isBusy} onClick={() => sendCode()}>
                {resendIn > 0 ? `Renvoyer l’e-mail (${resendIn} s)` : 'Renvoyer l’e-mail'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
