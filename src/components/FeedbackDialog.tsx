import { X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useModalFocus } from '../app/useModalFocus'
import { errorTypeLabels } from '../data/content'
import type { ChatMessage, LinguisticErrorType, LinguisticFeedback } from '../domain/types'

interface FeedbackDialogProps {
  message: ChatMessage | null
  initialPassage?: string
  onClose: () => void
  onSubmit: (feedback: LinguisticFeedback) => void
}

/** Le parent remonte ce composant (clé) à chaque ouverture : le formulaire repart toujours vide. */
export function FeedbackDialog({ message, initialPassage = '', onClose, onSubmit }: FeedbackDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  useModalFocus(dialogRef, firstFieldRef, onClose, Boolean(message))

  const [selectedPassage, setSelectedPassage] = useState(initialPassage)
  const [errorType, setErrorType] = useState<LinguisticErrorType | null>(null)
  const [proposal, setProposal] = useState('')
  const [explanation, setExplanation] = useState('')

  if (!message) return null

  const isValid = errorType !== null && proposal.trim().length > 0

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!errorType || !isValid) return
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
      <section ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button dialog-close" type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button>
        <h2 id="report-title">Signaler une erreur en mooré</h2>
        <form onSubmit={submit}>
          <div className="field">
            <p className="field-label">Réponse concernée</p>
            <p className="reported-message">{message.content}</p>
          </div>
          <label className="field">
            <span className="field-label">Passage à corriger (facultatif)</span>
            <input ref={firstFieldRef} lang="mos" value={selectedPassage} onChange={(event) => setSelectedPassage(event.target.value)} />
          </label>
          <fieldset className="field">
            <legend className="field-label">Type d’erreur</legend>
            <div className="choice-row">
              {(Object.entries(errorTypeLabels) as Array<[LinguisticErrorType, string]>).map(([type, label]) => (
                <button key={type} type="button" className={`choice ${errorType === type ? 'is-selected' : ''}`} aria-pressed={errorType === type} onClick={() => setErrorType(type)}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span className="field-label">Proposition de correction</span>
            <textarea required lang="mos" rows={2} value={proposal} onChange={(event) => setProposal(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Explication (facultatif)</span>
            <textarea rows={2} value={explanation} onChange={(event) => setExplanation(event.target.value)} />
          </label>
          <button type="submit" className="primary-button is-block" disabled={!isValid}>Préparer le signalement</button>
          <p className="dialog-footnote">Pas encore envoyé : enregistrement bientôt disponible.</p>
        </form>
      </section>
    </div>
  )
}
