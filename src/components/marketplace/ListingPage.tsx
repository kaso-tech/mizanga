import { BadgeCheck, ChevronLeft, ChevronRight, Flag, Layers, MapPin, Maximize2, MessageCircle, Phone, Share2, ShieldAlert, Store, Truck } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatPhone, formatPrice, marketplaceApi, reportLabels, whatsappLink, type ListingCard, type ListingDetail, type MarketCatalog, type PublicSeller } from '../../services/marketplaceApi'
import { Modal } from '../Modal'
import { SaveButtons } from './MarketplaceLists'
import { CardSkeletons, ListingCardView } from './MarketCards'
import { detailToSaved, sharePage, useWideLayout, type Notify } from './marketUtils'
import { SellerStatsLine } from './SellerTrust'

/** Boutons WhatsApp (message prêt) et appel. `compact` : libellés courts, pour la barre fixée en bas. */
export function ContactButtons({ seller, listing, compact = false }: { seller: PublicSeller; listing: { title: string; price: number; currency: string }; compact?: boolean }) {
  const phone = seller.phone ?? seller.whatsapp
  return (
    <div className={`market-contact ${compact ? 'is-compact' : ''}`}>
      {seller.whatsapp && (
        <a className="primary-button market-whatsapp" href={whatsappLink(seller.whatsapp, listing)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" /> WhatsApp</a>
      )}
      {phone && (
        <a className="secondary-button" href={`tel:+${phone}`} aria-label={`Appeler ${formatPhone(phone)}`}><Phone size={18} aria-hidden="true" /> {compact ? 'Appeler' : `Appeler ${formatPhone(phone)}`}</a>
      )}
    </div>
  )
}

function ReportDialog({ listingId, reasons, onClose, onDone }: { listingId: string; reasons: string[]; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(reasons[0] ?? 'other')
  const [details, setDetails] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    try {
      await marketplaceApi.report(listingId, reason, details.trim())
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Le signalement a échoué.')
      setIsSaving(false)
    }
  }
  return (
    <Modal title="Signaler l’annonce" onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span className="field-label">Motif</span>
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {reasons.map((value) => <option key={value} value={value}>{reportLabels[value] ?? value}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Précision (facultatif)</span><textarea rows={3} maxLength={500} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
        <p className="field-hint">L’équipe Gilli examine les signalements. Plusieurs signalements suspendent l’annonce en attendant la vérification.</p>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Envoyer le signalement</button>
      </form>
    </Modal>
  )
}

/** Photos en plein écran : on les fait défiler, et un toucher agrandit la photo. */
function PhotoViewer({ photos, title, start, onClose }: { photos: string[]; title: string; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start)
  const [zoomed, setZoomed] = useState(false)
  const go = (delta: number) => {
    setZoomed(false)
    setIndex((current) => (current + delta + photos.length) % photos.length)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(1)
      if (event.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <Modal title={`Photos : ${title}`} onClose={onClose} className="photo-viewer">
      <div className={`photo-viewer-stage ${zoomed ? 'is-zoomed' : ''}`}>
        <img src={photos[index]} alt={`Photo ${index + 1} sur ${photos.length}`} onClick={() => setZoomed((value) => !value)} />
      </div>
      {photos.length > 1 && (
        <div className="photo-viewer-nav">
          <button type="button" className="icon-button" aria-label="Photo précédente" onClick={() => go(-1)}><ChevronLeft size={22} /></button>
          <span aria-live="polite">{index + 1} / {photos.length}</span>
          <button type="button" className="icon-button" aria-label="Photo suivante" onClick={() => go(1)}><ChevronRight size={22} /></button>
        </div>
      )}
      <p className="field-hint">Touchez la photo pour l’agrandir.</p>
    </Modal>
  )
}

/** Galerie qu’on fait glisser, avec points et compteur ; ouvre la visionneuse plein écran. */
function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const [current, setCurrent] = useState(0)
  const [viewer, setViewer] = useState<number | null>(null)
  const track = useRef<HTMLDivElement>(null)
  if (photos.length === 0) return <div className="market-photos is-empty"><Store size={40} aria-hidden="true" /></div>
  const onScroll = () => {
    const element = track.current
    if (element && element.clientWidth) setCurrent(Math.round(element.scrollLeft / element.clientWidth))
  }
  return (
    <div className="market-gallery">
      <div ref={track} className="market-photos" aria-label="Photos" onScroll={onScroll}>
        {photos.map((photo, index) => (
          <button key={photo} type="button" className="market-photo" onClick={() => setViewer(index)} aria-label={`Agrandir la photo ${index + 1}`}>
            <img src={photo} alt={index === 0 ? title : ''} decoding="async" loading={index === 0 ? 'eager' : 'lazy'} />
          </button>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <span className="market-photo-count" aria-hidden="true">{current + 1} / {photos.length}</span>
          <span className="market-photo-dots" aria-hidden="true">{photos.map((photo, index) => <span key={photo} className={index === current ? 'is-active' : ''} />)}</span>
        </>
      )}
      <button type="button" className="icon-button market-photo-expand" aria-label="Voir les photos en plein écran" onClick={() => setViewer(current)}><Maximize2 size={18} /></button>
      {viewer !== null && <PhotoViewer photos={photos} title={title} start={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}

/** Partage de l’annonce : menu de partage du téléphone, sinon lien copié. */
async function share(listing: ListingDetail, onNotify: Notify) {
  try {
    const result = await sharePage({ title: listing.title, text: `${listing.title} — ${formatPrice(listing.price, listing.currency)} sur Gilli`, path: `/marketplace/annonce/${listing.id}` })
    if (result === 'copied') onNotify('Lien de l’annonce copié.', 'success')
  } catch {
    onNotify('Partage impossible sur cet appareil.', 'info')
  }
}

/** Rangée d’annonces liées (similaires, du même vendeur). */
function RelatedRow({ title, items, catalog, onOpen, onNotify }: { title: string; items: ListingCard[] | null; catalog: MarketCatalog | null; onOpen: (id: string) => void; onNotify: Notify }) {
  if (items !== null && items.length === 0) return null
  return (
    <section className="market-shelf" aria-label={title}>
      <div className="market-shelf-head"><h2>{title}</h2></div>
      {items === null ? <CardSkeletons count={3} row /> : (
        <ul className="market-row">{items.slice(0, 10).map((item) => <ListingCardView key={item.id} item={item} catalog={catalog} onOpen={() => onOpen(item.id)} onNotify={onNotify} />)}</ul>
      )}
    </section>
  )
}

/** Page d’une annonce : galerie, prix, caractéristiques, vendeur, contact toujours accessible, annonces liées. */
export function ListingPage({ id, catalog, onSeller, onOpen, onNotify }: { id: string; catalog: MarketCatalog | null; onSeller: (id: string) => void; onOpen: (id: string) => void; onNotify: Notify }) {
  const [listing, setListing] = useState<ListingDetail | null>(null)
  const [error, setError] = useState('')
  const [isReporting, setIsReporting] = useState(false)
  const [similar, setSimilar] = useState<ListingCard[] | null>(null)
  const [sameSeller, setSameSeller] = useState<ListingCard[] | null>(null)
  // Sur téléphone, le contact reste accessible dans une barre fixée en bas ; sur grand écran, à côté du vendeur.
  const wide = useWideLayout()

  useEffect(() => {
    let cancelled = false
    setListing(null)
    setError('')
    marketplaceApi.listing(id).then((found) => { if (!cancelled) setListing(found) }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Annonce indisponible.') })
    return () => { cancelled = true }
  }, [id])
  useEffect(() => {
    if (!listing) return
    document.title = `${listing.title} — Gilli Marketplace`
    let cancelled = false
    setSimilar(null)
    setSameSeller(null)
    marketplaceApi.search({ category: listing.category, subcategory: listing.subcategory ?? undefined, city: listing.seller.city })
      .then((found) => { if (!cancelled) setSimilar(found.items.filter((item) => item.id !== listing.id && item.sellerId !== listing.seller.id)) })
      .catch(() => { if (!cancelled) setSimilar([]) })
    marketplaceApi.seller(listing.seller.id)
      .then((found) => { if (!cancelled) setSameSeller(found.listings.filter((item) => item.id !== listing.id)) })
      .catch(() => { if (!cancelled) setSameSeller([]) })
    return () => { cancelled = true }
  }, [listing])

  if (error) return <p className="message-error" role="alert">{error}</p>
  if (!listing) return <div className="market-listing"><div className="market-photos is-empty skeleton" /><span className="skeleton skeleton-line is-mid" /><span className="skeleton skeleton-line is-short" /></div>
  const category = catalog?.categories.find((item) => item.id === listing.category)
  const subcategory = category?.subcategories.find((item) => item.id === listing.subcategory)
  const attributes = (category?.attributes ?? []).filter((attribute) => listing.attributes[attribute.key] !== undefined)
  const seller = listing.seller

  return (
    <article className="market-listing">
      <div className="market-listing-layout">
        <Gallery photos={listing.photos} title={listing.title} />
        <div className="market-listing-summary">
          <p className="market-breadcrumb">{category?.label ?? listing.category}{subcategory ? ` › ${subcategory.label}` : ''}</p>
          <h1>{listing.title}</h1>
          <div className="market-listing-head">
            <p className="market-listing-price">{formatPrice(listing.price, listing.currency)}</p>
            <span className="market-listing-tools">
              <SaveButtons listing={detailToSaved(listing)} onNotify={onNotify} />
              <button type="button" className="icon-button" aria-label="Partager l’annonce" title="Partager" onClick={() => void share(listing, onNotify)}><Share2 size={18} /></button>
            </span>
          </div>
          <p className="market-pills">
            <span className={`market-pill ${listing.condition === 'new' ? 'is-new' : ''}`}>{catalog?.conditions[listing.condition] ?? listing.condition}</span>
            {seller.verified && <span className="market-pill is-verified"><BadgeCheck size={12} aria-hidden="true" /> Vendeur vérifié</span>}
            {(seller.deliversEverywhere || seller.deliveryCities.length > 0) && <span className="market-pill"><Truck size={12} aria-hidden="true" /> Livraison possible</span>}
          </p>

          <section className="market-seller-box" aria-label="Vendeur">
            <button type="button" className="text-button market-seller-name" onClick={() => onSeller(seller.id)}>
              <span className="market-seller-avatar" aria-hidden="true">{seller.name.slice(0, 1).toUpperCase()}</span>
              {seller.name}{seller.verified && <span className="verified-badge"><BadgeCheck size={14} aria-hidden="true" /> Vendeur vérifié</span>}
            </button>
            <p className="market-card-meta"><MapPin size={13} aria-hidden="true" /> {seller.city}{seller.deliversEverywhere ? ' · livre dans tout le pays' : seller.deliveryCities.length ? ` · livre aussi à ${seller.deliveryCities.join(', ')}` : ''}</p>
            <SellerStatsLine stats={seller.stats} verified={seller.verified} />
            {wide && <ContactButtons seller={seller} listing={listing} />}
            <button type="button" className="text-button" onClick={() => onSeller(seller.id)}><Store size={14} aria-hidden="true" /> Voir la boutique</button>
          </section>
        </div>
      </div>

      {attributes.length > 0 && (
        <section className="market-section" aria-labelledby="listing-specs">
          <h2 id="listing-specs"><Layers size={18} aria-hidden="true" /> Caractéristiques</h2>
          <dl className="market-attributes">
            {attributes.map((attribute) => {
              const value = listing.attributes[attribute.key]
              return <div key={attribute.key}><dt>{attribute.label}</dt><dd>{typeof value === 'boolean' ? (value ? 'Oui' : 'Non') : `${value}${attribute.unit ? ` ${attribute.unit}` : ''}`}</dd></div>
            })}
          </dl>
        </section>
      )}
      {listing.description && (
        <section className="market-section" aria-labelledby="listing-description">
          <h2 id="listing-description">Description</h2>
          <p className="market-description">{listing.description}</p>
        </section>
      )}

      <p className="settings-callout market-safety"><ShieldAlert size={16} aria-hidden="true" /><span>Voyez le produit avant de payer, préférez un lieu public, et méfiez-vous des prix anormalement bas. Gilli met en relation acheteurs et vendeurs : la vente se conclut directement entre vous.</span></p>
      <button type="button" className="text-button market-report" onClick={() => setIsReporting(true)}><Flag size={14} aria-hidden="true" /> Signaler l’annonce</button>

      <RelatedRow title="Du même vendeur" items={sameSeller} catalog={catalog} onOpen={onOpen} onNotify={onNotify} />
      <RelatedRow title="Annonces similaires" items={similar} catalog={catalog} onOpen={onOpen} onNotify={onNotify} />

      {!wide && (
        <div className="market-sticky-contact" role="region" aria-label="Contacter le vendeur">
          <span className="market-sticky-price">{formatPrice(listing.price, listing.currency)}</span>
          <ContactButtons seller={seller} listing={listing} compact />
        </div>
      )}

      {isReporting && (
        <ReportDialog listingId={listing.id} reasons={catalog?.reportReasons ?? Object.keys(reportLabels)} onClose={() => setIsReporting(false)} onDone={() => { setIsReporting(false); onNotify('Merci : votre signalement a été transmis.', 'success') }} />
      )}
    </article>
  )
}
