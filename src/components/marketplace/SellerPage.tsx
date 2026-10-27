import { BadgeCheck, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { marketplaceApi, type ListingCard, type MarketCatalog, type PublicSeller, type SellerReview } from '../../services/marketplaceApi'
import { ContactButtons } from './ListingPage'
import { ListingCardView } from './MarketCards'
import { type Notify } from './marketUtils'
import type { MarketAccount } from './MarketplaceLists'
import { ReviewsSection, SellerStatsLine } from './SellerTrust'

/** Page d’un vendeur : vitrine, contact, annonces et avis des clients. */
export function SellerPage({ id, catalog, onOpen, onNotify, account }: { id: string; catalog: MarketCatalog | null; onOpen: (id: string) => void; onNotify: Notify; account?: MarketAccount }) {
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
