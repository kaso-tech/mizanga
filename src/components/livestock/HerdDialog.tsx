import { useState, type FormEvent } from 'react'
import { parseAmount } from '../../app/businessFormat'
import { speciesLabels, speciesOrder, trackingLabels } from '../../app/livestock'
import type { Herd, HerdInput, Species, Tracking } from '../../services/livestockApi'
import { Modal } from '../Modal'

/** Nouveau lot (ou troupeau), ou modification d’un lot : nom, note, archivage. */
export function HerdDialog({ herd, today, onCreate, onUpdate, onClose }: {
  herd?: Herd
  today: string
  onCreate?: (input: HerdInput) => Promise<void>
  onUpdate?: (changes: { name?: string; note?: string | null; archived?: boolean }) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(herd?.name ?? '')
  const [species, setSpecies] = useState<Species | ''>(herd?.species ?? '')
  const [tracking, setTracking] = useState<Tracking>(herd?.tracking ?? 'group')
  const [initialCount, setInitialCount] = useState('')
  const [startedOn, setStartedOn] = useState(herd?.startedOn ?? today)
  const [note, setNote] = useState(herd?.note ?? '')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const run = async (work: () => Promise<void>) => {
    setIsSaving(true)
    setError('')
    try {
      await work()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
      setIsSaving(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('Donnez un nom au lot.')
    if (herd) return void run(() => onUpdate!({ name: name.trim(), note: note.trim() || null }))
    if (!species) return setError('Choisissez une espèce.')
    const count = tracking === 'group' ? parseAmount(initialCount) : 0
    if (count === null) return setError('L’effectif de départ doit être un nombre entier.')
    if (!startedOn || startedOn > today) return setError('La date de début ne peut pas être dans le futur.')
    void run(() => onCreate!({ name: name.trim(), species, tracking, initialCount: count, startedOn, note: note.trim() || null }))
  }

  return (
    <Modal title={herd ? `Lot : ${herd.name}` : 'Nouveau lot'} onClose={onClose} className="business-dialog">
      <form onSubmit={submit}>
        <label className="field">
          <span className="field-label">Nom du lot</span>
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Par exemple : Poulets de chair — bande de mars" />
        </label>
        {!herd && (
          <>
            <label className="field">
              <span className="field-label">Espèce</span>
              <select value={species} onChange={(event) => {
                const value = event.target.value as Species | ''
                setSpecies(value)
                // Les bovins se suivent le plus souvent un par un.
                setTracking(value === 'cattle' ? 'individual' : 'group')
              }}>
                <option value="">Choisir…</option>
                {speciesOrder.map((value) => <option key={value} value={value}>{speciesLabels[value]}</option>)}
              </select>
            </label>
            <fieldset className="field radio-field">
              <legend className="field-label">Suivi</legend>
              {(['group', 'individual'] as Tracking[]).map((value) => (
                <label key={value} className="checkbox-field">
                  <input type="radio" name="herd-tracking" checked={tracking === value} onChange={() => setTracking(value)} /> {trackingLabels[value]}
                </label>
              ))}
            </fieldset>
            <div className="field-pair">
              {tracking === 'group' && (
                <label className="field">
                  <span className="field-label">Effectif de départ</span>
                  <input inputMode="numeric" value={initialCount} onChange={(event) => setInitialCount(event.target.value)} placeholder="0" />
                </label>
              )}
              <label className="field">
                <span className="field-label">Date de début</span>
                <input type="date" value={startedOn} max={today} onChange={(event) => setStartedOn(event.target.value)} />
              </label>
            </div>
            {tracking === 'individual' && <p className="field-hint">Chaque animal sera ajouté avec son numéro (achat ou naissance).</p>}
          </>
        )}
        <label className="field">
          <span className="field-label">Note (facultatif)</span>
          <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Race, origine, bâtiment…" />
        </label>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>{herd ? 'Enregistrer' : 'Créer le lot'}</button>
        {herd && onUpdate && (
          <button type="button" className="secondary-button is-block" disabled={isSaving} onClick={() => void run(() => onUpdate({ archived: !herd.archived }))}>
            {herd.archived ? 'Réactiver le lot' : 'Archiver le lot'}
          </button>
        )}
      </form>
    </Modal>
  )
}
