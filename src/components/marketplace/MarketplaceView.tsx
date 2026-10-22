import { ArrowLeft, BadgeCheck, Flag, MapPin, MessageCircle, Phone, Search, ShieldAlert, Store, Truck } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { suggestedCities } from '../../app/cities'
import { formatPhone, formatPrice, marketplaceApi, reportLabels, whatsappLink, type ListingCard, type ListingDetail, type MarketCatalog, type PublicSeller, type SearchFilters } from '../../services/marketplaceApi'
import { Modal } from '../Modal'

type Route = { page: 'home'; filters: SearchFilters } | { page: 'listing'; id: string } | { page: 'seller'; id: string }

const CITY_KEY = 'gilli.marketplace.city'
const readCity = () => {
  try {
    return localStorage.getItem(CITY_KEY) ?? ''
  } catch {
    return ''
  }
}
const saveCity = (city: string) => {
  try {
    if (city) localStorage.setItem(CITY_KEY, city)
    else localStorage.removeItem(CITY_KEY)
  } catch {
    // Stockage indisponible (navigation privée) : la ville n’est simplement pas retenue.
  }
}

/** Adresse → page de la marketplace (/marketplace, /marketplace/annonce/:id, /marketplace/vendeur/:id). */
function routeFromLocation(): Route {
  const [, , kind, id] = window.location.pathname.split('/')
  if (kind === 'annonce' && id) return { page: 'listing', id }
  if (kind === 'vendeur' && id) return { page: 'seller', id }
  const params = new URLSearchParams(window.location.search)
  const number = (name: string) => (params.get(name) && /^\d+$/.test(params.get(name) as string) ? Number(params.get(name)) : undefined)
  return {
    page: 'home',
    filters: {
      q: params.get('q') ?? undefined,
      category: params.get('category') ?? undefined,
      subcategory: params.get('subcategory') ?? undefined,
      city: params.get('city') ?? readCity() ?? undefined,
      minPrice: number('minPrice'),
      maxPrice: number('maxPrice'),
      condition: params.get('condition') ?? undefined,
    },
  }
}

function pathFor(route: Route) {
  if (route.page === 'listing') return `/marketplace/annonce/${route.id}`
  if (route.page === 'seller') return `/marketplace/vendeur/${route.id}`
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(route.filters)) if (value !== undefined && value !== '' && key !== 'page') params.set(key, String(value))
  const query = params.toString()
  return `/marketplace${query ? `?${query}` : ''}`
}

function ListingCardView({ item, catalog, onOpen }: { item: ListingCard; catalog: MarketCatalog | null; onOpen: () => void }) {
  return (
    <li className="market-card">
      <a href={`/marketplace/annonce/${item.id}`} onClick={(event) => { event.preventDefault(); onOpen() }}>
        <span className="market-card-photo">{item.photo ? <img src={item.photo} alt="" loading="lazy" /> : <Store size={28} aria-hidden="true" />}</span>
        <span className="market-card-body">
          <span className="market-card-title">{item.title}</span>
          <strong className="market-card-price">{formatPrice(item.price, item.currency)}</strong>
          <span className="market-card-meta">
            {catalog?.conditions[item.condition] ?? item.condition} · <MapPin size={12} aria-hidden="true" /> {item.city}
            {!item.sameCity && item.deliversToCity && <> · <Truck size={12} aria-hidden="true" /> livre chez vous</>}
          </span>
          <span className="market-card-seller">{item.sellerName}{item.sellerVerified && <BadgeCheck size={13} aria-label="Vendeur vérifié" />}</span>
        </span>
      </a>
    </li>
  )
}

function HomePage({ filters, catalog, onSearch, onOpen }: { filters: SearchFilters; catalog: MarketCatalog | null; onSearch: (filters: SearchFilters) => void; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState(filters.q ?? '')
  const [city, setCity] = useState(filters.city ?? '')
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice ? String(filters.maxPrice) : '')
  const [results, setResults] = useState<{ total: number; items: ListingCard[] } | null>(null)
  const [error, setError] = useState('')
  const category = catalog?.categories.find((item) => item.id === filters.category)

  useEffect(() => {
    let cancelled = false
    setError('')
    setResults(null)
    marketplaceApi.search(filters)
      .then((found) => { if (!cancelled) setResults(found) })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Recherche impossible.') })
    return () => { cancelled = true }
  }, [filters])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    saveCity(city.trim())
    const price = maxPrice.replace(/\s/g, '')
    onSearch({ ...filters, q: query.trim() || undefined, city: city.trim() || undefined, maxPrice: /^\d+$/.test(price) ? Number(price) : undefined })
  }

  return (
    <>
      <form className="market-search" role="search" onSubmit={submit}>
        <label className="sidebar-search market-search-query">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Que cherchez-vous ?</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Que cherchez-vous ? (téléphone, riz, moto…)" />
        </label>
        <div className="market-search-row">
          <label className="field">
            <span className="visually-hidden">Ma ville</span>
            <input value={city} list="market-cities" onChange={(event) => setCity(event.target.value)} placeholder="Ma ville" aria-label="Ma ville" />
            <datalist id="market-cities">{suggestedCities.map((option) => <option key={option} value={option} />)}</datalist>
          </label>
          <label className="field">
            <span className="visually-hidden">Budget maximum</span>
            <input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Budget max (F)" aria-label="Budget maximum" />
          </label>
          <button type="submit" className="primary-button">Rechercher</button>
        </div>
      </form>

      <nav className="market-categories" aria-label="Catégories">
        <button type="button" className={`saved-prompt-chip ${!filters.category ? 'is-active' : ''}`} aria-pressed={!filters.category} onClick={() => onSearch({ ...filters, category: undefined, subcategory: undefined })}>Toutes</button>
        {catalog?.categories.map((item) => (
          <button key={item.id} type="button" className={`saved-prompt-chip ${filters.category === item.id ? 'is-active' : ''}`} aria-pressed={filters.category === item.id} onClick={() => onSearch({ ...filters, category: item.id, subcategory: undefined })}>{item.label}</button>
        ))}
      </nav>
      {category && (
        <div className="market-filters">
          <label className="field">
            <span className="visually-hidden">Sous-catégorie</span>
            <select aria-label="Sous-catégorie" value={filters.subcategory ?? ''} onChange={(event) => onSearch({ ...filters, subcategory: event.target.value || undefined })}>
              <option value="">Toute la catégorie</option>
              {category.subcategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="visually-hidden">État</span>
            <select aria-label="État" value={filters.condition ?? ''} onChange={(event) => onSearch({ ...filters, condition: event.target.value || undefined })}>
              <option value="">Neuf ou occasion</option>
              {Object.entries(catalog?.conditions ?? {}).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      )}

      {error && <p className="message-error" role="alert">{error}</p>}
      {!results && !error && <div className="page-loading" aria-busy="true" />}
      {results && (
        <>
          <p className="market-count" aria-live="polite">
            {results.total === 0 ? 'Aucune annonce ne correspond pour le moment.' : `${results.total} annonce${results.total > 1 ? 's' : ''}`}
            {filters.city && results.total > 0 && ` · d’abord à ${filters.city}`}
          </p>
          {results.items.length > 0 && (
            <ul className="market-grid" aria-label="Annonces">
              {results.items.map((item) => <ListingCardView key={item.id} item={item} catalog={catalog} onOpen={() => onOpen(item.id)} />)}
            </ul>
          )}
        </>
      )}
    </>
  )
}

function ContactButtons({ seller, listing }: { seller: PublicSeller; listing: { title: string; price: number; currency: string } }) {
  return (
    <div className="market-contact">
      {seller.whatsapp && (
        <a className="primary-button market-whatsapp" href={whatsappLink(seller.whatsapp, listing)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" /> WhatsApp</a>
      )}
      {(seller.phone ?? seller.whatsapp) && (
        <a className="secondary-button" href={`tel:+${seller.phone ?? seller.whatsapp}`}><Phone size={18} aria-hidden="true" /> Appeler {formatPhone((seller.phone ?? seller.whatsapp) as string)}</a>
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

function ListingPage({ id, catalog, onSeller, onNotify }: { id: string; catalog: MarketCatalog | null; onSeller: (id: string) => void; onNotify: (message: string, tone?: 'success' | 'info') => void }) {
  const [listing, setListing] = useState<ListingDetail | null>(null)
  const [error, setError] = useState('')
  const [isReporting, setIsReporting] = useState(false)
  useEffect(() => {
    let cancelled = false
    marketplaceApi.listing(id).then((found) => { if (!cancelled) setListing(found) }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Annonce indisponible.') })
    return () => { cancelled = true }
  }, [id])
  useEffect(() => {
    if (listing) document.title = `${listing.title} — Gilli Marketplace`
  }, [listing])

  if (error) return <p className="message-error" role="alert">{error}</p>
  if (!listing) return <div className="page-loading" aria-busy="true" />
  const category = catalog?.categories.find((item) => item.id === listing.category)
  const attributes = (category?.attributes ?? []).filter((attribute) => listing.attributes[attribute.key] !== undefined)
  return (
    <article className="market-listing">
      {listing.photos.length > 0 ? (
        <div className="market-photos" aria-label="Photos">{listing.photos.map((photo, index) => <img key={photo} src={photo} alt={index === 0 ? listing.title : ''} />)}</div>
      ) : (
        <div className="market-photos is-empty"><Store size={40} aria-hidden="true" /></div>
      )}
      <h1>{listing.title}</h1>
      <p className="market-listing-price">{formatPrice(listing.price, listing.currency)}</p>
      <p className="market-card-meta">{catalog?.conditions[listing.condition] ?? listing.condition} · {category?.label ?? listing.category}{listing.subcategory ? ` › ${category?.subcategories.find((item) => item.id === listing.subcategory)?.label ?? ''}` : ''}</p>

      <section className="market-seller-box" aria-label="Vendeur">
        <button type="button" className="text-button market-seller-name" onClick={() => onSeller(listing.seller.id)}>
          {listing.seller.name}{listing.seller.verified && <span className="verified-badge"><BadgeCheck size={14} aria-hidden="true" /> Vendeur vérifié</span>}
        </button>
        <p className="market-card-meta"><MapPin size={13} aria-hidden="true" /> {listing.seller.city}{listing.seller.deliversEverywhere ? ' · livre dans tout le pays' : listing.seller.deliveryCities.length ? ` · livre aussi à ${listing.seller.deliveryCities.join(', ')}` : ''}</p>
        <ContactButtons seller={listing.seller} listing={listing} />
      </section>

      {attributes.length > 0 && (
        <dl className="market-attributes">
          {attributes.map((attribute) => {
            const value = listing.attributes[attribute.key]
            return <div key={attribute.key}><dt>{attribute.label}</dt><dd>{typeof value === 'boolean' ? (value ? 'Oui' : 'Non') : `${value}${attribute.unit ? ` ${attribute.unit}` : ''}`}</dd></div>
          })}
        </dl>
      )}
      {listing.description && <p className="market-description">{listing.description}</p>}

      <p className="settings-callout market-safety"><ShieldAlert size={16} aria-hidden="true" /><span>Voyez le produit avant de payer, préférez un lieu public, et méfiez-vous des prix anormalement bas. Gilli met en relation acheteurs et vendeurs : la vente se conclut directement entre vous.</span></p>
      <button type="button" className="text-button market-report" onClick={() => setIsReporting(true)}><Flag size={14} aria-hidden="true" /> Signaler l’annonce</button>
      {isReporting && (
        <ReportDialog listingId={listing.id} reasons={catalog?.reportReasons ?? Object.keys(reportLabels)} onClose={() => setIsReporting(false)} onDone={() => { setIsReporting(false); onNotify('Merci : votre signalement a été transmis.', 'success') }} />
      )}
    </article>
  )
}

function SellerPage({ id, catalog, onOpen }: { id: string; catalog: MarketCatalog | null; onOpen: (id: string) => void }) {
  const [page, setPage] = useState<{ seller: PublicSeller; listings: ListingCard[] } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    marketplaceApi.seller(id).then((found) => { if (!cancelled) setPage(found) }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Vendeur introuvable.') })
    return () => { cancelled = true }
  }, [id])
  if (error) return <p className="message-error" role="alert">{error}</p>
  if (!page) return <div className="page-loading" aria-busy="true" />
  return (
    <section className="market-seller-page">
      <h1>{page.seller.name}{page.seller.verified && <span className="verified-badge"><BadgeCheck size={14} aria-hidden="true" /> Vendeur vérifié</span>}</h1>
      <p className="market-card-meta"><MapPin size={13} aria-hidden="true" /> {page.seller.city}{page.seller.deliversEverywhere ? ' · livre dans tout le pays' : page.seller.deliveryCities.length ? ` · livre aussi à ${page.seller.deliveryCities.join(', ')}` : ''}</p>
      {page.seller.description && <p className="market-description">{page.seller.description}</p>}
      <ContactButtons seller={page.seller} listing={{ title: 'vos produits', price: 0, currency: 'XOF' }} />
      <h2>{page.listings.length} annonce{page.listings.length > 1 ? 's' : ''}</h2>
      <ul className="market-grid" aria-label="Annonces du vendeur">
        {page.listings.map((item) => <ListingCardView key={item.id} item={item} catalog={catalog} onOpen={() => onOpen(item.id)} />)}
      </ul>
    </section>
  )
}

/** Marketplace publique : recherche, annonces et vitrines des vendeurs, sans compte. */
export function MarketplaceView({ onNotify }: { onNotify: (message: string, tone?: 'success' | 'info') => void }) {
  const [route, setRoute] = useState<Route>(routeFromLocation)
  const [catalog, setCatalog] = useState<MarketCatalog | null>(null)

  useEffect(() => {
    marketplaceApi.catalog().then(setCatalog).catch(() => setCatalog(null))
    const sync = () => { if (window.location.pathname.startsWith('/marketplace')) setRoute(routeFromLocation()) }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const go = useCallback((next: Route) => {
    const path = pathFor(next)
    if (`${window.location.pathname}${window.location.search}` !== path) window.history.pushState({ gilliMarket: true }, '', path)
    setRoute(next)
    document.querySelector('.content-scroll')?.scrollTo?.({ top: 0 })
  }, [])

  return (
    <div className="page-view market-view">
      {route.page === 'home' ? (
        <>
          <h1>Marketplace</h1>
          <p className="market-intro">Les produits des commerçants de Gilli, près de chez vous. Contactez le vendeur par WhatsApp ou par téléphone.</p>
          <HomePage filters={route.filters} catalog={catalog} onSearch={(filters) => go({ page: 'home', filters })} onOpen={(id) => go({ page: 'listing', id })} />
          <p className="field-hint market-terms">En utilisant la marketplace, vous acceptez les <a href="/conditions">conditions d’utilisation</a>.</p>
        </>
      ) : (
        <>
          <button type="button" className="text-button market-back" onClick={() => ((window.history.state as { gilliMarket?: boolean } | null)?.gilliMarket ? window.history.back() : go({ page: 'home', filters: { city: readCity() || undefined } }))}><ArrowLeft size={16} aria-hidden="true" /> Retour</button>
          {route.page === 'listing'
            ? <ListingPage id={route.id} catalog={catalog} onSeller={(id) => go({ page: 'seller', id })} onNotify={onNotify} />
            : <SellerPage id={route.id} catalog={catalog} onOpen={(id) => go({ page: 'listing', id })} />}
        </>
      )}
    </div>
  )
}
