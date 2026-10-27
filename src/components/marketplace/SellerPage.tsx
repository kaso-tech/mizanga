import { BadgeCheck, CalendarDays, Info, MapPin, MessageSquareText, PackageSearch, Search, Share2, Store, Truck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatMonth, marketplaceApi, type ListingCard, type MarketCatalog, type PublicSeller, type SellerReview } from '../../services/marketplaceApi'
import { ContactButtons } from './ListingPage'
import { ListingCardView } from './MarketCards'
import { sharePage, useWideLayout, type Notify } from './marketUtils'
import type { MarketAccount } from './MarketplaceLists'
import { RatingSummary, ReviewsSection, SellerStatsLine } from './SellerTrust'

type Tab = 'annonces' | 'avis' | 'a-propos'
const TABS: Array<{ id: Tab; label: string }> = [{ id: 'annonces', label: 'Annonces' }, { id: 'avis', label: 'Avis' }, { id: 'a-propos', label: 'À propos' }]
const SHOP_SORTS: Record<string, string> = { recent: 'Récentes', price_asc: 'Moins chères', price_desc: 'Plus chères' }

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Onglet indiqué dans l’adresse (?onglet=avis), sinon les annonces. */
const tabFromLocation = (): Tab => {
  const value = new URLSearchParams(window.location.search).get('onglet')
  return value === 'avis' || value === 'a-propos' ? value : 'annonces'
}

/** Annonces de la boutique : recherche, catégories et tri, sur l’appareil (toutes les annonces sont chargées). */
function ShopListings({ listings, catalog, onOpen, onNotify }: { listings: ListingCard[]; catalog: MarketCatalog | null; onOpen: (id: string) => void; onNotify: Notify }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('recent')
  const categories = useMemo(() => [...new Set(listings.map((item) => item.category))].map((id) => ({ id, label: catalog?.categories.find((item) => item.id === id)?.label ?? id })), [listings, catalog])
  const shown = useMemo(() => {
    const words = plain(query.trim()).split(/\s+/).filter(Boolean)
    const found = listings.filter((item) => (!category || item.category === category) && words.every((word) => plain(item.title).includes(word)))
    if (sort === 'price_asc') return [...found].sort((a, b) => a.price - b.price)
    if (sort === 'price_desc') return [...found].sort((a, b) => b.price - a.price)
    return [...found].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  }, [listings, query, category, sort])

  if (listings.length === 0) return <p className="market-empty"><PackageSearch size={20} aria-hidden="true" /> Cette boutique n’a pas d’annonce en ligne pour le moment.</p>
  return (
    <div className="shop-listings">
      <div className="shop-tools">
        <label className="market-search-query shop-search">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Rechercher dans la boutique</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher ici" />
        </label>
        <label className="field">
          <span className="visually-hidden">Trier les annonces de la boutique</span>
          <select aria-label="Trier les annonces de la boutique" value={sort} onChange={(event) => setSort(event.target.value)}>
            {Object.entries(SHOP_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {categories.length > 1 && (
        <nav className="market-categories" aria-label="Catégories de la boutique">
          <button type="button" className={`saved-prompt-chip ${!category ? 'is-active' : ''}`} aria-pressed={!category} onClick={() => setCategory('')}>Tout ({listings.length})</button>
          {categories.map((item) => (
            <button key={item.id} type="button" className={`saved-prompt-chip ${category === item.id ? 'is-active' : ''}`} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>
              {item.label} ({listings.filter((listing) => listing.category === item.id).length})
            </button>
          ))}
        </nav>
      )}
      {shown.length > 0 ? (
        <ul className="market-grid" aria-label="Annonces du vendeur">
          {shown.map((item) => <ListingCardView key={item.id} item={item} catalog={catalog} onOpen={() => onOpen(item.id)} onNotify={onNotify} />)}
        </ul>
      ) : (
        <p className="market-empty"><PackageSearch size={20} aria-hidden="true" /> Aucune annonce de la boutique ne correspond.</p>
      )}
    </div>
  )
}

/** Boutique d’un vendeur : bannière, contact, onglets Annonces / Avis / À propos. */
export function SellerPage({ id, catalog, onOpen, onNotify, account }: { id: string; catalog: MarketCatalog | null; onOpen: (id: string) => void; onNotify: Notify; account?: MarketAccount }) {
  const [page, setPage] = useState<{ seller: PublicSeller; listings: ListingCard[]; reviews?: SellerReview[] } | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [tab, setTab] = useState<Tab>(tabFromLocation)
  const wide = useWideLayout()
  useEffect(() => {
    let cancelled = false
    marketplaceApi.seller(id).then((found) => { if (!cancelled) setPage(found) }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Vendeur introuvable.') })
    return () => { cancelled = true }
  }, [id, version])
  useEffect(() => {
    if (page) document.title = `${page.seller.name} — Gilli Marketplace`
  }, [page])

  const selectTab = (next: Tab) => {
    setTab(next)
    const params = new URLSearchParams(window.location.search)
    if (next === 'annonces') params.delete('onglet')
    else params.set('onglet', next)
    const query = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }
  const share = async () => {
    if (!page) return
    try {
      const result = await sharePage({ title: page.seller.name, text: `${page.seller.name} — boutique sur Gilli`, path: `/marketplace/vendeur/${page.seller.id}` })
      if (result === 'copied') onNotify('Lien de la boutique copié.', 'success')
    } catch {
      onNotify('Partage impossible sur cet appareil.', 'info')
    }
  }

  if (error) return <p className="message-error" role="alert">{error}</p>
  if (!page) return <div className="shop"><div className="shop-banner skeleton" /><span className="skeleton skeleton-line is-mid" /><span className="skeleton skeleton-line is-short" /></div>
  const { seller, listings } = page
  const reviews = page.reviews ?? []
  const contact = { title: 'vos produits', price: 0, currency: 'XOF' }
  const delivery = seller.deliversEverywhere ? 'Livre dans tout le pays' : seller.deliveryCities.length ? `Livre aussi à ${seller.deliveryCities.join(', ')}` : null

  return (
    <section className="shop" aria-labelledby="shop-name">
      <div className="shop-banner" aria-hidden="true" />
      <header className="shop-header">
        <span className="shop-avatar" aria-hidden="true">{seller.name.slice(0, 1).toUpperCase()}</span>
        <div className="shop-identity">
          <h1 id="shop-name">{seller.name}{seller.verified && <span className="verified-badge"><BadgeCheck size={14} aria-hidden="true" /> Vendeur vérifié</span>}</h1>
          <p className="market-card-meta"><MapPin size={13} aria-hidden="true" /> {seller.city}{delivery && <> · <Truck size={13} aria-hidden="true" /> {delivery.toLowerCase()}</>}</p>
        </div>
        <button type="button" className="icon-button shop-share" aria-label="Partager la boutique" title="Partager" onClick={() => void share()}><Share2 size={18} /></button>
      </header>
      <SellerStatsLine stats={seller.stats} verified={seller.verified} />
      {wide && <ContactButtons seller={seller} listing={contact} />}

      <div className="market-tabs shop-tabs" role="tablist" aria-label="Boutique">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`market-tab ${tab === item.id ? 'is-active' : ''}`} onClick={() => selectTab(item.id)}>
            {item.label}
            {item.id === 'annonces' && <span className="market-tab-count">{listings.length}</span>}
            {item.id === 'avis' && (seller.stats?.reviewCount ?? 0) > 0 && <span className="market-tab-count">{seller.stats?.reviewCount}</span>}
          </button>
        ))}
      </div>

      {tab === 'annonces' && <ShopListings listings={listings} catalog={catalog} onOpen={onOpen} onNotify={onNotify} />}
      {tab === 'avis' && (
        <>
          <RatingSummary stats={seller.stats} reviews={reviews} />
          <ReviewsSection sellerId={seller.id} sellerName={seller.name} reviews={reviews} account={account} onNotify={onNotify} onChanged={() => setVersion((value) => value + 1)} />
        </>
      )}
      {tab === 'a-propos' && (
        <div className="shop-about">
          {seller.description ? <p className="market-description">{seller.description}</p> : <p className="field-hint">Le vendeur n’a pas encore présenté sa boutique.</p>}
          <dl className="market-attributes">
            <div><dt><MapPin size={14} aria-hidden="true" /> Ville</dt><dd>{seller.city}</dd></div>
            <div><dt><Truck size={14} aria-hidden="true" /> Livraison</dt><dd>{delivery ?? 'Retrait chez le vendeur'}</dd></div>
            {seller.stats && <div><dt><CalendarDays size={14} aria-hidden="true" /> Sur Gilli depuis</dt><dd>{formatMonth(seller.stats.memberSince)}</dd></div>}
            <div><dt><Store size={14} aria-hidden="true" /> Annonces en ligne</dt><dd>{listings.length}</dd></div>
            <div><dt><MessageSquareText size={14} aria-hidden="true" /> Avis</dt><dd>{seller.stats?.reviewCount ? `${seller.stats.reviewCount}` : 'Aucun pour l’instant'}</dd></div>
          </dl>
          <p className="settings-callout"><Info size={16} aria-hidden="true" /><span>{seller.verified ? 'L’équipe Gilli a vérifié l’identité de ce vendeur.' : 'L’identité de ce vendeur n’a pas encore été vérifiée par l’équipe Gilli.'} Voyez toujours le produit avant de payer : la vente se conclut directement entre vous.</span></p>
        </div>
      )}

      {!wide && (
        <div className="market-sticky-contact" role="region" aria-label="Contacter le vendeur">
          <span className="market-sticky-price is-name">{seller.name}</span>
          <ContactButtons seller={seller} listing={contact} compact />
        </div>
      )}
    </section>
  )
}
