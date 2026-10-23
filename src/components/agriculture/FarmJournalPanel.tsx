import { Ban, NotebookPen, Plus } from 'lucide-react'
import { useState } from 'react'
import { cropName, formatKg, inputLabels, operationLabels, workLabels } from '../../app/agriculture'
import { formatAmount, formatQuantity } from '../../app/businessFormat'
import { formatDay } from '../../app/livestock'
import type { Business, Period } from '../../services/businessApi'
import type { AgricultureApi, Operation } from '../../services/agricultureApi'
import { ConfirmDialog } from '../business/ConfirmDialog'
import { usePeriodData } from '../business/usePeriodData'

/** Titre d’une opération : « Sarclage, désherbage », « Engrais · NPK », « Récolte · 18 sacs ». */
function titleOf(operation: Operation) {
  if (operation.kind === 'work' && operation.workType) return workLabels[operation.workType]
  if (operation.kind === 'input' && operation.inputType) return `${inputLabels[operation.inputType]}${operation.label ? ` · ${operation.label}` : ''}`
  return operationLabels[operation.kind]
}

/** Journal de l’exploitation sur la période ; le propriétaire peut annuler une opération (le stock revient). */
export function FarmJournalPanel({ api, business, period, picker, version, onNewOperation, onChanged, onNotify }: {
  api: AgricultureApi
  business: Business
  period: Period
  picker: React.ReactNode
  version: number
  onNewOperation: () => void
  onChanged: () => void
  onNotify: (message: string, tone?: 'success' | 'info') => void
}) {
  const { data: operations, error, reload } = usePeriodData((range) => api.listOperations(business.id, range), period, version)
  const [cancelling, setCancelling] = useState<Operation | null>(null)

  return (
    <section aria-label="Journal" className="business-panel">
      <div className="business-toolbar">
        {picker}
        <button type="button" className="primary-button" onClick={onNewOperation}><Plus size={16} aria-hidden="true" /> Nouvelle opération</button>
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!operations && !error && <div className="page-loading" aria-busy="true" />}
      {operations && operations.length === 0 && (
        <div className="settings-section business-empty">
          <NotebookPen size={28} aria-hidden="true" />
          <p>Aucune opération sur cette période.</p>
        </div>
      )}
      {operations && operations.length > 0 && (
        <ul className="product-list" aria-label="Journal de l’exploitation">
          {operations.map((operation) => (
            <li key={operation.id} className={`product-card journal-card is-${operation.kind} ${operation.status === 'cancelled' ? 'is-cancelled' : ''}`}>
              <div className="product-main">
                <span className="product-name">{titleOf(operation)}{operation.quantityKg > 0 ? ` · ${formatKg(operation.quantityKg)}` : ''}</span>
                {operation.status === 'cancelled' && <span className="listing-badge is-withdrawn">Annulée</span>}
                <span className="sale-time">{formatDay(operation.occurredOn)}</span>
              </div>
              <div className="product-figures">
                <span>{cropName(operation)}</span>
                {operation.quantity !== null && operation.unit && operation.unit !== 'kg' && <span>{formatQuantity(operation.quantity)} {operation.unit}</span>}
                {operation.amount > 0 && <span>{formatAmount(operation.amount, business.currency)}</span>}
                {operation.kind !== 'input' && operation.label && <span>{operation.label}</span>}
                {operation.note && <span>{operation.note}</span>}
                {operation.cancelReason && <span>Motif d’annulation : {operation.cancelReason}</span>}
              </div>
              {business.role === 'owner' && operation.status === 'recorded' && (
                <div className="product-actions">
                  <button type="button" className="icon-button" onClick={() => setCancelling(operation)} aria-label={`Annuler : ${titleOf(operation)} du ${formatDay(operation.occurredOn)} (${cropName(operation)})`} title="Annuler"><Ban size={16} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {cancelling && (
        <ConfirmDialog
          title="Annuler l’opération"
          description={`${titleOf(cancelling)} du ${formatDay(cancelling.occurredOn)} (${cropName(cancelling)}) : le stock de récolte sera rétabli et l’opération restera visible comme annulée.`}
          confirmLabel="Annuler l’opération"
          reasonLabel="Motif (facultatif)"
          onClose={() => setCancelling(null)}
          onConfirm={async (reason) => {
            await api.cancelOperation(business.id, cancelling.id, reason || undefined)
            setCancelling(null)
            onNotify('Opération annulée.', 'success')
            reload()
            onChanged()
          }}
        />
      )}
    </section>
  )
}
