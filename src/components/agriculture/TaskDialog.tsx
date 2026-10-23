import { useState, type FormEvent } from 'react'
import { cropName, workLabels } from '../../app/agriculture'
import { parseAmount } from '../../app/businessFormat'
import type { Crop, FarmTask, TaskInput, WorkType } from '../../services/agricultureApi'
import { Modal } from '../Modal'

/** Nouveau travail prévu (rappel). */
export function TaskDialog({ crops, today, onSave, onClose }: { crops: Crop[]; today: string; onSave: (input: TaskInput) => Promise<void>; onClose: () => void }) {
  const [cropId, setCropId] = useState(crops.length === 1 ? crops[0].id : '')
  const [workType, setWorkType] = useState<WorkType | ''>('')
  const [label, setLabel] = useState('')
  const [dueOn, setDueOn] = useState(today)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!cropId) return setError('Choisissez la culture.')
    if (!workType) return setError('Choisissez le travail.')
    if (!dueOn) return setError('Indiquez la date prévue.')
    setIsSaving(true)
    setError('')
    try {
      await onSave({ cropId, workType, label: label.trim() || null, dueOn })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
      setIsSaving(false)
    }
  }
  return (
    <Modal title="Nouveau travail prévu" onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span className="field-label">Culture</span>
          <select value={cropId} onChange={(event) => setCropId(event.target.value)}>
            <option value="">Choisir…</option>
            {crops.map((item) => <option key={item.id} value={item.id}>{cropName(item)} ({item.year})</option>)}
          </select>
        </label>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">Travail</span>
            <select value={workType} onChange={(event) => setWorkType(event.target.value as WorkType | '')}>
              <option value="">Choisir…</option>
              {(Object.keys(workLabels) as WorkType[]).map((value) => <option key={value} value={value}>{workLabels[value]}</option>)}
            </select>
          </label>
          <label className="field"><span className="field-label">Date prévue</span><input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} /></label>
        </div>
        <label className="field"><span className="field-label">Précision (facultatif)</span><input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="Deuxième sarclage…" /></label>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Enregistrer le rappel</button>
      </form>
    </Modal>
  )
}

/** Travail prévu marqué comme fait : il entre au journal, avec la main-d’œuvre payée s’il y en a. */
export function TaskDoneDialog({ task, today, onSave, onClose }: { task: FarmTask; today: string; onSave: (doneOn: string, amount: number) => Promise<void>; onClose: () => void }) {
  const [doneOn, setDoneOn] = useState(today)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = parseAmount(amount)
    if (value === null) return setError('Le montant est un nombre entier, sans centimes.')
    if (!doneOn || doneOn > today) return setError('La date ne peut pas être dans le futur.')
    setIsSaving(true)
    setError('')
    try {
      await onSave(doneOn, value)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
      setIsSaving(false)
    }
  }
  return (
    <Modal title={`Travail fait : ${task.label ?? workLabels[task.workType]}`} onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <p className="dialog-description">{cropName(task)}</p>
        <div className="field-pair">
          <label className="field"><span className="field-label">Date</span><input type="date" value={doneOn} max={today} onChange={(event) => setDoneOn(event.target.value)} /></label>
          <label className="field"><span className="field-label">Main-d’œuvre payée (facultatif)</span><input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></label>
        </div>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Marquer comme fait</button>
      </form>
    </Modal>
  )
}
