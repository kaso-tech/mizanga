import { AlertCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { errorTypeLabels } from '../data/content'
import type { ChatMessage, LinguisticErrorType, LinguisticFeedback } from '../domain/types'

interface FeedbackDialogProps {
  message: ChatMessage | null
  onClose: () => void
  onSubmit: (feedback: LinguisticFeedback) => void
}

const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'

/** Le parent remonte ce composant (clé) à chaque ouverture : le formulaire repart toujours vide. */
export function FeedbackDialog({ message, onClose, onSubmit }: FeedbackDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!message) return
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    firstFieldRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      // Garde le focus dans la fenêtre modale.
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (returnFocusTo?.isConnected) returnFocusTo.focus()
    }
  }, [message])

  const [selectedPassage, setSelectedPassage] = useState('')
  const [errorType, setErrorType] = useState<LinguisticErrorType>('orthographe')
  const [proposal, setProposal] = useState('')
  const [explanation, setExplanation] = useState('')

  if (!message) return null

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit({
      messageId: message.id,
      selectedPassage: selectedPassage || undefined,
      errorType,
      proposal,
      explanation: explanation || undefined,
    })
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div><span className="dialog-icon"><AlertCircle size={19} /></span><div><p className="eyebrow">Qualité du mooré</p><h2 id="report-title">Proposer une correction</h2></div></div>
          <button className="icon-button" type="button" aria-label="Fermer le formulaire" onClick={onClose}><X size={19} /></button>
        </div>
        <p className="dialog-description">Votre correction aide Mizanga à mieux parler mooré. Dans cette version, elle reste locale : elle n’est ni enregistrée ni validée. Plus tard, chaque correction sera vérifiée avant toute utilisation.</p>
        <blockquote className="reported-message">{message.content}</blockquote>
        <form onSubmit={submit}>
          <label>Passage à corriger <span>facultatif</span><input ref={firstFieldRef} value={selectedPassage} onChange={(event) => setSelectedPassage(event.target.value)} placeholder="Copiez le passage concerné" /></label>
          <label>Type d’erreur<select value={errorType} onChange={(event) => setErrorType(event.target.value as LinguisticErrorType)}>
            {Object.entries(errorTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Proposition de correction<input required lang="mos" value={proposal} onChange={(event) => setProposal(event.target.value)} placeholder="Votre correction proposée" /></label>
          <label>Explication <span>facultatif</span><textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={2} placeholder="Ajoutez un contexte si utile" /></label>
          <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button type="submit" className="primary-button">Préparer la correction</button></div>
        </form>
      </section>
    </div>
  )
}
