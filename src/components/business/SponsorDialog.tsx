import { Megaphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatAmount } from '../../app/businessFormat'
import type { OwnListing, PaymentRequest, Subscription } from '../../services/businessApi'
import { Modal } from '../Modal'
import { PaymentForm } from './PaymentForm'

/**
 * Sponsorisation d’une annonce en ligne : elle apparaît, marquée « Sponsorisé », en tête des recherches
 * qu’elle satisfait, pendant la durée choisie. Le classement des résultats ne change pas.
 */
export function SponsorDialog({ listing, load, onPay, onClose }: { listing: OwnListing; load: () => Promise<Subscription>; onPay: (payment: PaymentRequest) => Promise<void>; onClose: () => void }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [error, setError] = useState('')
  const [offerId, setOfferId] = useState('')
  useEffect(() => {
    load().then((loaded) => {
      setSubscription(loaded)
      setOfferId((current) => current || loaded.offers?.[1]?.id || loaded.offers?.[0]?.id || '')
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Offres indisponibles.'))
  }, [load])
  const offer = subscription?.offers?.find((item) => item.id === offerId)
  const active = subscription?.sponsorships?.find((item) => item.listingId === listing.id)
  const pending = subscription?.payments?.find((payment) => payment.kind === 'sponsor' && payment.listingId === listing.id && payment.status === 'pending')

  return (
    <Modal title="Sponsoriser l’annonce" onClose={onClose} className="business-dialog">
      {error && <p className="message-error" role="alert">{error}</p>}
      {!subscription && !error && <div className="page-loading" aria-busy="true" />}
      {subscription && (
        <div className="subscription-details">
          <p className="field-hint"><Megaphone size={14} aria-hidden="true" /> « {listing.title} » apparaîtra en tête des recherches qui lui correspondent, avec la mention « Sponsorisé ».</p>
          {active && <p className="settings-callout">Sponsorisée jusqu’au {new Date(active.endsAt).toLocaleDateString('fr', { dateStyle: 'long' })}. Un nouvel achat prolonge cette période.</p>}
          {pending ? (
            <p className="settings-callout">Paiement de {formatAmount(pending.amount, pending.currency)} en cours de vérification par l’équipe Gilli.</p>
          ) : (subscription.offers ?? []).length === 0 ? (
            <p className="settings-callout">La sponsorisation n’est pas disponible pour le moment.</p>
          ) : (
            <>
              <fieldset className="sponsor-offers">
                <legend className="field-label">Durée</legend>
                {(subscription.offers ?? []).map((item) => (
                  <label key={item.id} className={offerId === item.id ? 'is-selected' : ''}>
                    <input type="radio" name="sponsor-offer" checked={offerId === item.id} onChange={() => setOfferId(item.id)} />
                    <span>{item.days} jours</span>
                    <strong>{formatAmount(item.price, item.currency)}</strong>
                  </label>
                ))}
              </fieldset>
              {offer && (
                <PaymentForm
                  key={offer.id}
                  amount={offer.price}
                  currency={offer.currency}
                  settings={subscription.payment}
                  submitLabel="J’ai payé : déclarer le paiement"
                  onSubmit={async (payment) => {
                    await onPay({ kind: 'sponsor', offerId: offer.id, listingId: listing.id, ...payment })
                    onClose()
                  }}
                />
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
