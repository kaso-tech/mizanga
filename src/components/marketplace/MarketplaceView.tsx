import { ArrowLeft, BadgeCheck, Bell, Flag, MapPin, MessageCircle, Phone, Search, ShieldAlert, SlidersHorizontal, Store, Truck } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { suggestedCities } from '../../app/cities'
import { addAlert, alertFilters, compareStore, describeFilters, type ListingLike } from '../../app/marketSaved'
import { formatPhone, formatPrice, marketplaceApi, reportLabels, searchQuery, whatsappLink, type ListingCard, type ListingDetail, type MarketCatalog, type PublicSeller, type SearchFilters, type SellerReview } from '../../services/marketplaceApi'
import { Modal } from '../Modal'
import { RatingBadge, ReviewsSection, SellerStatsLine } from './SellerTrust'
import { AlertsPage, CompareBar, ComparePage, FavoritesPage, MarketTabs, SaveButtons, type MarketAccount } from './MarketplaceLists'

type Route =
  | { page: 'home'; filters: SearchFilters; newSince?: string }
  | { page: 'listing'; id: string }
  | { page: 'seller'; id: string }
  | { page: 'favorites' }
  | { page: 'alerts' }
  | { page: 'compare'; ids: string[] }

const SORTS: Record<string, string> = { relevance: 'Pertinence', price_asc: 'Prix croissant', price_desc: 'Prix décroissant', recent: 'Plus récentes' }

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

/** Adresse → page de la marketplace (/marketplace, /annonce/:id, /vendeur/:id, /favoris, /alertes, /comparer). */
function routeFromLocation(): Route {
  const [, , kind, id] = window.location.pathname.split('/')
  const params = new URLSearchParams(window.location.search)
  if (kind === 'annonce' && id) return { page: 'listing', id }
  if (kind === 'vendeur' && id) return { page: 'seller', id }
  if (kind === 'favoris') return { page: 'favorites' }
  if (kind === 'alertes') return { page: 'alerts' }
  if (kind === 'comparer') return { page: 'compare', ids: (params.get('ids') ?? '').split(',').filter((value) => /^[\w-]{1,64}$/.test(value)).slice(0, 3) }
  const number = (name: string) => (params.get(name) && /^\d+$/.test(params.get(name) as string) ? Number(params.get(name)) : undefined)
  const attributes: Record<string, string> = {}
  for (const [key, value] of params) if (key.startsWith('a_') && value) attributes[key.slice(2)] = value
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
      sort: params.get('sort') ?? undefined,
      verified: params.get('verified') === '1' ? '1' : undefined,
      attributes: Object.keys(attributes).length ? attributes : undefined,
    },
  }
}

function pathFor(route: Route) {
  if (route.page === 'listing') return `/marketplace/annonce/${route.id}`
  if (route.page === 'seller') return `/marketplace/vendeur/${route.id}`
  if (route.page === 'favorites') return '/marketplace/favoris'
  if (route.page === 'alerts') return '/marketplace/alertes'
  if (route.page === 'compare') return `/marketplace/comparer?ids=${route.ids.join(',')}`
  const params = searchQuery({ ...route.filters, page: undefined, publishedAfter: undefined })
  if (params.get('sort') === 'relevance') params.delete('sort')
  const query = params.toString()
  return `/marketplace${query ? `?${query}` : ''}`
}

const cardToSaved = (item: ListingCard): ListingLike => ({ id: item.id, title: item.title, price: item.price, currency: item.currency, photo: item.photo, city: item.city, sellerName: item.sellerName, sellerVerified: item.sellerVerified, condition: item.condition })
const detailToSaved = (item: ListingDetail): ListingLike => ({ id: item.id, title: item.title, price: item.price, currency: item.currency, photo: item.photos[0] ?? null, city: item.seller.city, sellerName: item.seller.name, sellerVerified: item.seller.verified, condition: item.condition })

/** Nombre de filtres actifs dans le panneau « Filtres » (prix, état, vendeurs vérifiés, caractéristiques). */
const countFilters = (filters: SearchFilters) => [filters.minPrice, filters.condition, filters.verified].filter((value) => value !== undefined).length + Object.keys(filters.attributes ?? {}).length

function ListingCardView({ item, catalog, onOpen, onNotify, isNew = false, sponsored = false }: { item: ListingCard; catalog: MarketCatalog | null; onOpen: () => void; onNotify?: (message: string, tone?: 'success' | 'info') => void; isNew?: boolean; sponsored?: boolean }) {
  return (
    <li className="market-card">
      <a href={`/marketplace/annonce/${item.id}`} onClick={(event) => { event.preventDefault(); onOpen() }}>
        <span className="market-card-photo">{item.photo ? <img src={item.photo} alt="" loading="lazy" /> : <Store size={28} aria-hidden="true" />}{isNew && <span className="market-new">Nouveau</span>}{sponsored && <span className="market-sponsored">Sponsorisé</span>}</span>
        <span className="market-card-body">
          <span className="market-card-title">{item.title}</span>
          <strong className="market-card-price">{formatPrice(item.price, item.currency)}</strong>
          <span className="market-card-meta">
            {catalog?.conditions[item.condition] ?? item.condition} · <MapPin size={12} aria-hidden="true" /> {item.city}
            {!item.sameCity && item.deliversToCity && <> · <Truck size={12} aria-hidden="true" /> livre chez vous</>}
          </span>
          <span className="market-card-seller">{item.sellerName}{item.sellerVerified && <BadgeCheck size={13} aria-label="Vendeur vérifié" />}</span>
          <RatingBadge rating={item.sellerRating} count={item.sellerReviews} />
        </span>
      </a>
      <SaveButtons listing={cardToSaved(item)} onNotify={onNotify} compact />
    </li>
  )
}

/** Panneau « Filtres » : prix, état, vendeurs vérifiés et caractéristiques de la catégorie choisie. */
function FiltersPanel({ filters, catalog, onApply }: { filters: SearchFilters; catalog: MarketCatalog | null; onApply: (filters: SearchFilters) => void }) {
  const category = catalog?.categories.find((item) => item.id === filters.category)
  const [minPrice, setMinPrice] = useState(filters.minPrice !== undefined ? String(filters.minPrice) : '')
  const [condition, setCondition] = useState(filters.condition ?? '')
  const [verified, setVerified] = useState(filters.verified === '1')
  const [attributes, setAttributes] = useState<Record<string, string>>(filters.attributes ?? {})
  const setAttribute = (key: string, value: string) => setAttributes((current) => {
    const next = { ...current }
    if (value) next[key] = value
    else delete next[key]
    return next
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const price = minPrice.replace(/\s/g, '')
    const kept = Object.fromEntries(Object.entries(attributes).filter(([key]) => category?.attributes?.some((attribute) => attribute.key === key)))
    onApply({ ...filters, minPrice: /^\d+$/.test(price) ? Number(price) : undefined, condition: condition || undefined, verified: verified ? '1' : undefined, attributes: Object.keys(kept).length ? kept : undefined })
  }
  return (
    <form className="market-filters-panel" aria-label="Filtres" onSubmit={submit}>
      <label className="field"><span className="field-label">Prix minimum (F)</span><input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></label>
      <label className="field">
        <span className="field-label">État</span>
        <select value={condition} onChange={(event) => setCondition(event.target.value)}>
          <option value="">Neuf ou occasion</option>
          {Object.entries(catalog?.conditions ?? {}).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="checkbox-field"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /> Vendeurs vérifiés seulement</label>
      {category?.attributes?.length ? (
        <fieldset className="market-filter-attributes">
          <legend>{category.label}</legend>
          {category.attributes.map((attribute) => {
            const value = attributes[attribute.key] ?? ''
            if (attribute.type === 'boolean') return <label key={attribute.key} className="checkbox-field"><input type="checkbox" checked={value === '1'} onChange={(event) => setAttribute(attribute.key, event.target.checked ? '1' : '')} /> {attribute.label}</label>
            if (attribute.type === 'select') {
              return (
                <label key={attribute.key} className="field">
                  <span className="field-label">{attribute.label}</span>
                  <select value={value} onChange={(event) => setAttribute(attribute.key, event.target.value)}>
                    <option value="">Peu importe</option>
                    {attribute.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              )
            }
            return (
              <label key={attribute.key} className="field">
                <span className="field-label">{attribute.type === 'number' ? `${attribute.label} minimum${attribute.unit ? ` (${attribute.unit})` : ''}` : attribute.label}</span>
                <input inputMode={attribute.type === 'number' ? 'decimal' : undefined} value={value} onChange={(event) => setAttribute(attribute.key, event.target.value.trim())} />
              </label>
            )
          })}
        </fieldset>
      ) : (
        <p className="field-hint">Choisissez une catégorie pour filtrer par caractéristiques (mémoire, stockage, réseau…).</p>
      )}
      <div className="market-filters-actions">
        <button type="button" className="secondary-button" onClick={() => onApply({ ...filters, minPrice: undefined, condition: undefined, verified: undefined, attributes: undefined })}>Effacer les filtres</button>
        <button type="submit" className="primary-button">Appliquer</button>
      </div>
    </form>
  )
}

function HomePage({ filters, newSince, catalog, onSearch, onOpen, onNotify }: { filters: SearchFilters; newSince?: string; catalog: MarketCatalog | null; onSearch: (filters: SearchFilters) => void; onOpen: (id: string) => void; onNotify: (message: string, tone?: 'success' | 'info') => void }) {
  const [query, setQuery] = useState(filters.q ?? '')
  const [city, setCity] = useState(filters.city ?? '')
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice ? String(filters.maxPrice) : '')
  const [results, setResults] = useState<{ total: number; items: ListingCard[]; sponsored?: ListingCard[] } | null>(null)
  const [page, setPage] = useState(1)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [error, setError] = useState('')
  const category = catalog?.categories.find((item) => item.id === filters.category)
  const activeFilters = countFilters(filters)

  useEffect(() => {
    let cancelled = false
    setError('')
    setResults(null)
    setPage(1)
    marketplaceApi.search(filters)
      .then((found) => { if (!cancelled) setResults(found) })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Recherche impossible.') })
    return () => { cancelled = true }
  }, [filters])

  const loadMore = async () => {
    setIsLoadingMore(true)
    try {
      const next = await marketplaceApi.search({ ...filters, page: page + 1 })
      setResults((current) => current && { ...current, total: next.total, items: [...current.items, ...next.items.filter((item) => !current.items.some((known) => known.id === item.id))] })
      setPage(page + 1)
    } catch (caught) {
      onNotify(caught instanceof Error ? caught.message : 'Chargement impossible.', 'info')
    } finally {
      setIsLoadingMore(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    saveCity(city.trim())
    const price = maxPrice.replace(/\s/g, '')
    onSearch({ ...filters, q: query.trim() || undefined, city: city.trim() || undefined, maxPrice: /^\d+$/.test(price) ? Number(price) : undefined })
  }

  const createAlert = () => {
    const result = addAlert(filters, describeFilters(filters, category?.label))
    onNotify(result === 'added' ? 'Alerte créée : les nouvelles annonces vous seront signalées dans l’onglet Alertes.' : result === 'exists' ? 'Vous suivez déjà cette recherche.' : 'Vous avez déjà 10 alertes : supprimez-en une d’abord.', result === 'added' ? 'success' : 'info')
  }
  const hasCriteria = Boolean(filters.q || filters.category || filters.maxPrice !== undefined || activeFilters > 0)

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
        <button type="button" className={`saved-prompt-chip ${!filters.category ? 'is-active' : ''}`} aria-pressed={!filters.category} onClick={() => onSearch({ ...filters, category: undefined, subcategory: undefined, attributes: undefined })}>Toutes</button>
        {catalog?.categories.map((item) => (
          <button key={item.id} type="button" className={`saved-prompt-chip ${filters.category === item.id ? 'is-active' : ''}`} aria-pressed={filters.category === item.id} onClick={() => onSearch({ ...filters, category: item.id, subcategory: undefined, attributes: undefined })}>{item.label}</button>
        ))}
      </nav>

      <div className="market-toolbar">
        {category && (
          <label className="field">
            <span className="visually-hidden">Sous-catégorie</span>
            <select aria-label="Sous-catégorie" value={filters.subcategory ?? ''} onChange={(event) => onSearch({ ...filters, subcategory: event.target.value || undefined })}>
              <option value="">Toute la catégorie</option>
              {category.subcategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span className="visually-hidden">Trier</span>
          <select aria-label="Trier" value={filters.sort ?? 'relevance'} onChange={(event) => onSearch({ ...filters, sort: event.target.value === 'relevance' ? undefined : event.target.value })}>
            {Object.entries(SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="button" className={`secondary-button ${activeFilters ? 'is-active' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters((open) => !open)}>
          <SlidersHorizontal size={16} aria-hidden="true" /> Filtres{activeFilters ? ` (${activeFilters})` : ''}
        </button>
      </div>
      {showFilters && <FiltersPanel key={JSON.stringify(filters)} filters={filters} catalog={catalog} onApply={(next) => { setShowFilters(false); onSearch(next) }} />}

      {error && <p className="message-error" role="alert">{error}</p>}
      {!results && !error && <div className="page-loading" aria-busy="true" />}
      {results && (
        <>
          <div className="market-count-row">
            <p className="market-count" aria-live="polite">
              {results.total === 0 ? 'Aucune annonce ne correspond pour le moment.' : `${results.total} annonce${results.total > 1 ? 's' : ''}`}
              {filters.city && results.total > 0 && (filters.sort ?? 'relevance') === 'relevance' && ` · d’abord à ${filters.city}`}
            </p>
            {hasCriteria && <button type="button" className="text-button" onClick={createAlert}><Bell size={14} aria-hidden="true" /> Créer une alerte</button>}
          </div>
          {(results.sponsored ?? []).length > 0 && (
            <section className="market-sponsored-block" aria-label="Annonces sponsorisées">
              <p className="market-sponsored-note">Sponsorisé · les vendeurs paient pour cette mise en avant ; le classement des résultats n’en tient pas compte.</p>
              <ul className="market-grid">
                {(results.sponsored ?? []).map((item) => <ListingCardView key={item.id} item={item} catalog={catalog} onOpen={() => onOpen(item.id)} onNotify={onNotify} sponsored />)}
              </ul>
            </section>
          )}
          {results.items.length > 0 && (
            <ul className="market-grid" aria-label="Annonces">
              {results.items.map((item) => <ListingCardView key={item.id} item={item} catalog={catalog} onOpen={() => onOpen(item.id)} onNotify={onNotify} isNew={Boolean(newSince && Date.parse(item.publishedAt) > Date.parse(newSince))} />)}
            </ul>
          )}
          {results.items.length < results.total && (
            <button type="button" className="secondary-button is-block market-more" disabled={isLoadingMore} onClick={() => void loadMore()}>
              {isLoadingMore ? 'Chargement…' : `Voir plus d’annonces (${results.total - results.items.length} de plus)`}
            </button>
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
      <div className="market-listing-head">
        <p className="market-listing-price">{formatPrice(listing.price, listing.currency)}</p>
        <SaveButtons listing={detailToSaved(listing)} onNotify={onNotify} />
      </div>
      <p className="market-card-meta">{catalog?.conditions[listing.condition] ?? listing.condition} · {category?.label ?? listing.category}{listing.subcategory ? ` › ${category?.subcategories.find((item) => item.id === listing.subcategory)?.label ?? ''}` : ''}</p>

      <section className="market-seller-box" aria-label="Vendeur">
        <button type="button" className="text-button market-seller-name" onClick={() => onSeller(listing.seller.id)}>
          {listing.seller.name}{listing.seller.verified && <span className="verified-badge"><BadgeCheck size={14} aria-hidden="true" /> Vendeur vérifié</span>}
        </button>
        <p className="market-card-meta"><MapPin size={13} aria-hidden="true" /> {listing.seller.city}{listing.seller.deliversEverywhere ? ' · livre dans tout le pays' : listing.seller.deliveryCities.length ? ` · livre aussi à ${listing.seller.deliveryCities.join(', ')}` : ''}</p>
        <SellerStatsLine stats={listing.seller.stats} verified={listing.seller.verified} />
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

function SellerPage({ id, catalog, onOpen, onNotify, account }: { id: string; catalog: MarketCatalog | null; onOpen: (id: string) => void; onNotify: (message: string, tone?: 'success' | 'info') => void; account?: MarketAccount }) {
  const [page, setPage] = useState<{ seller: PublicSeller; listings: ListingCard[]; reviews?: SellerReview[] } | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    marketplaceApi.seller(id).then((found) => { if (!cancelled) setPage(found) }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Vendeur introuvable.') })
    return () => { cancelled = true }
  }, [id, version])
  if (error) return <p className="message-error" role="alert">{error}</p>
  if (!page) return <div className="page-loading" aria-busy="true" />
  return (
    <section className="market-seller-page">
      <h1>{page.seller.name}{page.seller.verified && <span className="verified-badge"><BadgeCheck size={14} aria-hidden="true" /> Vendeur vérifié</span>}</h1>
      <p className="market-card-meta"><MapPin size={13} aria-hidden="true" /> {page.seller.city}{page.seller.deliversEverywhere ? ' · livre dans tout le pays' : page.seller.deliveryCities.length ? ` · livre aussi à ${page.seller.deliveryCities.join(', ')}` : ''}</p>
      <SellerStatsLine stats={page.seller.stats} verified={page.seller.verified} />
      {page.seller.description && <p className="market-description">{page.seller.description}</p>}
      <ContactButtons seller={page.seller} listing={{ title: 'vos produits', price: 0, currency: 'XOF' }} />
      <h2>{page.listings.length} annonce{page.listings.length > 1 ? 's' : ''}</h2>
      <ul className="market-grid" aria-label="Annonces du vendeur">
        {page.listings.map((item) => <ListingCardView key={item.id} item={item} catalog={catalog} onOpen={() => onOpen(item.id)} onNotify={onNotify} />)}
      </ul>
      <ReviewsSection sellerId={page.seller.id} sellerName={page.seller.name} reviews={page.reviews ?? []} account={account} onNotify={onNotify} onChanged={() => setVersion((value) => value + 1)} />
    </section>
  )
}

/** Marketplace publique : recherche, annonces et vitrines des vendeurs, sans compte. */
export function MarketplaceView({ onNotify, account }: { onNotify: (message: string, tone?: 'success' | 'info') => void; account?: MarketAccount }) {
  const [route, setRoute] = useState<Route>(routeFromLocation)
  const [catalog, setCatalog] = useState<MarketCatalog | null>(null)

  useEffect(() => {
    marketplaceApi.catalog().then(setCatalog).catch(() => setCatalog(null))
    const sync = () => { if (window.location.pathname.startsWith('/marketplace')) setRoute(routeFromLocation()) }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const go = useCallback((next: Route, replace = false) => {
    const path = pathFor(next)
    if (`${window.location.pathname}${window.location.search}` !== path) {
      if (replace) window.history.replaceState(window.history.state, '', path)
      else window.history.pushState({ gilliMarket: true }, '', path)
    }
    setRoute(next)
    document.querySelector('.content-scroll')?.scrollTo?.({ top: 0 })
  }, [])

  const openListing = (id: string) => go({ page: 'listing', id })
  const selectTab = (page: 'home' | 'favorites' | 'alerts') => go(page === 'home' ? { page: 'home', filters: { city: readCity() || undefined } } : { page })
  const isHome = route.page === 'home' || route.page === 'favorites' || route.page === 'alerts'

  return (
    <div className="page-view market-view">
      {isHome ? (
        <>
          <h1>Marketplace</h1>
          <p className="market-intro">Les produits des commerçants de Gilli, près de chez vous. Contactez le vendeur par WhatsApp ou par téléphone.</p>
          <MarketTabs active={route.page as 'home' | 'favorites' | 'alerts'} onSelect={selectTab} />
          {route.page === 'home' && <HomePage filters={route.filters} newSince={route.newSince} catalog={catalog} onSearch={(filters) => go({ page: 'home', filters })} onOpen={openListing} onNotify={onNotify} />}
          {route.page === 'favorites' && <FavoritesPage onOpen={openListing} onNotify={onNotify} signedIn={account?.signedIn} />}
          {route.page === 'alerts' && <AlertsPage account={account} onNotify={onNotify} onOpen={(alert) => go({ page: 'home', filters: alertFilters(alert), newSince: alert.seenAt })} />}
          <p className="field-hint market-terms">En utilisant la marketplace, vous acceptez les <a href="/conditions">conditions d’utilisation</a>.</p>
        </>
      ) : (
        <>
          <button type="button" className="text-button market-back" onClick={() => ((window.history.state as { gilliMarket?: boolean } | null)?.gilliMarket ? window.history.back() : go({ page: 'home', filters: { city: readCity() || undefined } }))}><ArrowLeft size={16} aria-hidden="true" /> Retour</button>
          {route.page === 'listing' && <ListingPage id={route.id} catalog={catalog} onSeller={(id) => go({ page: 'seller', id })} onNotify={onNotify} />}
          {route.page === 'seller' && <SellerPage id={route.id} catalog={catalog} onOpen={openListing} onNotify={onNotify} account={account} />}
          {route.page === 'compare' && (
            <ComparePage ids={route.ids} catalog={catalog} onOpen={openListing} onRemove={(id) => {
              compareStore.set(compareStore.get().filter((item) => item.id !== id))
              go({ page: 'compare', ids: route.ids.filter((known) => known !== id) }, true)
            }} />
          )}
        </>
      )}
      {route.page !== 'compare' && <CompareBar onOpen={(ids) => go({ page: 'compare', ids })} />}
    </div>
  )
}
