import { useState, type FormEvent } from 'react'
import { areaUnitLabels, cropGroups, cropLabels, formatArea, parseDecimal, seasonLabels } from '../../app/agriculture'
import type { AreaUnit, CropCode, CropInput, Plot, Season } from '../../services/agricultureApi'
import { Modal } from '../Modal'

/** Nouvelle culture sur une parcelle, pour une saison et une année. */
export function CropDialog({ plots, today, initialPlotId, onSave, onClose }: {
  plots: Plot[]
  today: string
  initialPlotId?: string
  onSave: (input: CropInput) => Promise<void>
  onClose: () => void
}) {
  const [plotId, setPlotId] = useState(initialPlotId ?? (plots.length === 1 ? plots[0].id : ''))
  const [crop, setCrop] = useState<CropCode | ''>('')
  const [label, setLabel] = useState('')
  const [season, setSeason] = useState<Season>('rainy')
  const [year, setYear] = useState(today.slice(0, 4))
  const [area, setArea] = useState('')
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('ha')
  const [sownOn, setSownOn] = useState('')
  const [expectedHarvestOn, setExpectedHarvestOn] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const plot = plots.find((item) => item.id === plotId)
  const thisYear = Number(today.slice(0, 4))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!plot) return setError('Choisissez la parcelle.')
    if (!crop) return setError('Choisissez la culture.')
    if (crop === 'other' && !label.trim()) return setError('Indiquez le nom de la culture.')
    const value = parseDecimal(area)
    if (value === null) return setError('Indiquez la surface cultivée.')
    setIsSaving(true)
    setError('')
    try {
      await onSave({ plotId, crop, label: crop === 'other' ? label.trim() : null, season, year: Number(year), area: value, areaUnit, sownOn: sownOn || null, expectedHarvestOn: expectedHarvestOn || null })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
      setIsSaving(false)
    }
  }

  return (
    <Modal title="Nouvelle culture" onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span className="field-label">Parcelle</span>
          <select value={plotId} onChange={(event) => setPlotId(event.target.value)}>
            <option value="">Choisir…</option>
            {plots.map((item) => <option key={item.id} value={item.id}>{item.name} ({formatArea(item.areaM2, item.areaUnit)})</option>)}
          </select>
        </label>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">Culture</span>
            <select value={crop} onChange={(event) => setCrop(event.target.value as CropCode | '')}>
              <option value="">Choisir…</option>
              {cropGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.crops.map((value) => <option key={value} value={value}>{cropLabels[value]}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {crop === 'other' && <label className="field"><span className="field-label">Nom de la culture</span><input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} placeholder="Igname, manioc…" /></label>}
        </div>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">Saison</span>
            <select value={season} onChange={(event) => setSeason(event.target.value as Season)}>
              {(Object.keys(seasonLabels) as Season[]).map((value) => <option key={value} value={value}>{seasonLabels[value]}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Année</span>
            <select value={year} onChange={(event) => setYear(event.target.value)}>
              {[thisYear + 1, thisYear, thisYear - 1].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <div className="field-pair">
          <label className="field"><span className="field-label">Surface cultivée</span><input inputMode="decimal" value={area} onChange={(event) => setArea(event.target.value)} placeholder={plot ? String(plot.areaUnit === 'ha' ? plot.areaM2 / 10_000 : plot.areaM2).replace('.', ',') : '1'} /></label>
          <label className="field">
            <span className="field-label">Unité</span>
            <select value={areaUnit} onChange={(event) => setAreaUnit(event.target.value as AreaUnit)}>
              {(Object.keys(areaUnitLabels) as AreaUnit[]).map((value) => <option key={value} value={value}>{areaUnitLabels[value]}</option>)}
            </select>
          </label>
        </div>
        <div className="field-pair">
          <label className="field"><span className="field-label">Date de semis (facultatif)</span><input type="date" value={sownOn} onChange={(event) => setSownOn(event.target.value)} /></label>
          <label className="field"><span className="field-label">Récolte prévue (facultatif)</span><input type="date" value={expectedHarvestOn} onChange={(event) => setExpectedHarvestOn(event.target.value)} /></label>
        </div>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Créer la culture</button>
      </form>
    </Modal>
  )
}
