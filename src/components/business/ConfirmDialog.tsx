import { useState, type FormEvent } from 'react'
import { Modal } from '../Modal'

/** Confirmation d’une action irréversible, avec un motif facultatif ; l’erreur reste affichée dans la fenêtre. */
export function ConfirmDialog({ title, description, confirmLabel, reasonLabel, onConfirm, onClose }: {
  title: string
  description: string
  confirmLabel: string
  reasonLabel?: string
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      await onConfirm(reason.trim())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’opération a échoué.')
      setIsSaving(false)
    }
  }
  return (
    <Modal title={title} onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <p className="dialog-description">{description}</p>
        {reasonLabel && (
          <label className="field">
            <span className="field-label">{reasonLabel}</span>
            <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
          </label>
        )}
        {error && <p className="message-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Retour</button>
          <button type="submit" className="primary-button danger-button" disabled={isSaving}>{confirmLabel}</button>
        </div>
      </form>
    </Modal>
  )
}
