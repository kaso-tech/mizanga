// Fiches d’annonce (grille, liste ou rangée) et squelettes de chargement de la marketplace.
import { BadgeCheck, MapPin, Store, Truck } from 'lucide-react'
import { useState } from 'react'
import { formatPrice, type ListingCard, type MarketCatalog } from '../../services/marketplaceApi'
import { cardToSaved, type Notify } from './marketUtils'
import { SaveButtons } from './MarketplaceLists'
import { RatingBadge } from './SellerTrust'

/**
 * Photo qui apparaît en fondu une fois chargée (sur un réseau lent, la forme grise reste visible
 * jusque-là). Une photo déjà en cache s’affiche aussitôt.
 */
export function FadeImage({ src, alt = '', eager = false }: { src: string; alt?: string; eager?: boolean }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      ref={(element) => { if (element?.complete && element.naturalWidth > 0 && !loaded) setLoaded(true) }}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={`fade-image ${loaded ? 'is-loaded' : ''}`}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
    />
  )
}

/** Fiche d’une annonce : photo, prix, pastilles (état, livraison), vendeur et sa note ; favori et comparaison. */
export function ListingCardView({ item, catalog, onOpen, onNotify, isNew = false, sponsored = false }: {
  item: ListingCard
  catalog: MarketCatalog | null
  onOpen: () => void
  onNotify?: Notify
  isNew?: boolean
  sponsored?: boolean
}) {
  return (
    <li className="market-card">
      <a href={`/marketplace/annonce/${item.id}`} onClick={(event) => { event.preventDefault(); onOpen() }}>
        <span className="market-card-photo">
          {item.photo ? <FadeImage src={item.photo} /> : <Store size={28} aria-hidden="true" />}
          {isNew && <span className="market-new">Nouveau</span>}
          {sponsored && <span className="market-sponsored">Sponsorisé</span>}
        </span>
        <span className="market-card-body">
          <strong className="market-card-price">{formatPrice(item.price, item.currency)}</strong>
          <span className="market-card-title">{item.title}</span>
          <span className="market-pills">
            <span className={`market-pill ${item.condition === 'new' ? 'is-new' : ''}`}>{catalog?.conditions[item.condition] ?? item.condition}</span>
            {!item.sameCity && item.deliversToCity && <span className="market-pill"><Truck size={11} aria-hidden="true" /> Livre chez vous</span>}
          </span>
          <span className="market-card-meta"><MapPin size={12} aria-hidden="true" /> {item.city}</span>
          <span className="market-card-seller">{item.sellerName}{item.sellerVerified && <BadgeCheck size={13} aria-label="Vendeur vérifié" />}</span>
          <RatingBadge rating={item.sellerRating} count={item.sellerReviews} />
        </span>
      </a>
      <SaveButtons listing={cardToSaved(item)} onNotify={onNotify} compact />
    </li>
  )
}

/** Formes grises qui annoncent les fiches pendant le chargement (réseaux lents). */
export function CardSkeletons({ count = 6, row = false }: { count?: number; row?: boolean }) {
  return (
    <ul className={row ? 'market-row' : 'market-grid'} aria-busy="true" aria-label="Chargement des annonces">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="market-card is-skeleton" aria-hidden="true">
          <span className="market-card-photo skeleton" />
          <span className="market-card-body"><span className="skeleton skeleton-line is-short" /><span className="skeleton skeleton-line" /><span className="skeleton skeleton-line is-mid" /></span>
        </li>
      ))}
    </ul>
  )
}
