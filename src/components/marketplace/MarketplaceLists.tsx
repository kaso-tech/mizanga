import { BadgeCheck, Bell, BellRing, GitCompareArrows, Heart, MapPin, Store, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { markAlertSeen, removeAlert, toggleCompare, toggleFavorite, useAlerts, useCompare, useFavorites, type ListingLike, type MarketAlert } from '../../app/marketSaved'
import { formatPrice, marketplaceApi, type ListingDetail, type MarketCatalog } from '../../services/marketplaceApi'

type Notify = (message: string, tone?: 'success' | 'info') => void

/** Boutons « favori » et « comparer » d’une annonce (fiche de recherche, page annonce, fiche de l’assistant). */
export function SaveButtons({ listing, onNotify, compact = false, showCompare = true }: { listing: ListingLike; onNotify?: Notify; compact?: boolean; showCompare?: boolean }) {
  const isFavorite = useFavorites().some((item) => item.id === listing.id)
  const isCompared = useCompare().some((item) => item.id === listing.id)
  return (
    <span className={`market-save ${compact ? 'is-compact' : ''}`}>
      <button
        type="button"
        className={`icon-button market-save-button ${isFavorite ? 'is-active' : ''}`}
        aria-pressed={isFavorite}
        aria-label={`${isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${listing.title}`}
        title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        onClick={() => {
          const added = toggleFavorite(listing)
          onNotify?.(added ? 'Ajouté à vos favoris.' : 'Retiré de vos favoris.', 'success')
        }}
      >
        <Heart size={18} aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
      {showCompare && <button
        type="button"
        className={`icon-button market-save-button ${isCompared ? 'is-active' : ''}`}
        aria-pressed={isCompared}
        aria-label={`${isCompared ? 'Retirer de la comparaison' : 'Comparer'} : ${listing.title}`}
        title={isCompared ? 'Retirer de la comparaison' : 'Comparer'}
        onClick={() => {
          const result = toggleCompare(listing)
          if (result === 'full') onNotify?.('Vous comparez déjà 3 annonces : retirez-en une d’abord.', 'info')
        }}
      >
        <GitCompareArrows size={18} aria-hidden="true" />
      </button>}
    </span>
  )
}

/** Barre de la comparaison en cours, en bas de la marketplace. */
export function CompareBar({ onOpen }: { onOpen: (ids: string[]) => void }) {
  const selection = useCompare()
  if (selection.length === 0) return null
  return (
    <div className="market-compare-bar" role="region" aria-label="Comparaison">
      <span>{selection.length} / 3 à comparer</span>
      <button type="button" className="text-button" onClick={() => { for (const item of selection) toggleCompare(item) }}>Vider</button>
      <button type="button" className="primary-button" disabled={selection.length < 2} onClick={() => onOpen(selection.map((item) => item.id))}>
        <GitCompareArrows size={16} aria-hidden="true" /> Comparer
      </button>
    </div>
  )
}

/** Onglets de l’accueil de la marketplace. */
export function MarketTabs({ active, onSelect }: { active: 'home' | 'favorites' | 'alerts'; onSelect: (page: 'home' | 'favorites' | 'alerts') => void }) {
  const favorites = useFavorites().length
  const fresh = useAlerts().reduce((sum, alert) => sum + alert.newCount, 0)
  const tab = (page: 'home' | 'favorites' | 'alerts', label: string, extra?: string) => (
    <button type="button" role="tab" aria-selected={active === page} className={`market-tab ${active === page ? 'is-active' : ''}`} onClick={() => onSelect(page)}>
      {label}{extra && <span className="market-tab-count">{extra}</span>}
    </button>
  )
  return (
    <div className="market-tabs" role="tablist" aria-label="Marketplace">
      {tab('home', 'Annonces')}
      {tab('favorites', 'Favoris', favorites ? String(favorites) : undefined)}
      {tab('alerts', 'Alertes', fresh ? `${fresh} nouv.` : undefined)}
    </div>
  )
}

type FavoriteState = { status: 'loading' } | { status: 'gone' } | { status: 'ok'; price: number }

/** Favoris : l’annonce telle qu’enregistrée, et son état actuel (prix changé, plus disponible). */
export function FavoritesPage({ onOpen, onNotify }: { onOpen: (id: string) => void; onNotify: Notify }) {
  const favorites = useFavorites()
  const [states, setStates] = useState<Record<string, FavoriteState>>({})
  const ids = favorites.map((item) => item.id).join(',')

  useEffect(() => {
    let cancelled = false
    for (const id of ids ? ids.split(',').slice(0, 30) : []) {
      marketplaceApi.listing(id)
        .then((listing) => { if (!cancelled) setStates((current) => ({ ...current, [id]: { status: 'ok', price: listing.price } })) })
        .catch((error: unknown) => {
          // 404 : annonce retirée ou épuisée. Autre erreur (réseau) : on garde la fiche enregistrée.
          if (!cancelled && (error as { status?: number }).status === 404) setStates((current) => ({ ...current, [id]: { status: 'gone' } }))
        })
    }
    return () => { cancelled = true }
  }, [ids])

  if (favorites.length === 0) {
    return <p className="market-empty"><Heart size={20} aria-hidden="true" /> Aucun favori pour l’instant. Touchez le cœur d’une annonce pour la retrouver ici.</p>
  }
  return (
    <>
      <p className="field-hint">Vos favoris sont enregistrés sur cet appareil.</p>
      <ul className="market-saved-list" aria-label="Favoris">
        {favorites.map((item) => {
          const state = states[item.id]
          const price = state?.status === 'ok' ? state.price : item.price
          return (
            <li key={item.id} className={`market-saved ${state?.status === 'gone' ? 'is-gone' : ''}`}>
              <a href={`/marketplace/annonce/${item.id}`} onClick={(event) => { event.preventDefault(); if (state?.status !== 'gone') onOpen(item.id) }} aria-disabled={state?.status === 'gone'}>
                <span className="market-card-photo">{item.photo ? <img src={item.photo} alt="" loading="lazy" /> : <Store size={24} aria-hidden="true" />}</span>
                <span className="market-card-body">
                  <span className="market-card-title">{item.title}</span>
                  <strong className="market-card-price">{formatPrice(price, item.currency)}</strong>
                  {state?.status === 'ok' && state.price < item.price && <span className="market-price-change is-down">Prix baissé (était {formatPrice(item.price, item.currency)})</span>}
                  {state?.status === 'ok' && state.price > item.price && <span className="market-price-change">Prix en hausse (était {formatPrice(item.price, item.currency)})</span>}
                  {state?.status === 'gone' && <span className="market-price-change">Plus disponible</span>}
                  <span className="market-card-seller">{item.sellerName}{item.sellerVerified && <BadgeCheck size={13} aria-label="Vendeur vérifié" />} · <MapPin size={12} aria-hidden="true" /> {item.city}</span>
                </span>
              </a>
              <button type="button" className="icon-button" aria-label={`Retirer des favoris : ${item.title}`} onClick={() => { toggleFavorite(item); onNotify('Retiré de vos favoris.', 'success') }}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** Alertes : recherches suivies, avec le nombre d’annonces publiées depuis la dernière visite. */
export function AlertsPage({ onOpen }: { onOpen: (alert: MarketAlert) => void }) {
  const alerts = useAlerts()
  if (alerts.length === 0) {
    return <p className="market-empty"><Bell size={20} aria-hidden="true" /> Aucune alerte. Lancez une recherche, puis touchez « Créer une alerte » : Gilli vous signalera les nouvelles annonces à chaque ouverture.</p>
  }
  return (
    <>
      <p className="field-hint">Les alertes sont vérifiées quand Gilli est ouvert sur cet appareil (pas encore de notification sur le téléphone).</p>
      <ul className="market-saved-list" aria-label="Alertes">
        {alerts.map((alert) => (
          <li key={alert.id} className="market-saved market-alert">
            <button type="button" className="market-alert-open" onClick={() => { markAlertSeen(alert.id); onOpen(alert) }}>
              {alert.newCount > 0 ? <BellRing size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
              <span className="market-card-body">
                <span className="market-card-title">{alert.label}</span>
                <span className={`market-alert-count ${alert.newCount > 0 ? 'is-new' : ''}`}>
                  {alert.newCount > 0 ? `${alert.newCount} nouvelle${alert.newCount > 1 ? 's' : ''} annonce${alert.newCount > 1 ? 's' : ''}` : 'Rien de nouveau'}
                </span>
              </span>
            </button>
            <button type="button" className="icon-button" aria-label={`Supprimer l’alerte : ${alert.label}`} onClick={() => removeAlert(alert.id)}>
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

const display = (value: unknown, unit?: string) => (value === undefined || value === null || value === '' ? '—' : typeof value === 'boolean' ? (value ? 'Oui' : 'Non') : `${typeof value === 'number' ? value.toLocaleString('fr-FR').replace(/\u202f/g, ' ') : String(value)}${unit ? ` ${unit}` : ''}`)

/**
 * Comparaison de 2 ou 3 annonces côte à côte. Les mentions « le moins cher » et « le meilleur » sont
 * calculées à partir des valeurs saisies par les vendeurs (aucune estimation).
 */
export function ComparePage({ ids, catalog, onOpen, onRemove }: { ids: string[]; catalog: MarketCatalog | null; onOpen: (id: string) => void; onRemove: (id: string) => void }) {
  const [listings, setListings] = useState<Array<ListingDetail | { id: string; missing: true }> | null>(null)
  const key = ids.join(',')
  useEffect(() => {
    let cancelled = false
    setListings(null)
    void Promise.all(key.split(',').filter(Boolean).map((id) => marketplaceApi.listing(id).catch(() => ({ id, missing: true as const })))).then((found) => { if (!cancelled) setListings(found) })
    return () => { cancelled = true }
  }, [key])

  if (ids.length < 2) return <p className="market-empty"><GitCompareArrows size={20} aria-hidden="true" /> Choisissez au moins 2 annonces à comparer (bouton « Comparer » de chaque annonce).</p>
  if (!listings) return <div className="page-loading" aria-busy="true" />
  const available = listings.filter((item): item is ListingDetail => !('missing' in item))
  const lowest = available.length > 1 ? Math.min(...available.map((item) => item.price)) : null
  // Caractéristiques des catégories concernées, dans l’ordre du catalogue, si au moins une annonce les indique.
  const attributes = [...new Map(available.flatMap((item) => catalog?.categories.find((category) => category.id === item.category)?.attributes ?? []).map((attribute) => [attribute.key, attribute])).values()]
    .filter((attribute) => available.some((item) => item.attributes[attribute.key] !== undefined))
  const best = (key: string, better?: 'higher' | 'lower') => {
    if (!better) return null
    const values = available.map((item) => item.attributes[key]).filter((value): value is number => typeof value === 'number')
    if (values.length < 2 || new Set(values).size < 2) return null
    return better === 'higher' ? Math.max(...values) : Math.min(...values)
  }

  return (
    <section aria-labelledby="compare-title">
      <h1 id="compare-title">Comparer</h1>
      <div className="market-compare-scroll">
        <table className={`market-compare ${listings.length > 2 ? 'has-3' : ''}`}>
          <thead>
            <tr>
              <th scope="col"><span className="visually-hidden">Caractéristique</span></th>
              {listings.map((item) => (
                <th key={item.id} scope="col">
                  {'missing' in item ? (
                    <span className="market-compare-missing">Annonce plus disponible</span>
                  ) : (
                    <>
                      <span className="market-card-photo">{item.photos[0] ? <img src={item.photos[0]} alt="" /> : <Store size={24} aria-hidden="true" />}</span>
                      <a href={`/marketplace/annonce/${item.id}`} onClick={(event) => { event.preventDefault(); onOpen(item.id) }}>{item.title}</a>
                    </>
                  )}
                  <button type="button" className="icon-button market-compare-remove" aria-label={`Retirer de la comparaison : ${'missing' in item ? 'annonce' : item.title}`} onClick={() => onRemove(item.id)}>
                    <X size={14} aria-hidden="true" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Prix</th>
              {listings.map((item) => <td key={item.id}>{'missing' in item ? '—' : <><strong>{formatPrice(item.price, item.currency)}</strong>{item.price === lowest && <span className="market-best">Le moins cher</span>}</>}</td>)}
            </tr>
            <tr>
              <th scope="row">État</th>
              {listings.map((item) => <td key={item.id}>{'missing' in item ? '—' : catalog?.conditions[item.condition] ?? item.condition}</td>)}
            </tr>
            <tr>
              <th scope="row">Vendeur</th>
              {listings.map((item) => <td key={item.id}>{'missing' in item ? '—' : <>{item.seller.name}{item.seller.verified && <span className="verified-badge"><BadgeCheck size={13} aria-hidden="true" /> Vérifié</span>}</>}</td>)}
            </tr>
            <tr>
              <th scope="row">Ville</th>
              {listings.map((item) => <td key={item.id}>{'missing' in item ? '—' : <>{item.seller.city}{item.seller.deliversEverywhere ? ' · livre partout' : item.seller.deliveryCities.length ? ` · livre à ${item.seller.deliveryCities.join(', ')}` : ''}</>}</td>)}
            </tr>
            {attributes.map((attribute) => {
              const top = best(attribute.key, attribute.better)
              return (
                <tr key={attribute.key}>
                  <th scope="row">{attribute.label}</th>
                  {listings.map((item) => {
                    if ('missing' in item) return <td key={item.id}>—</td>
                    const value = item.attributes[attribute.key]
                    return <td key={item.id}>{display(value, attribute.unit)}{top !== null && value === top && <span className="market-best">{attribute.better === 'lower' ? 'Le plus bas' : 'Le plus élevé'}</span>}</td>
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="field-hint">Valeurs indiquées par les vendeurs. « — » : non indiqué. Vérifiez le produit avant de payer.</p>
    </section>
  )
}
