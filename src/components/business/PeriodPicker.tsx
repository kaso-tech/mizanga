import { describePeriod, periodLabels, type PeriodPreset } from '../../app/businessPeriods'
import type { Period } from '../../services/businessApi'

/** Choix de la période affichée (ventes, dépenses, résultats), rappelée en toutes lettres. */
export function PeriodPicker({ preset, period, onChange }: { preset: PeriodPreset; period: Period; onChange: (preset: PeriodPreset) => void }) {
  return (
    <div className="period-picker">
      <label className="field">
        <span className="visually-hidden">Période</span>
        <select value={preset} onChange={(event) => onChange(event.target.value as PeriodPreset)} aria-label="Période">
          {(Object.keys(periodLabels) as PeriodPreset[]).map((value) => <option key={value} value={value}>{periodLabels[value]}</option>)}
        </select>
      </label>
      <span className="period-description">{describePeriod(period)}</span>
    </div>
  )
}
