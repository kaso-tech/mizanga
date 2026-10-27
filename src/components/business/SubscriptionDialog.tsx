import { Check, Clock3, Crown } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { formatAmount } from '../../app/businessFormat'
import type { Payment, PaymentRequest, PlanOffer, Subscription } from '../../services/businessApi'
import { Modal } from '../Modal'
import { PaymentForm } from './PaymentForm'

const paymentStatus: Record<Payment['status'], string> = { pending: 'En cours de vérification', confirmed: 'Confirmé', rejected: 'Refusé' }
const durations = [1, 3, 6, 12]

/** Ce qu’une formule permet, ligne par ligne. */
function PlanFeatures({ plan }: { plan: PlanOffer }) {
  return (
    <ul className="plan-features">
      <li><Check size={14} aria-hidden="true" /> {plan.maxListings} annonce{plan.maxListings > 1 ? 's' : ''} en ligne</li>
      <li><Check size={14} aria-hidden="true" /> {plan.maxPhotos} photo{plan.maxPhotos > 1 ? 's' : ''} par annonce</li>
      <li><Check size={14} aria-hidden="true" /> {plan.dailyAiRequests} questions par jour à l’assistant</li>
      <li><Check size={14} aria-hidden="true" /> {plan.maxBusinesses} commerce{plan.maxBusinesses > 1 ? 's' : ''}</li>
    </ul>
  )
}

/** Paiements déclarés par le commerce et leur état. */
export function PaymentHistory({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) return null
  return (
    <details className="payment-history">
      <summary>Mes paiements ({payments.length})</summary>
      <ul>
        {payments.map((payment) => (
          <li key={payment.id}>
            <span>{payment.kind === 'pro' ? `Formule Pro, ${payment.months} mois` : 'Sponsorisation'} · {formatAmount(payment.amount, payment.currency)} · {new Date(payment.createdAt).toLocaleDateString('fr', { dateStyle: 'medium' })}</span>
            <span className={`payment-status is-${payment.status}`}>{paymentStatus[payment.status]}</span>
            {payment.adminNote && <span className="field-hint">{payment.adminNote}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Formule du commerce, limites et consommation ; passage à la formule Pro par Mobile Money. */
export function SubscriptionDialog({ load, onPay, onClose }: { load: () => Promise<Subscription>; onPay?: (payment: PaymentRequest) => Promise<void>; onClose: () => void }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [error, setError] = useState('')
  const [isPaying, setIsPaying] = useState(false)
  const [months, setMonths] = useState(1)
  const refresh = useCallback(() => {
    load().then(setSubscription).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Formule indisponible.'))
  }, [load])
  useEffect(() => { refresh() }, [refresh])

  const pro = subscription?.plans?.find((plan) => plan.id === 'pro')
  const free = subscription?.plans?.find((plan) => plan.id === 'test')
  const isPro = subscription?.planId === 'pro'
  const pending = subscription?.payments?.find((payment) => payment.kind === 'pro' && payment.status === 'pending')
  const daysLeft = subscription?.currentPeriodEnd ? Math.ceil((Date.parse(subscription.currentPeriodEnd) - Date.now()) / 86_400_000) : null

  return (
    <Modal title="Votre formule" onClose={onClose} className="business-dialog">
      {error && <p className="message-error" role="alert">{error}</p>}
      {!subscription && !error && <div className="page-loading" aria-busy="true" />}
      {subscription && (
        <div className="subscription-details">
          <p className="subscription-plan">
            <strong>{isPro && <Crown size={16} aria-hidden="true" />} Formule {subscription.planName}</strong>
            {isPro && subscription.currentPeriodEnd && <span className={`stock-badge ${daysLeft !== null && daysLeft <= 7 ? 'is-out' : 'is-low'}`}>Jusqu’au {new Date(subscription.currentPeriodEnd).toLocaleDateString('fr', { dateStyle: 'long' })}</span>}
          </p>
          <dl>
            <div><dt>Annonces en ligne</dt><dd>{subscription.activeListings ?? 0} sur {subscription.maxListings ?? '—'}</dd></div>
            <div><dt>Photos par annonce</dt><dd>{subscription.maxPhotos ?? 5} au maximum</dd></div>
            <div><dt>Questions à l’assistant</dt><dd>{subscription.aiUsedToday} sur {subscription.dailyAiRequests} aujourd’hui</dd></div>
            <div><dt>Commerces</dt><dd>{subscription.maxBusinesses} au maximum</dd></div>
          </dl>
          {isPro && daysLeft !== null && daysLeft <= 7 && <p className="settings-callout">Votre formule Pro se termine dans {daysLeft} jour{daysLeft > 1 ? 's' : ''}. Renouvelez-la pour garder vos limites ; sinon, vos annonces restent en ligne mais vous ne pourrez plus en ajouter au-delà de la formule Gratuit.</p>}

          {pro && free && !isPaying && (
            <div className="plan-compare">
              <section className={`plan-card ${!isPro ? 'is-current' : ''}`} aria-label="Formule Gratuit">
                <h3>Gratuit</h3>
                <p className="plan-price">0 F</p>
                <PlanFeatures plan={free} />
              </section>
              <section className={`plan-card is-pro ${isPro ? 'is-current' : ''}`} aria-label="Formule Pro">
                <h3><Crown size={16} aria-hidden="true" /> Pro</h3>
                <p className="plan-price">{formatAmount(pro.monthlyPrice, pro.currency)} <span>par mois</span></p>
                <PlanFeatures plan={pro} />
              </section>
            </div>
          )}
          {pending && <p className="settings-callout"><Clock3 size={16} aria-hidden="true" /> Paiement de {formatAmount(pending.amount, pending.currency)} en cours de vérification par l’équipe Gilli.</p>}
          {pro && onPay && !pending && !isPaying && (
            <button type="button" className="primary-button is-block" onClick={() => setIsPaying(true)}><Crown size={16} aria-hidden="true" /> {isPro ? 'Prolonger la formule Pro' : 'Passer à la formule Pro'}</button>
          )}
          {pro && onPay && isPaying && (
            <>
              <label className="field">
                <span className="field-label">Durée</span>
                <select value={months} onChange={(event) => setMonths(Number(event.target.value))}>
                  {durations.map((value) => <option key={value} value={value}>{value} mois — {formatAmount(pro.monthlyPrice * value, pro.currency)}</option>)}
                </select>
              </label>
              <PaymentForm
                amount={pro.monthlyPrice * months}
                currency={pro.currency}
                settings={subscription.payment}
                submitLabel="J’ai payé : déclarer le paiement"
                onSubmit={async (payment) => {
                  await onPay({ kind: 'pro', months, ...payment })
                  setIsPaying(false)
                  refresh()
                }}
              />
              <button type="button" className="text-button is-block" onClick={() => setIsPaying(false)}>Annuler</button>
            </>
          )}
          <PaymentHistory payments={subscription.payments ?? []} />
        </div>
      )}
    </Modal>
  )
}
