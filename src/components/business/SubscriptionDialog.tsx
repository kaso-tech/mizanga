import { useEffect, useRef, useState } from 'react'
import { formatAmount } from '../../app/businessFormat'
import type { Subscription } from '../../services/businessApi'
import { Modal } from '../Modal'

const statusLabels: Record<Subscription['status'], string> = {
  test: 'Mode test : aucun paiement',
  active: 'Active',
  past_due: 'Paiement en retard',
  cancelled: 'Résiliée',
}

/** Formule du commerce, ses limites et la consommation du jour. Aucun paiement n’est possible pour l’instant. */
export function SubscriptionDialog({ load, onClose }: { load: () => Promise<Subscription>; onClose: () => void }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [error, setError] = useState('')
  const loadRef = useRef(load)
  useEffect(() => {
    let cancelled = false
    loadRef.current().then((loaded) => { if (!cancelled) setSubscription(loaded) }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Formule indisponible.') })
    return () => { cancelled = true }
  }, [])

  return (
    <Modal title="Votre formule" onClose={onClose} className="business-dialog">
      {error && <p className="message-error" role="alert">{error}</p>}
      {!subscription && !error && <div className="page-loading" aria-busy="true" />}
      {subscription && (
        <div className="subscription-details">
          <p className="subscription-plan">
            <strong>{subscription.planName}</strong>
            <span className={`stock-badge ${subscription.status === 'test' || subscription.status === 'active' ? 'is-low' : 'is-out'}`}>{statusLabels[subscription.status]}</span>
          </p>
          <dl>
            <div><dt>Prix</dt><dd>{subscription.monthlyPrice > 0 ? `${formatAmount(subscription.monthlyPrice, subscription.currency)} par mois` : 'Gratuit'}</dd></div>
            <div><dt>Questions à l’assistant</dt><dd>{subscription.aiUsedToday} sur {subscription.dailyAiRequests} aujourd’hui</dd></div>
            <div><dt>Commerces</dt><dd>{subscription.maxBusinesses} au maximum</dd></div>
            {subscription.currentPeriodEnd && <div><dt>Fin de la période</dt><dd>{new Date(subscription.currentPeriodEnd).toLocaleDateString('fr', { dateStyle: 'long' })}</dd></div>}
          </dl>
          <p className="field-hint">Les formules payantes, leurs prix et les moyens de paiement ne sont pas encore disponibles.</p>
        </div>
      )}
    </Modal>
  )
}
