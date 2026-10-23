import { useState, type FormEvent } from 'react'
import { parseAmount } from '../../app/businessFormat'
import { healthLabels } from '../../app/livestock'
import type { Animal, HealthInput, HealthKind, HealthRecord, Herd } from '../../services/livestockApi'
import { Modal } from '../Modal'

const VET_NOTICE = 'Gilli ne donne pas de doses ni de traitements : suivez l’avis de votre vétérinaire.'

/** Nouveau soin : prévu (rappel à une date) ou déjà fait (date et coût). */
export function HealthDialog({ herds, animals, today, onSave, onClose }: {
  herds: Herd[]
  animals: Animal[]
  today: string
  onSave: (input: HealthInput) => Promise<void>
  onClose: () => void
}) {
  const [herdId, setHerdId] = useState(herds.length === 1 ? herds[0].id : '')
  const [animalId, setAnimalId] = useState('')
  const [kind, setKind] = useState<HealthKind>('vaccination')
  const [product, setProduct] = useState('')
  const [state, setState] = useState<'planned' | 'done'>('planned')
  const [date, setDate] = useState(today)
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const herd = herds.find((item) => item.id === herdId)
  const present = animals.filter((animal) => animal.herdId === herdId && animal.status === 'present')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!herd) return setError('Choisissez le lot.')
    if (!product.trim()) return setError('Indiquez le vaccin, le traitement ou le motif.')
    if (!date) return setError('Indiquez la date.')
    if (state === 'done' && date > today) return setError('Un soin fait ne peut pas être daté dans le futur.')
    const value = state === 'done' ? parseAmount(cost) : 0
    if (value === null) return setError('Indiquez un coût entier positif, sans centimes.')
    setIsSaving(true)
    setError('')
    try {
      await onSave({ herdId, animalId: animalId || null, kind, product: product.trim(), ...(state === 'done' ? { doneOn: date, cost: value } : { dueOn: date }), note: note.trim() || null })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
      setIsSaving(false)
    }
  }

  return (
    <Modal title="Nouveau soin" onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">Lot</span>
            <select value={herdId} onChange={(event) => { setHerdId(event.target.value); setAnimalId('') }}>
              <option value="">Choisir…</option>
              {herds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Type de soin</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as HealthKind)}>
              {(Object.keys(healthLabels) as HealthKind[]).map((value) => <option key={value} value={value}>{healthLabels[value]}</option>)}
            </select>
          </label>
        </div>
        {herd?.tracking === 'individual' && (
          <label className="field">
            <span className="field-label">Animal (facultatif)</span>
            <select value={animalId} onChange={(event) => setAnimalId(event.target.value)}>
              <option value="">Tout le lot</option>
              {present.map((animal) => <option key={animal.id} value={animal.id}>{animal.tag}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span className="field-label">Vaccin, traitement ou motif</span>
          <input value={product} maxLength={120} onChange={(event) => setProduct(event.target.value)} placeholder="Par exemple : Newcastle" />
        </label>
        <fieldset className="field radio-field">
          <legend className="field-label">État</legend>
          <label className="checkbox-field"><input type="radio" name="health-state" checked={state === 'planned'} onChange={() => setState('planned')} /> À faire (rappel)</label>
          <label className="checkbox-field"><input type="radio" name="health-state" checked={state === 'done'} onChange={() => { setState('done'); if (date > today) setDate(today) }} /> Déjà fait</label>
        </fieldset>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">{state === 'planned' ? 'Date prévue' : 'Date du soin'}</span>
            <input type="date" value={date} max={state === 'done' ? today : undefined} onChange={(event) => setDate(event.target.value)} />
          </label>
          {state === 'done' && (
            <label className="field"><span className="field-label">Coût (facultatif)</span><input inputMode="numeric" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="0" /></label>
          )}
        </div>
        <label className="field"><span className="field-label">Note (facultatif)</span><input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Vétérinaire, lot de vaccin…" /></label>
        <p className="field-hint">{VET_NOTICE}</p>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Enregistrer le soin</button>
      </form>
    </Modal>
  )
}

/** Soin prévu marqué comme fait : date et coût. */
export function HealthDoneDialog({ record, today, onSave, onClose }: {
  record: HealthRecord
  today: string
  onSave: (doneOn: string, cost: number) => Promise<void>
  onClose: () => void
}) {
  const [doneOn, setDoneOn] = useState(today)
  const [cost, setCost] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = parseAmount(cost)
    if (value === null) return setError('Indiquez un coût entier positif, sans centimes.')
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
    <Modal title={`Soin fait : ${record.product}`} onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <p className="dialog-description">{record.herdName}{record.animalTag ? ` · ${record.animalTag}` : ''}</p>
        <div className="field-pair">
          <label className="field"><span className="field-label">Date du soin</span><input type="date" value={doneOn} max={today} onChange={(event) => setDoneOn(event.target.value)} /></label>
          <label className="field"><span className="field-label">Coût (facultatif)</span><input inputMode="numeric" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="0" /></label>
        </div>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Marquer comme fait</button>
      </form>
    </Modal>
  )
}
