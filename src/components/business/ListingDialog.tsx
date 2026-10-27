import { ImagePlus, Megaphone, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { prepareAttachments } from '../../app/attachments'
import { formatAmount, formatQuantity } from '../../app/businessFormat'
import type { Attachment } from '../../domain/types'
import type { ListingSubmission, OwnListing, Product } from '../../services/businessApi'
import { marketplaceApi, type MarketCatalog } from '../../services/marketplaceApi'
import { listingStatusLabels } from '../../app/listingStatus'
import { Modal } from '../Modal'

const MAX_PHOTOS = 5
const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Annonce d’un produit sur la marketplace. Le prix et le stock viennent du produit ; chaque publication
 * ou modification passe par le contrôle automatique (et, en cas de doute, par une vérification humaine).
 */
export function ListingDialog({ product, listing, currency, maxPhotos = MAX_PHOTOS, sponsoredUntil = null, onSponsor, onSubmit, onWithdraw, onClose }: {
  product: Product
  listing: OwnListing | null
  currency: string
  /** Photos permises par la formule du commerce. */
  maxPhotos?: number
  sponsoredUntil?: string | null
  onSponsor?: (listing: OwnListing) => void
  onSubmit: (input: ListingSubmission) => Promise<void>
  onWithdraw?: () => Promise<void>
  onClose: () => void
}) {
  const [catalog, setCatalog] = useState<MarketCatalog | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [title, setTitle] = useState(listing?.title ?? product.name)
  const [category, setCategory] = useState(listing?.category ?? '')
  const [subcategory, setSubcategory] = useState(listing?.subcategory ?? '')
  const [condition, setCondition] = useState(listing?.condition ?? 'new')
  const [attributes, setAttributes] = useState<Record<string, string | boolean>>(() => Object.fromEntries(Object.entries(listing?.attributes ?? {}).map(([key, value]) => [key, typeof value === 'boolean' ? value : String(value)])))
  const [description, setDescription] = useState(listing?.description ?? '')
  const [keptPhotos, setKeptPhotos] = useState(listing?.photos ?? [])
  const [newPhotos, setNewPhotos] = useState<Attachment[]>([])
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    marketplaceApi.catalog().then(setCatalog).catch((caught: unknown) => setCatalogError(caught instanceof Error ? caught.message : 'Catégories indisponibles.'))
  }, [])

  const chosen = catalog?.categories.find((item) => item.id === category)
  const photoCount = keptPhotos.length + newPhotos.length

  const addPhotos = async (files: File[]) => {
    const photos = files.filter((file) => PHOTO_TYPES.includes(file.type === 'image/jpg' ? 'image/jpeg' : file.type)).slice(0, maxPhotos - photoCount)
    if (photos.length < files.length) setError(`Photos JPEG, PNG ou WebP seulement, ${maxPhotos} au plus avec votre formule.`)
    if (photos.length === 0) return
    const { attachments, problems } = await prepareAttachments(photos, [])
    const accepted = attachments.filter((photo) => photo.size <= MAX_PHOTO_BYTES)
    if (problems.length || accepted.length < attachments.length) setError([...problems, accepted.length < attachments.length ? 'Une photo dépasse 2 Mo.' : ''].filter(Boolean).join(' '))
    setNewPhotos((current) => [...current, ...accepted].slice(0, maxPhotos - keptPhotos.length))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (title.trim().length < 3) return setError('Le titre doit faire au moins 3 caractères.')
    if (!chosen) return setError('Choisissez une catégorie.')
    const cleaned: Record<string, string | number | boolean> = {}
    for (const attribute of chosen.attributes ?? []) {
      const value = attributes[attribute.key]
      if (value === undefined || value === '') continue
      if (attribute.type === 'number') {
        const number = Number(String(value).replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(number) || number < 0) return setError(`« ${attribute.label} » doit être un nombre.`)
        cleaned[attribute.key] = number
      } else {
        cleaned[attribute.key] = value
      }
    }
    setIsSaving(true)
    setError('')
    try {
      await onSubmit({
        productId: product.id,
        title: title.trim(),
        description: description.trim(),
        category: chosen.id,
        subcategory: subcategory || null,
        condition,
        attributes: cleaned,
        keepPhotos: keptPhotos.map((photo) => photo.path),
        newPhotos: newPhotos.map((photo) => ({ mimeType: photo.mimeType, data: photo.data ?? '' })),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La publication a échoué.')
      setIsSaving(false)
    }
  }

  return (
    <Modal title={listing ? 'Modifier l’annonce' : 'Publier sur la marketplace'} onClose={onClose} className="business-dialog listing-dialog">
      <form onSubmit={(event) => void submit(event)}>
        {listing && (
          <div className={`listing-state is-${listing.status}`}>
            <strong>{listingStatusLabels[listing.status] ?? listing.status}</strong>
            {listing.reasons.length > 0 && <ul>{listing.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          </div>
        )}
        <p className="dialog-description">
          Prix affiché : <strong>{formatAmount(product.salePrice, currency)}</strong> · en stock : {formatQuantity(product.quantity)} {product.unit}. Ils suivent votre produit : un produit épuisé n’est plus proposé.
        </p>
        {catalogError && <p className="message-error" role="alert">{catalogError}</p>}
        <label className="field"><span className="field-label">Titre de l’annonce</span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">Catégorie</span>
            <select value={category} onChange={(event) => { setCategory(event.target.value); setSubcategory('') }} disabled={!catalog}>
              <option value="">Choisir…</option>
              {catalog?.categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Sous-catégorie</span>
            <select value={subcategory} onChange={(event) => setSubcategory(event.target.value)} disabled={!chosen}>
              <option value="">Choisir…</option>
              {chosen?.subcategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span className="field-label">État</span>
          <select value={condition} onChange={(event) => setCondition(event.target.value)}>
            {Object.entries(catalog?.conditions ?? { new: 'Neuf', used: 'Occasion', refurbished: 'Reconditionné' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {chosen?.attributes && chosen.attributes.length > 0 && (
          <fieldset className="listing-attributes">
            <legend className="field-label">Caractéristiques (facultatif, mais utiles aux clients)</legend>
            {chosen.attributes.map((attribute) => (
              attribute.type === 'boolean' ? (
                <label key={attribute.key} className="checkbox-field">
                  <input type="checkbox" checked={attributes[attribute.key] === true} onChange={(event) => setAttributes((current) => ({ ...current, [attribute.key]: event.target.checked }))} /> {attribute.label}
                </label>
              ) : attribute.type === 'select' ? (
                <label key={attribute.key} className="field">
                  <span className="field-label">{attribute.label}</span>
                  <select value={String(attributes[attribute.key] ?? '')} onChange={(event) => setAttributes((current) => ({ ...current, [attribute.key]: event.target.value }))}>
                    <option value="">—</option>
                    {attribute.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              ) : (
                <label key={attribute.key} className="field">
                  <span className="field-label">{attribute.label}{attribute.unit ? ` (${attribute.unit})` : ''}</span>
                  <input inputMode={attribute.type === 'number' ? 'decimal' : 'text'} value={String(attributes[attribute.key] ?? '')} maxLength={attribute.max && attribute.type === 'text' ? attribute.max : undefined} onChange={(event) => setAttributes((current) => ({ ...current, [attribute.key]: event.target.value }))} />
                </label>
              )
            ))}
          </fieldset>
        )}
        <label className="field"><span className="field-label">Description</span><textarea value={description} maxLength={4000} rows={4} onChange={(event) => setDescription(event.target.value)} placeholder="État, garantie, accessoires fournis, conditions de livraison…" /></label>

        <div className="listing-photos">
          <span className="field-label">Photos ({photoCount}/{maxPhotos})</span>
          <ul>
            {keptPhotos.map((photo) => (
              <li key={photo.path}><img src={photo.url} alt="" /><button type="button" aria-label="Retirer cette photo" onClick={() => setKeptPhotos((current) => current.filter((item) => item.path !== photo.path))}><X size={14} /></button></li>
            ))}
            {newPhotos.map((photo) => (
              <li key={photo.id}><img src={`data:${photo.mimeType};base64,${photo.data}`} alt="" /><button type="button" aria-label={`Retirer ${photo.name}`} onClick={() => setNewPhotos((current) => current.filter((item) => item.id !== photo.id))}><X size={14} /></button></li>
            ))}
            {photoCount < maxPhotos && (
              <li><button type="button" className="listing-add-photo" onClick={() => fileRef.current?.click()} aria-label="Ajouter des photos"><ImagePlus size={20} /></button></li>
            )}
          </ul>
          <input ref={fileRef} type="file" accept={PHOTO_TYPES.join(',')} multiple className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={(event) => { void addPhotos([...(event.target.files ?? [])]); event.target.value = '' }} />
        </div>

        <p className="field-hint">
          Chaque annonce est vérifiée (contrôle automatique, puis par l’équipe Gilli en cas de doute). Les produits interdits par les <a href="/conditions" target="_blank" rel="noopener">conditions d’utilisation</a> (armes, drogues, médicaments, êtres humains…) sont refusés.
        </p>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving || !catalog}>{isSaving ? 'Vérification en cours…' : listing ? 'Enregistrer et soumettre' : 'Publier'}</button>
        {listing && listing.status === 'published' && onSponsor && (
          <button type="button" className="secondary-button is-block" disabled={isSaving} onClick={() => onSponsor(listing)}>
            <Megaphone size={16} aria-hidden="true" /> {sponsoredUntil ? `Sponsorisée jusqu’au ${new Date(sponsoredUntil).toLocaleDateString('fr', { day: 'numeric', month: 'long' })} : prolonger` : 'Sponsoriser l’annonce'}
          </button>
        )}
        {listing && onWithdraw && listing.status !== 'withdrawn' && (
          <button type="button" className="secondary-button is-block" disabled={isSaving} onClick={() => { setIsSaving(true); void onWithdraw().catch((caught: unknown) => { setError(caught instanceof Error ? caught.message : 'Le retrait a échoué.'); setIsSaving(false) }) }}>Retirer l’annonce</button>
        )}
      </form>
    </Modal>
  )
}
