import { Check, X } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatPhone, formatPrice, marketplaceApi, type AdminPayment, type Pricing } from '../../services/marketplaceApi'

type Notify = (message: string, tone?: 'success' | 'info') => void

const statuses = [
  { id: 'pending', label: 'À vérifier' },
  { id: 'confirmed', label: 'Confirmés' },
  { id: 'rejected', label: 'Refusés' },
]
const methodLabels = { orange_money: 'Orange Money', moov_money: 'Moov Money' }

function PaymentCard({ payment, onDecide }: { payment: AdminPayment; onDecide: (status: 'confirmed' | 'rejected', note: string) => Promise<void> }) {
  const [note, setNote] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const act = async (status: 'confirmed' | 'rejected') => {
    setIsBusy(true)
    try {
      await onDecide(status, note)
    } finally {
      setIsBusy(false)
    }
  }
  return (
    <li className="moderation-card">
      <p className="moderation-title"><strong>{formatPrice(payment.amount, payment.currency)}</strong> · {payment.kind === 'pro' ? `Formule Pro, ${payment.months} mois` : `Sponsorisation ${payment.days} jours`}</p>
      <p className="setting-description">
        {payment.businessName}{payment.listingTitle && <> · annonce « {payment.listingTitle} »</>}<br />
        {methodLabels[payment.method]} depuis le {formatPhone(payment.payerPhone)} · référence <strong>{payment.reference}</strong><br />
        Déclaré le {new Date(payment.createdAt).toLocaleString('fr', { dateStyle: 'short', timeStyle: 'short' })}
        {payment.decidedAt && <> · traité le {new Date(payment.decidedAt).toLocaleString('fr', { dateStyle: 'short', timeStyle: 'short' })}</>}
      </p>
      {payment.adminNote && <p className="setting-description">Motif : {payment.adminNote}</p>}
      {payment.status === 'pending' && (
        <>
          <p className="field-hint">Vérifiez sur le compte Mobile Money que ce montant a bien été reçu avec cette référence avant de confirmer.</p>
          <label className="field">
            <span className="field-label">Motif communiqué au commerçant (refus)</span>
            <input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="Par exemple : aucun paiement reçu avec cette référence" />
          </label>
          <div className="moderation-actions">
            <button type="button" className="primary-button" disabled={isBusy} onClick={() => void act('confirmed')}><Check size={14} aria-hidden="true" /> Confirmer le paiement</button>
            <button type="button" className="secondary-button danger-text" disabled={isBusy} onClick={() => void act('rejected')}><X size={14} aria-hidden="true" /> Refuser</button>
          </div>
        </>
      )}
    </li>
  )
}

function PaymentsList({ onNotify }: { onNotify: Notify }) {
  const [status, setStatus] = useState('pending')
  const [items, setItems] = useState<AdminPayment[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async (current: string) => {
    setError('')
    setItems(null)
    try {
      setItems(await marketplaceApi.paymentQueue(current))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Paiements indisponibles.')
    }
  }, [])
  useEffect(() => { void load(status) }, [load, status])
  return (
    <>
      <div className="segmented moderation-statuses" role="radiogroup" aria-label="Paiements">
        {statuses.map((option) => (
          <label key={option.id} className={status === option.id ? 'is-selected' : ''}>
            <input type="radio" name="payment-status" checked={status === option.id} onChange={() => setStatus(option.id)} />
            {option.label}
          </label>
        ))}
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!items && !error && <div className="page-loading" aria-busy="true" />}
      {items && items.length === 0 && <p className="setting-description">Aucun paiement dans cette liste.</p>}
      {items && items.length > 0 && (
        <ul className="moderation-list" aria-label="Paiements déclarés">
          {items.map((payment) => (
            <PaymentCard key={payment.id} payment={payment} onDecide={async (decision, note) => {
              try {
                await marketplaceApi.decidePayment(payment.id, decision, note)
                onNotify(decision === 'confirmed' ? 'Paiement confirmé : l’achat est activé.' : 'Paiement refusé.', 'success')
                await load(status)
              } catch (caught) {
                onNotify(caught instanceof Error ? caught.message : 'L’action a échoué.', 'info')
              }
            }} />
          ))}
        </ul>
      )}
    </>
  )
}

/** Champ numérique des tarifs. */
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input inputMode="numeric" value={String(value)} onChange={(event) => onChange(Number(event.target.value.replace(/\D/g, '') || 0))} />
    </label>
  )
}

function PricingForm({ onNotify }: { onNotify: Notify }) {
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  useEffect(() => {
    marketplaceApi.pricing().then(setPricing).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Tarifs indisponibles.'))
  }, [])
  if (error && !pricing) return <p className="message-error" role="alert">{error}</p>
  if (!pricing) return <div className="page-loading" aria-busy="true" />
  const setPlan = (id: string, key: string, value: number) => setPricing({ ...pricing, plans: pricing.plans.map((plan) => (plan.id === id ? { ...plan, [key]: value } : plan)) })
  const setOffer = (id: string, changes: Partial<Pricing['offers'][number]>) => setPricing({ ...pricing, offers: pricing.offers.map((offer) => (offer.id === id ? { ...offer, ...changes } : offer)) })
  const setSettings = (changes: Partial<Pricing['settings']>) => setPricing({ ...pricing, settings: { ...pricing.settings, ...changes } })
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      setPricing(await marketplaceApi.savePricing(pricing))
      onNotify('Tarifs enregistrés.', 'success')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Les tarifs n’ont pas pu être enregistrés.')
    } finally {
      setIsSaving(false)
    }
  }
  return (
    <form className="pricing-form" aria-label="Tarifs" onSubmit={(event) => void submit(event)}>
      {pricing.plans.map((plan) => (
        <fieldset key={plan.id}>
          <legend>Formule {plan.name}</legend>
          {plan.id === 'pro' && <NumberField label="Prix par mois (F CFA)" value={plan.monthlyPrice} onChange={(value) => setPlan(plan.id, 'monthlyPrice', value)} />}
          <NumberField label="Annonces en ligne" value={plan.maxListings} onChange={(value) => setPlan(plan.id, 'maxListings', value)} />
          <NumberField label="Photos par annonce (1 à 5)" value={plan.maxPhotos} onChange={(value) => setPlan(plan.id, 'maxPhotos', value)} />
          <NumberField label="Questions par jour à l’assistant" value={plan.dailyAiRequests} onChange={(value) => setPlan(plan.id, 'dailyAiRequests', value)} />
          <NumberField label="Commerces" value={plan.maxBusinesses} onChange={(value) => setPlan(plan.id, 'maxBusinesses', value)} />
        </fieldset>
      ))}
      <fieldset>
        <legend>Sponsorisation</legend>
        {pricing.offers.map((offer) => (
          <div key={offer.id} className="field">
            <NumberField label={`${offer.days} jours (F CFA)`} value={offer.price} onChange={(value) => setOffer(offer.id, { price: value })} />
            <label className="checkbox-field"><input type="checkbox" checked={offer.active} onChange={(event) => setOffer(offer.id, { active: event.target.checked })} /> Proposée</label>
          </div>
        ))}
      </fieldset>
      <fieldset>
        <legend>Numéros de paiement</legend>
        <label className="field"><span className="field-label">Titulaire des comptes</span><input value={pricing.settings.accountName} maxLength={80} onChange={(event) => setSettings({ accountName: event.target.value })} placeholder="KasoTech" /></label>
        <label className="field"><span className="field-label">Orange Money (indicatif compris)</span><input inputMode="tel" value={pricing.settings.orangeMoney ?? ''} onChange={(event) => setSettings({ orangeMoney: event.target.value })} placeholder="22670000000" /></label>
        <label className="field"><span className="field-label">Moov Money (indicatif compris)</span><input inputMode="tel" value={pricing.settings.moovMoney ?? ''} onChange={(event) => setSettings({ moovMoney: event.target.value })} placeholder="22660000000" /></label>
        <label className="field"><span className="field-label">Consigne affichée aux commerçants</span><input value={pricing.settings.instructions} maxLength={500} onChange={(event) => setSettings({ instructions: event.target.value })} /></label>
      </fieldset>
      <p className="field-hint">Sans numéro de paiement, les commerçants voient « Le paiement n’est pas encore ouvert ». Un changement de prix ne touche pas les paiements déjà déclarés.</p>
      {error && <p className="message-error" role="alert">{error}</p>}
      <button type="submit" className="primary-button" disabled={isSaving}>Enregistrer les tarifs</button>
    </form>
  )
}

/** Console : paiements déclarés par les commerçants (formule Pro, sponsorisation) et tarifs. */
export function PaymentsPanel({ onNotify }: { onNotify: Notify }) {
  const [tab, setTab] = useState<'payments' | 'pricing'>('payments')
  return (
    <div className="moderation-panel">
      <div className="market-tabs" role="tablist" aria-label="Paiements et tarifs">
        <button type="button" role="tab" aria-selected={tab === 'payments'} className={`market-tab ${tab === 'payments' ? 'is-active' : ''}`} onClick={() => setTab('payments')}>Paiements</button>
        <button type="button" role="tab" aria-selected={tab === 'pricing'} className={`market-tab ${tab === 'pricing' ? 'is-active' : ''}`} onClick={() => setTab('pricing')}>Tarifs</button>
      </div>
      {tab === 'payments' ? <PaymentsList onNotify={onNotify} /> : <PricingForm onNotify={onNotify} />}
    </div>
  )
}
