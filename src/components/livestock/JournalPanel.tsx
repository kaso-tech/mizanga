import { Ban, NotebookPen, Plus } from 'lucide-react'
import { useState } from 'react'
import { formatAmount } from '../../app/businessFormat'
import { eventLabels, formatDay } from '../../app/livestock'
import type { Business, Period } from '../../services/businessApi'
import type { LivestockApi, LivestockEvent } from '../../services/livestockApi'
import { ConfirmDialog } from '../business/ConfirmDialog'
import { usePeriodData } from '../business/usePeriodData'

/** Journal de l’élevage sur la période ; le propriétaire peut annuler un événement (l’effectif revient). */
export function JournalPanel({ api, business, period, picker, version, onNewEvent, onChanged, onNotify }: {
  api: LivestockApi
  business: Business
  period: Period
  picker: React.ReactNode
  /** Change après chaque enregistrement : le journal est relu. */
  version: number
  onNewEvent: () => void
  onChanged: () => void
  onNotify: (message: string, tone?: 'success' | 'info') => void
}) {
  const { data: events, error, reload } = usePeriodData((range) => api.listEvents(business.id, range), period, version)
  const [cancelling, setCancelling] = useState<LivestockEvent | null>(null)
  const currency = business.currency

  return (
    <section aria-label="Journal" className="business-panel">
      <div className="business-toolbar">
        {picker}
        <button type="button" className="primary-button" onClick={onNewEvent}><Plus size={16} aria-hidden="true" /> Nouvel événement</button>
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!events && !error && <div className="page-loading" aria-busy="true" />}
      {events && events.length === 0 && (
        <div className="settings-section business-empty">
          <NotebookPen size={28} aria-hidden="true" />
          <p>Aucun événement sur cette période.</p>
        </div>
      )}
      {events && events.length > 0 && (
        <ul className="product-list" aria-label="Journal de l’élevage">
          {events.map((event) => (
            <li key={event.id} className={`product-card journal-card is-${event.kind} ${event.status === 'cancelled' ? 'is-cancelled' : ''}`}>
              <div className="product-main">
                <span className="product-name">{eventLabels[event.kind]}{event.quantity > 0 && event.kind !== 'count' ? ` · ${event.quantity.toLocaleString('fr')}` : ''}{event.animalTag ? ` · ${event.animalTag}` : ''}</span>
                {event.status === 'cancelled' && <span className="listing-badge is-withdrawn">Annulé</span>}
                <span className="sale-time">{formatDay(event.occurredOn)}</span>
              </div>
              <div className="product-figures">
                <span>{event.herdName}</span>
                {event.kind === 'count' && <span>Comptés : {event.quantity.toLocaleString('fr')} (écart {event.headcountDelta > 0 ? '+' : ''}{event.headcountDelta})</span>}
                {event.amount > 0 && <span>{formatAmount(event.amount, currency)}</span>}
                {event.cause && <span>Cause : {event.cause}</span>}
                {event.note && <span>{event.note}</span>}
                {event.cancelReason && <span>Motif d’annulation : {event.cancelReason}</span>}
              </div>
              {business.role === 'owner' && event.status === 'recorded' && event.kind !== 'start' && event.kind !== 'count' && (
                <div className="product-actions">
                  <button type="button" className="icon-button" onClick={() => setCancelling(event)} aria-label={`Annuler : ${eventLabels[event.kind]} du ${formatDay(event.occurredOn)} (${event.herdName})`} title="Annuler"><Ban size={16} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {cancelling && (
        <ConfirmDialog
          title="Annuler l’événement"
          description={`${eventLabels[cancelling.kind]} du ${formatDay(cancelling.occurredOn)} (${cancelling.herdName}) : l’effectif sera rétabli et l’événement restera visible comme annulé.`}
          confirmLabel="Annuler l’événement"
          reasonLabel="Motif (facultatif)"
          onClose={() => setCancelling(null)}
          onConfirm={async (reason) => {
            await api.cancelEvent(business.id, cancelling.id, reason || undefined)
            setCancelling(null)
            onNotify('Événement annulé.', 'success')
            reload()
            onChanged()
          }}
        />
      )}
    </section>
  )
}
