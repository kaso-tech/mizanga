import { AlertCircle, X } from 'lucide-react'
import { useState } from 'react'
import type { ChatMessage, LinguisticFeedback } from '../domain/types'

interface FeedbackDialogProps {
  message: ChatMessage | null
  onClose: () => void
  onSubmit: (feedback: LinguisticFeedback) => void
}

export function FeedbackDialog({ message, onClose, onSubmit }: FeedbackDialogProps) {
  const [selectedPassage, setSelectedPassage] = useState('')
  const [errorType, setErrorType] = useState<LinguisticFeedback['errorType']>('orthographe')
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
    setSelectedPassage('')
    setProposal('')
    setExplanation('')
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div><span className="dialog-icon"><AlertCircle size={19} /></span><div><p className="eyebrow">Qualité linguistique</p><h2 id="report-title">Signaler une erreur en Mooré</h2></div></div>
          <button className="icon-button" type="button" aria-label="Fermer le formulaire" onClick={onClose}><X size={19} /></button>
        </div>
        <p className="dialog-description">Cette démonstration prépare votre retour localement, sans l’enregistrer ni le valider. Dans une future version, chaque correction sera vérifiée avant toute utilisation linguistique.</p>
        <blockquote className="reported-message">{message.content}</blockquote>
        <form onSubmit={submit}>
          <label>Passage à corriger <span>facultatif</span><input value={selectedPassage} onChange={(event) => setSelectedPassage(event.target.value)} placeholder="Copiez le passage concerné" /></label>
          <label>Type d’erreur<select value={errorType} onChange={(event) => setErrorType(event.target.value as LinguisticFeedback['errorType'])}>
            <option value="orthographe">Orthographe</option><option value="grammaire">Grammaire</option><option value="vocabulaire">Vocabulaire</option><option value="traduction">Traduction</option><option value="expression">Expression idiomatique</option><option value="contexte">Contexte culturel</option><option value="autre">Autre</option>
          </select></label>
          <label>Proposition de correction<input required value={proposal} onChange={(event) => setProposal(event.target.value)} placeholder="Votre correction proposée" /></label>
          <label>Explication <span>facultatif</span><textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={2} placeholder="Ajoutez un contexte si utile" /></label>
          <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button type="submit" className="primary-button">Préparer le signalement</button></div>
        </form>
      </section>
    </div>
  )
}
