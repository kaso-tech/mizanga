import { useState, type FormEvent } from 'react'
import { suggestedCities } from '../../app/cities'
import type { SellerProfile } from '../../services/businessApi'
import { Modal } from '../Modal'

/** Vitrine du commerce sur la marketplace : nom, ville, contact WhatsApp ou appel, livraison. */
export function SellerProfileDialog({ profile, defaultName, onSave, onClose }: {
  profile: SellerProfile | null
  defaultName: string
  onSave: (input: Omit<SellerProfile, 'businessId' | 'verified'>) => Promise<void>
  onClose: () => void
}) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? defaultName)
  const [city, setCity] = useState(profile?.city ?? '')
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ? `+${profile.whatsapp}` : '')
  const [phone, setPhone] = useState(profile?.phone ? `+${profile.phone}` : '')
  const [deliversEverywhere, setDeliversEverywhere] = useState(profile?.deliversEverywhere ?? false)
  const [deliveryCities, setDeliveryCities] = useState((profile?.deliveryCities ?? []).join(', '))
  const [description, setDescription] = useState(profile?.description ?? '')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (displayName.trim().length < 2) return setError('Indiquez le nom de votre vitrine.')
    if (city.trim().length < 2) return setError('Indiquez votre ville.')
    if (!whatsapp.trim() && !phone.trim()) return setError('Indiquez au moins un numéro WhatsApp ou d’appel.')
    setIsSaving(true)
    setError('')
    try {
      await onSave({
        displayName: displayName.trim(),
        city: city.trim(),
        whatsapp: whatsapp.trim() || null,
        phone: phone.trim() || null,
        deliversEverywhere,
        deliveryCities: deliversEverywhere ? [] : deliveryCities.split(',').map((item) => item.trim()).filter(Boolean),
        description: description.trim() || null,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
      setIsSaving(false)
    }
  }

  return (
    <Modal title="Ma vitrine" onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <p className="dialog-description">Ces informations apparaissent sur la marketplace, avec vos annonces. Les clients vous contactent directement.</p>
        <label className="field"><span className="field-label">Nom de la vitrine</span><input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label className="field">
          <span className="field-label">Ville</span>
          <input value={city} maxLength={60} list="seller-cities" onChange={(event) => setCity(event.target.value)} placeholder="Par exemple : Ouagadougou" />
          <datalist id="seller-cities">{suggestedCities.map((option) => <option key={option} value={option} />)}</datalist>
        </label>
        <div className="field-pair">
          <label className="field"><span className="field-label">Numéro WhatsApp</span><input type="tel" inputMode="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="70 12 34 56" /></label>
          <label className="field"><span className="field-label">Numéro d’appel (facultatif)</span><input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        </div>
        <label className="checkbox-field"><input type="checkbox" checked={deliversEverywhere} onChange={(event) => setDeliversEverywhere(event.target.checked)} /> Je livre dans tout le pays</label>
        {!deliversEverywhere && (
          <label className="field"><span className="field-label">Autres villes où je livre (facultatif, séparées par des virgules)</span><input value={deliveryCities} onChange={(event) => setDeliveryCities(event.target.value)} placeholder="Koudougou, Ziniaré" /></label>
        )}
        <label className="field"><span className="field-label">Présentation (facultatif)</span><textarea value={description} maxLength={500} rows={3} onChange={(event) => setDescription(event.target.value)} /></label>
        <p className="field-hint">Un numéro local reçoit automatiquement l’indicatif de votre pays.</p>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Enregistrer ma vitrine</button>
      </form>
    </Modal>
  )
}
