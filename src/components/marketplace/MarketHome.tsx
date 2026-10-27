import { ArrowRight, BadgeCheck, LayoutGrid, Megaphone, PackageSearch, Sparkles, Tag } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { marketplaceApi, type ListingCard, type MarketCatalog, type SearchFilters } from '../../services/marketplaceApi'
import { CardSkeletons, ListingCardView } from './MarketCards'
import { CATEGORY_ICONS, shortLabel, type Notify } from './marketUtils'

type Shelf = { items: ListingCard[]; sponsored: ListingCard[] }

/** Rangée d’annonces qui défile sur le côté, avec « Voir tout ». */
function Row({ title, icon, items, catalog, onOpen, onNotify, onSeeAll, sponsored = false, note }: {
  title: string
  icon: ReactNode
  items: ListingCard[]
  catalog: MarketCatalog | null
  onOpen: (id: string) => void
  onNotify: Notify
  onSeeAll?: () => void
  sponsored?: boolean
  note?: string
}) {
  if (items.length === 0) return null
  return (
    <section className="market-shelf" aria-label={title}>
      <div className="market-shelf-head">
        <h2>{icon} {title}</h2>
        {onSeeAll && <button type="button" className="text-button" onClick={onSeeAll}>Voir tout <ArrowRight size={14} aria-hidden="true" /></button>}
      </div>
      {note && <p className="market-sponsored-note">{note}</p>}
      <ul className="market-row">
        {items.slice(0, 10).map((item) => <ListingCardView key={item.id} item={item} catalog={catalog} onOpen={() => onOpen(item.id)} onNotify={onNotify} sponsored={sponsored} />)}
      </ul>
    </section>
  )
}

/**
 * Vitrine de la marketplace (sans recherche en cours) : catégories, annonces sponsorisées, nouveautés
 * près de chez soi, vendeurs vérifiés et petits prix.
 */
export function MarketHome({ catalog, city, onSearch, onOpen, onNotify }: {
  catalog: MarketCatalog | null
  city?: string
  onSearch: (filters: SearchFilters) => void
  onOpen: (id: string) => void
  onNotify: Notify
}) {
  const [shelves, setShelves] = useState<{ latest: Shelf; verified: Shelf; cheap: Shelf } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setShelves(null)
    setError('')
    const load = (filters: SearchFilters) => marketplaceApi.search({ city, ...filters }).then((found) => ({ items: found.items, sponsored: found.sponsored ?? [] }))
    Promise.all([load({}), load({ verified: '1' }), load({ sort: 'price_asc' })])
      .then(([latest, verified, cheap]) => { if (!cancelled) setShelves({ latest, verified, cheap }) })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Marketplace indisponible.') })
    return () => { cancelled = true }
  }, [city])

  const rowProps = { catalog, onOpen, onNotify }
  return (
    <>
      <nav className="market-category-grid" aria-label="Catégories">
        {(catalog?.categories ?? []).map((category) => {
          const Icon = CATEGORY_ICONS[category.id] ?? LayoutGrid
          return (
            <button key={category.id} type="button" onClick={() => onSearch({ city, category: category.id })} aria-label={category.label}>
              <span className="market-category-icon"><Icon size={22} aria-hidden="true" /></span>
              <span className="market-category-label">{shortLabel(category.label)}</span>
            </button>
          )
        })}
      </nav>

      {error && <p className="message-error" role="alert">{error}</p>}
      {!shelves && !error && <CardSkeletons count={4} row />}
      {shelves && (
        <>
          <Row title="Sponsorisé" icon={<Megaphone size={18} aria-hidden="true" />} items={shelves.latest.sponsored} sponsored note="Les vendeurs paient pour cette mise en avant ; le classement des résultats n’en tient pas compte." {...rowProps} />
          <Row title={city ? `Nouveautés près de ${city}` : 'Nouveautés'} icon={<Sparkles size={18} aria-hidden="true" />} items={shelves.latest.items} onSeeAll={() => onSearch({ city, sort: 'recent' })} {...rowProps} />
          <Row title="Vendeurs vérifiés" icon={<BadgeCheck size={18} aria-hidden="true" />} items={shelves.verified.items} onSeeAll={() => onSearch({ city, verified: '1' })} {...rowProps} />
          <Row title="Petits prix" icon={<Tag size={18} aria-hidden="true" />} items={shelves.cheap.items} onSeeAll={() => onSearch({ city, sort: 'price_asc' })} {...rowProps} />
          {shelves.latest.items.length === 0 ? (
            <p className="market-empty"><PackageSearch size={20} aria-hidden="true" /> Aucune annonce pour le moment. Les commerçants publient leurs produits depuis l’Espace vendeur.</p>
          ) : (
            <button type="button" className="secondary-button is-block market-more" onClick={() => onSearch({ city, sort: 'recent' })}>Voir toutes les annonces</button>
          )}
        </>
      )}
    </>
  )
}
