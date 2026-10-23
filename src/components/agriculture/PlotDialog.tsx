import { useState, type FormEvent } from 'react'
import { areaUnitLabels, formatArea, parseDecimal, tenureLabels } from '../../app/agriculture'
import type { AreaUnit, Plot, PlotInput, Tenure } from '../../services/agricultureApi'
import { Modal } from '../Modal'

const areaField = (plot?: Plot) => (plot ? String(plot.areaUnit === 'ha' ? plot.areaM2 / 10_000 : plot.areaM2).replace('.', ',') : '')

/** Nouvelle parcelle, ou modification d’une parcelle (et archivage). */
export function PlotDialog({ plot, onSave, onArchive, onClose }: {
  plot?: Plot
  onSave: (input: PlotInput) => Promise<void>
  onArchive?: () => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(plot?.name ?? '')
  const [location, setLocation] = useState(plot?.location ?? '')
  const [area, setArea] = useState(areaField(plot))
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(plot?.areaUnit ?? 'ha')
  const [tenure, setTenure] = useState<Tenure>(plot?.tenure ?? 'owned')
  const [note, setNote] = useState(plot?.note ?? '')
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
    if (!name.trim()) return setError('Donnez un nom à la parcelle.')
    const value = parseDecimal(area)
    if (value === null) return setError('Indiquez la surface (nombre positif, par exemple 1,5).')
    void run(() => onSave({ name: name.trim(), location: location.trim() || null, area: value, areaUnit, tenure, note: note.trim() || null }))
  }
  const preview = parseDecimal(area)

  return (
    <Modal title={plot ? `Parcelle : ${plot.name}` : 'Nouvelle parcelle'} onClose={onClose} className="business-dialog">
      <form onSubmit={submit}>
        <label className="field"><span className="field-label">Nom de la parcelle</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Par exemple : Champ derrière la maison" /></label>
        <label className="field"><span className="field-label">Village ou lieu (facultatif)</span><input value={location} maxLength={80} onChange={(event) => setLocation(event.target.value)} /></label>
        <div className="field-pair">
          <label className="field"><span className="field-label">Surface</span><input inputMode="decimal" value={area} onChange={(event) => setArea(event.target.value)} placeholder="1,5" /></label>
          <label className="field">
            <span className="field-label">Unité</span>
            <select value={areaUnit} onChange={(event) => setAreaUnit(event.target.value as AreaUnit)}>
              {(Object.keys(areaUnitLabels) as AreaUnit[]).map((value) => <option key={value} value={value}>{areaUnitLabels[value]}</option>)}
            </select>
          </label>
        </div>
        {preview !== null && <p className="field-hint">Soit {formatArea(Math.round(areaUnit === 'ha' ? preview * 10_000 : preview), areaUnit === 'ha' ? 'm2' : 'ha')}. 1 ha = 10 000 m².</p>}
        <label className="field">
          <span className="field-label">La terre est</span>
          <select value={tenure} onChange={(event) => setTenure(event.target.value as Tenure)}>
            {(Object.keys(tenureLabels) as Tenure[]).map((value) => <option key={value} value={value}>{tenureLabels[value]}</option>)}
          </select>
        </label>
        {tenure === 'rented' && <p className="field-hint">Le loyer s’enregistre dans le journal (opération « Location ») : il entre dans les coûts de la culture.</p>}
        <label className="field"><span className="field-label">Note (facultatif)</span><input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /></label>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>{plot ? 'Enregistrer' : 'Créer la parcelle'}</button>
        {plot && onArchive && <button type="button" className="secondary-button is-block" disabled={isSaving} onClick={() => void run(onArchive)}>{plot.archived ? 'Réactiver la parcelle' : 'Archiver la parcelle'}</button>}
      </form>
    </Modal>
  )
}
