import { CalendarClock, Check, Plus, Stethoscope, X } from 'lucide-react'
import { useState } from 'react'
import { formatAmount } from '../../app/businessFormat'
import { daysBetween, formatDay, healthLabels } from '../../app/livestock'
import type { Business } from '../../services/businessApi'
import type { HealthRecord } from '../../services/livestockApi'
import { ConfirmDialog } from '../business/ConfirmDialog'
import { HealthDoneDialog } from './HealthDialog'

/** Libellé d’échéance d’un soin prévu : « En retard de 3 jours », « Aujourd’hui », « Dans 5 jours ». */
function dueLabel(dueOn: string, today: string) {
  const days = daysBetween(today, dueOn)
  if (days < 0) return `En retard de ${-days} jour${days < -1 ? 's' : ''}`
  if (days === 0) return 'Aujourd’hui'
  return `Dans ${days} jour${days > 1 ? 's' : ''}`
}

/** Santé du troupeau : rappels (en retard, à venir) et soins faits. Gilli ne donne ni dose ni traitement. */
export function HealthPanel({ business, health, today, onNewHealth, onDone, onCancel }: {
  business: Business
  health: HealthRecord[]
  today: string
  onNewHealth: () => void
  onDone: (record: HealthRecord, doneOn: string, cost: number) => Promise<void>
  onCancel: (record: HealthRecord) => Promise<void>
}) {
  const [dialog, setDialog] = useState<{ type: 'done' | 'cancel'; record: HealthRecord } | null>(null)
  const planned = health.filter((record) => record.status === 'planned')
  const late = planned.filter((record) => record.dueOn !== null && record.dueOn < today)
  const upcoming = planned.filter((record) => !(record.dueOn !== null && record.dueOn < today))
  const done = health.filter((record) => record.status === 'done')

  const plannedList = (records: HealthRecord[], label: string) => (
    <ul className="product-list" aria-label={label}>
      {records.map((record) => (
        <li key={record.id} className={`product-card health-card ${record.dueOn && record.dueOn < today ? 'is-late' : ''}`}>
          <div className="product-main">
            <span className="product-name">{healthLabels[record.kind]} : {record.product}</span>
            {record.dueOn && <span className={`stock-badge ${record.dueOn < today ? 'is-out' : 'is-low'}`}><CalendarClock size={12} aria-hidden="true" /> {dueLabel(record.dueOn, today)}</span>}
          </div>
          <div className="product-figures">
            <span>{record.herdName}{record.animalTag ? ` · ${record.animalTag}` : ''}</span>
            {record.dueOn && <span>Prévu le {formatDay(record.dueOn)}</span>}
            {record.note && <span>{record.note}</span>}
          </div>
          <div className="product-actions">
            <button type="button" className="secondary-button" onClick={() => setDialog({ type: 'done', record })} aria-label={`Marquer comme fait : ${record.product} (${record.herdName})`}><Check size={14} aria-hidden="true" /> Fait</button>
            <button type="button" className="icon-button" onClick={() => setDialog({ type: 'cancel', record })} aria-label={`Annuler le soin : ${record.product} (${record.herdName})`} title="Annuler"><X size={16} /></button>
          </div>
        </li>
      ))}
    </ul>
  )

  return (
    <section aria-label="Santé" className="business-panel">
      <div className="business-toolbar">
        <p className="settings-callout vet-notice"><Stethoscope size={16} aria-hidden="true" /><span>Gilli rappelle vos soins mais ne donne ni dose ni traitement. Animal malade ou morts inhabituelles : isolez les animaux et contactez un vétérinaire.</span></p>
        <button type="button" className="primary-button" onClick={onNewHealth}><Plus size={16} aria-hidden="true" /> Nouveau soin</button>
      </div>
      {planned.length === 0 && done.length === 0 && (
        <div className="settings-section business-empty">
          <CalendarClock size={28} aria-hidden="true" />
          <p>Enregistrez les vaccinations et traitements prévus : Gilli vous les rappellera.</p>
        </div>
      )}
      {late.length > 0 && <><h2 className="panel-subtitle">En retard</h2>{plannedList(late, 'Soins en retard')}</>}
      {upcoming.length > 0 && <><h2 className="panel-subtitle">À venir</h2>{plannedList(upcoming, 'Soins à venir')}</>}
      {done.length > 0 && (
        <>
          <h2 className="panel-subtitle">Faits</h2>
          <ul className="product-list" aria-label="Soins faits">
            {done.slice(0, 50).map((record) => (
              <li key={record.id} className="product-card health-card is-done">
                <div className="product-main">
                  <span className="product-name">{healthLabels[record.kind]} : {record.product}</span>
                  {record.doneOn && <span className="sale-time">{formatDay(record.doneOn)}</span>}
                </div>
                <div className="product-figures">
                  <span>{record.herdName}{record.animalTag ? ` · ${record.animalTag}` : ''}</span>
                  {record.cost > 0 && <span>{formatAmount(record.cost, business.currency)}</span>}
                  {record.note && <span>{record.note}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {dialog?.type === 'done' && (
        <HealthDoneDialog record={dialog.record} today={today} onClose={() => setDialog(null)} onSave={async (doneOn, cost) => { await onDone(dialog.record, doneOn, cost); setDialog(null) }} />
      )}
      {dialog?.type === 'cancel' && (
        <ConfirmDialog
          title="Annuler le soin"
          description={`${healthLabels[dialog.record.kind]} « ${dialog.record.product} » (${dialog.record.herdName}) ne sera plus rappelé.`}
          confirmLabel="Annuler le soin"
          onClose={() => setDialog(null)}
          onConfirm={async () => { await onCancel(dialog.record); setDialog(null) }}
        />
      )}
    </section>
  )
}
