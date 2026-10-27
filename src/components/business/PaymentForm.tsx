import { Smartphone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { formatAmount } from '../../app/businessFormat'
import type { PaymentMethod, PaymentSettings } from '../../services/businessApi'
import { formatPhone } from '../../services/marketplaceApi'

const methodLabels: Record<PaymentMethod, string> = { orange_money: 'Orange Money', moov_money: 'Moov Money' }

/**
 * Paiement par Mobile Money, hors de Gilli : le commerçant envoie la somme au numéro de Gilli, puis
 * déclare le numéro qui a payé et la référence reçue par SMS. L’équipe vérifie et confirme.
 */
export function PaymentForm({ amount, currency, settings, submitLabel, onSubmit }: {
  amount: number
  currency: string
  settings: PaymentSettings | null | undefined
  submitLabel: string
  onSubmit: (payment: { method: PaymentMethod; payerPhone: string; reference: string }) => Promise<void>
}) {
  const methods = (['orange_money', 'moov_money'] as const).filter((method) => (method === 'orange_money' ? settings?.orangeMoney : settings?.moovMoney))
  const [method, setMethod] = useState<PaymentMethod | null>(methods[0] ?? null)
  const [payerPhone, setPayerPhone] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  if (!settings || methods.length === 0 || !method) {
    return <p className="settings-callout">Le paiement par Mobile Money n’est pas encore ouvert. Revenez bientôt.</p>
  }
  const number = method === 'orange_money' ? settings.orangeMoney : settings.moovMoney
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setIsSaving(true)
    try {
      await onSubmit({ method, payerPhone: payerPhone.trim(), reference: reference.trim() })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Le paiement n’a pas pu être déclaré.')
      setIsSaving(false)
    }
  }
  return (
    <form className="payment-form" onSubmit={(event) => void submit(event)}>
      {methods.length > 1 && (
        <div className="segmented" role="radiogroup" aria-label="Moyen de paiement">
          {methods.map((option) => (
            <label key={option} className={method === option ? 'is-selected' : ''}>
              <input type="radio" name="payment-method" checked={method === option} onChange={() => setMethod(option)} />
              {methodLabels[option]}
            </label>
          ))}
        </div>
      )}
      <ol className="payment-steps" aria-label="Étapes du paiement">
        <li>Envoyez <strong>{formatAmount(amount, currency)}</strong> par {methodLabels[method]} au <strong>{formatPhone(number as string)}</strong>{settings.accountName && <> ({settings.accountName})</>}.</li>
        <li>Notez la référence de la transaction reçue par SMS.</li>
        <li>Indiquez-la ci-dessous : l’équipe Gilli vérifie le paiement et active votre achat, en général dans la journée.</li>
      </ol>
      {settings.instructions && <p className="field-hint">{settings.instructions}</p>}
      <label className="field">
        <span className="field-label">Numéro qui a payé</span>
        <input inputMode="tel" autoComplete="tel" value={payerPhone} onChange={(event) => setPayerPhone(event.target.value)} placeholder="70 12 34 56" required />
      </label>
      <label className="field">
        <span className="field-label">Référence de la transaction (SMS)</span>
        <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Par exemple : PP251027.1234.A12345" required minLength={4} maxLength={60} />
      </label>
      {error && <p className="message-error" role="alert">{error}</p>}
      <button type="submit" className="primary-button is-block" disabled={isSaving}><Smartphone size={16} aria-hidden="true" /> {submitLabel}</button>
    </form>
  )
}
