import { CalendarClock, Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { cropName, workLabels } from '../../app/agriculture'
import { daysBetween, formatDay } from '../../app/livestock'
import type { FarmTask } from '../../services/agricultureApi'
import { ConfirmDialog } from '../business/ConfirmDialog'
import { TaskDoneDialog } from './TaskDialog'

function dueLabel(dueOn: string, today: string) {
  const days = daysBetween(today, dueOn)
  if (days < 0) return `En retard de ${-days} jour${days < -1 ? 's' : ''}`
  if (days === 0) return 'Aujourd’hui'
  return `Dans ${days} jour${days > 1 ? 's' : ''}`
}

/** Travaux prévus (rappels) : en retard, à venir ; puis ceux faits récemment. */
export function TasksPanel({ tasks, today, onNewTask, onDone, onCancel }: {
  tasks: FarmTask[]
  today: string
  onNewTask: () => void
  onDone: (task: FarmTask, doneOn: string, amount: number) => Promise<void>
  onCancel: (task: FarmTask) => Promise<void>
}) {
  const [dialog, setDialog] = useState<{ type: 'done' | 'cancel'; task: FarmTask } | null>(null)
  const planned = tasks.filter((task) => task.status === 'planned')
  const late = planned.filter((task) => task.dueOn < today)
  const upcoming = planned.filter((task) => task.dueOn >= today)
  const done = tasks.filter((task) => task.status === 'done')
  const title = (task: FarmTask) => task.label ?? workLabels[task.workType]

  const list = (items: FarmTask[], label: string) => (
    <ul className="product-list" aria-label={label}>
      {items.map((task) => (
        <li key={task.id} className={`product-card health-card ${task.dueOn < today ? 'is-late' : ''}`}>
          <div className="product-main">
            <span className="product-name">{title(task)}</span>
            <span className={`stock-badge ${task.dueOn < today ? 'is-out' : 'is-low'}`}><CalendarClock size={12} aria-hidden="true" /> {dueLabel(task.dueOn, today)}</span>
          </div>
          <div className="product-figures">
            <span>{cropName(task)}</span>
            <span>{workLabels[task.workType]} · prévu le {formatDay(task.dueOn)}</span>
          </div>
          <div className="product-actions">
            <button type="button" className="secondary-button" onClick={() => setDialog({ type: 'done', task })} aria-label={`Marquer comme fait : ${title(task)} (${cropName(task)})`}><Check size={14} aria-hidden="true" /> Fait</button>
            <button type="button" className="icon-button" onClick={() => setDialog({ type: 'cancel', task })} aria-label={`Annuler le travail : ${title(task)} (${cropName(task)})`} title="Annuler"><X size={16} /></button>
          </div>
        </li>
      ))}
    </ul>
  )

  return (
    <section aria-label="Travaux" className="business-panel">
      <div className="business-toolbar">
        <p className="field-hint">Un travail marqué fait entre au journal, avec la main-d’œuvre payée.</p>
        <button type="button" className="primary-button" onClick={onNewTask}><Plus size={16} aria-hidden="true" /> Nouveau travail prévu</button>
      </div>
      {planned.length === 0 && done.length === 0 && (
        <div className="settings-section business-empty">
          <CalendarClock size={28} aria-hidden="true" />
          <p>Prévoyez vos sarclages, fertilisations, traitements et récoltes : Gilli vous les rappellera.</p>
        </div>
      )}
      {late.length > 0 && <><h2 className="panel-subtitle">En retard</h2>{list(late, 'Travaux en retard')}</>}
      {upcoming.length > 0 && <><h2 className="panel-subtitle">À venir</h2>{list(upcoming, 'Travaux à venir')}</>}
      {done.length > 0 && (
        <>
          <h2 className="panel-subtitle">Faits</h2>
          <ul className="product-list" aria-label="Travaux faits">
            {done.slice(0, 50).map((task) => (
              <li key={task.id} className="product-card health-card is-done">
                <div className="product-main"><span className="product-name">{title(task)}</span>{task.doneOn && <span className="sale-time">{formatDay(task.doneOn)}</span>}</div>
                <div className="product-figures"><span>{cropName(task)}</span></div>
              </li>
            ))}
          </ul>
        </>
      )}
      {dialog?.type === 'done' && (
        <TaskDoneDialog task={dialog.task} today={today} onClose={() => setDialog(null)} onSave={async (doneOn, amount) => { await onDone(dialog.task, doneOn, amount); setDialog(null) }} />
      )}
      {dialog?.type === 'cancel' && (
        <ConfirmDialog
          title="Annuler le travail prévu"
          description={`« ${title(dialog.task)} » (${cropName(dialog.task)}) ne sera plus rappelé.`}
          confirmLabel="Annuler le travail"
          onClose={() => setDialog(null)}
          onConfirm={async () => { await onCancel(dialog.task); setDialog(null) }}
        />
      )}
    </section>
  )
}
