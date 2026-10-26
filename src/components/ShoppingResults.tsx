import { BadgeCheck, GitCompareArrows, MapPin, MessageCircle, Phone, TriangleAlert } from 'lucide-react'
import type { ShoppingListing } from '../domain/types'
import { formatPrice, whatsappLink } from '../services/marketplaceApi'
import type { MouseEvent } from 'react'
import { SaveButtons } from './marketplace/MarketplaceLists'

const conditionLabels: Record<string, string> = { new: 'Neuf', used: 'Occasion', refurbished: 'Reconditionné' }

/**
 * Annonces proposées par l’assistant d’achat, dans l’ordre du classement calculé par Gilli. Le numéro de
 * chaque fiche correspond à celui que cite la réponse ; les raisons viennent des données de l’annonce.
 */
export function ShoppingResults({ listings, onOpenMarketplace }: { listings: ShoppingListing[]; onOpenMarketplace?: (path: string) => void }) {
  /** Lien vers une page de la marketplace, ouvert dans l’application quand c’est possible. */
  const open = (path: string) => (event: MouseEvent) => {
    if (!onOpenMarketplace) return
    event.preventDefault()
    onOpenMarketplace(path)
  }
  const comparePath = `/marketplace/comparer?ids=${listings.slice(0, 3).map((listing) => listing.id).join(',')}`
  return (
    <>
    <ol className="shopping-results" aria-label="Annonces proposées">
      {listings.map((listing) => {
        const href = `/marketplace/annonce/${listing.id}`
        return (
          <li key={listing.id} className={`shopping-card ${listing.overBudget ? 'is-over-budget' : ''}`}>
            <a className="shopping-card-main" href={href} onClick={open(href)} aria-label={`${listing.rank}. ${listing.title}, ${formatPrice(listing.price, listing.currency)} — voir l’annonce`}>
              <span className="shopping-rank" aria-hidden="true">{listing.rank}</span>
              {listing.photo ? <img src={listing.photo} alt="" loading="lazy" /> : <span className="shopping-photo-empty" aria-hidden="true" />}
              <span className="shopping-text">
                <span className="shopping-title">{listing.title}</span>
                <span className="shopping-price">{formatPrice(listing.price, listing.currency)}<span className="shopping-unit"> · {conditionLabels[listing.condition] ?? listing.condition}</span></span>
                <span className="shopping-seller">
                  {listing.sellerName}
                  {listing.sellerVerified && <BadgeCheck size={14} aria-label="Vendeur vérifié" />}
                  <span className="shopping-city"><MapPin size={12} aria-hidden="true" /> {listing.city}</span>
                </span>
              </span>
            </a>
            {(listing.reasons.length > 0 || listing.warnings.length > 0) && (
              <ul className="shopping-reasons" aria-label="Pourquoi cette annonce">
                {listing.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                {listing.warnings.map((warning) => <li key={warning} className="is-warning"><TriangleAlert size={12} aria-hidden="true" /> {warning}</li>)}
              </ul>
            )}
            <div className="shopping-actions">
              {listing.whatsapp && <a className="primary-button" href={whatsappLink(listing.whatsapp, listing)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" /> WhatsApp</a>}
              {(listing.phone ?? listing.whatsapp) && <a className="secondary-button" href={`tel:+${listing.phone ?? listing.whatsapp}`}><Phone size={16} aria-hidden="true" /> Appeler</a>}
              <a className="text-button" href={href} onClick={open(href)}>Voir l’annonce</a>
              <SaveButtons listing={{ id: listing.id, title: listing.title, price: listing.price, currency: listing.currency, photo: listing.photo, city: listing.city, sellerName: listing.sellerName, sellerVerified: listing.sellerVerified, condition: listing.condition }} showCompare={false} />
            </div>
          </li>
        )
      })}
    </ol>
    {listings.length >= 2 && (
      <a className="secondary-button shopping-compare" href={comparePath} onClick={open(comparePath)}>
        <GitCompareArrows size={16} aria-hidden="true" /> Comparer {listings.length >= 3 ? 'les 3 premières' : 'ces 2 annonces'}
      </a>
    )}
    </>
  )
}
