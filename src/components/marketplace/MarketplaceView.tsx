import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { alertFilters, compareStore } from '../../app/marketSaved'
import { marketplaceApi, searchQuery, type MarketCatalog, type SearchFilters } from '../../services/marketplaceApi'
import { ListingPage } from './ListingPage'
import { hasCriteria, readCity, rememberSearch, saveCity, type Notify } from './marketUtils'
import { MarketHome } from './MarketHome'
import { AlertsPage, CompareBar, ComparePage, FavoritesPage, MarketTabs, type MarketAccount } from './MarketplaceLists'
import { MarketResults } from './MarketResults'
import { MarketSearchBar } from './MarketSearchBar'
import { SellerPage } from './SellerPage'

type Route =
  | { page: 'home'; filters: SearchFilters; newSince?: string }
  | { page: 'listing'; id: string }
  | { page: 'seller'; id: string }
  | { page: 'favorites' }
  | { page: 'alerts' }
  | { page: 'compare'; ids: string[] }

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
      city: params.get('city') ?? (readCity() || undefined),
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

/**
 * Marketplace publique, sans compte : vitrine (catégories, rubriques), recherche avec suggestions,
 * résultats filtrables, pages annonce et vendeur ; favoris, alertes et comparaison.
 */
export function MarketplaceView({ onNotify, account }: { onNotify: Notify; account?: MarketAccount }) {
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
  const search = (filters: SearchFilters) => go({ page: 'home', filters })
  const home = () => go({ page: 'home', filters: { city: readCity() || undefined } })
  const selectTab = (page: 'home' | 'favorites' | 'alerts') => (page === 'home' ? home() : go({ page }))
  const isHome = route.page === 'home' || route.page === 'favorites' || route.page === 'alerts'
  const filters = route.page === 'home' ? route.filters : null
  const showResults = Boolean(filters && hasCriteria(filters))

  return (
    <div className="page-view market-view">
      {isHome ? (
        <>
          <div className="market-hero">
            <h1>Marketplace</h1>
            {!showResults && route.page === 'home' && <p className="market-intro">Les produits des commerçants près de chez vous, à contacter par WhatsApp ou par téléphone.</p>}
          </div>
          {filters && (
            <MarketSearchBar
              key={pathFor(route)}
              initial={filters}
              catalog={catalog}
              onSearch={({ q, city, maxPrice }) => {
                saveCity(city ?? '')
                if (q) rememberSearch(q)
                search({ ...filters, q, city, maxPrice })
              }}
              onCategory={(category) => search({ city: filters.city, category })}
            />
          )}
          <MarketTabs active={route.page as 'home' | 'favorites' | 'alerts'} onSelect={selectTab} />
          {filters && showResults && (
            <>
              <button type="button" className="text-button market-back" onClick={home}><ArrowLeft size={16} aria-hidden="true" /> Accueil de la marketplace</button>
              <MarketResults filters={filters} newSince={route.page === 'home' ? route.newSince : undefined} catalog={catalog} onSearch={search} onOpen={openListing} onNotify={onNotify} />
            </>
          )}
          {filters && !showResults && <MarketHome catalog={catalog} city={filters.city} onSearch={search} onOpen={openListing} onNotify={onNotify} />}
          {route.page === 'favorites' && <FavoritesPage onOpen={openListing} onNotify={onNotify} signedIn={account?.signedIn} />}
          {route.page === 'alerts' && <AlertsPage account={account} onNotify={onNotify} onOpen={(alert) => go({ page: 'home', filters: alertFilters(alert), newSince: alert.seenAt })} />}
          <p className="field-hint market-terms">En utilisant la marketplace, vous acceptez les <a href="/conditions">conditions d’utilisation</a>.</p>
        </>
      ) : (
        <>
          <button type="button" className="text-button market-back" onClick={() => ((window.history.state as { gilliMarket?: boolean } | null)?.gilliMarket ? window.history.back() : home())}><ArrowLeft size={16} aria-hidden="true" /> Retour</button>
          {route.page === 'listing' && <ListingPage key={route.id} id={route.id} catalog={catalog} onSeller={(id) => go({ page: 'seller', id })} onOpen={openListing} onNotify={onNotify} />}
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
