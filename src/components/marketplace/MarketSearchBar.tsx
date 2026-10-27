import { Clock, LayoutGrid, Search, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { suggestedCities } from '../../app/cities'
import type { MarketCatalog } from '../../services/marketplaceApi'
import { CATEGORY_ICONS, forgetSearches, readRecentSearches } from './marketUtils'

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Barre de recherche de la marketplace, fixée en haut : mots, ville et budget, avec des suggestions
 * pendant la frappe (catégories correspondantes, recherches récentes).
 */
export function MarketSearchBar({ initial, catalog, onSearch, onCategory }: {
  initial: { q?: string; city?: string; maxPrice?: number }
  catalog: MarketCatalog | null
  onSearch: (search: { q?: string; city?: string; maxPrice?: number }) => void
  onCategory: (categoryId: string) => void
}) {
  const [query, setQuery] = useState(initial.q ?? '')
  const [city, setCity] = useState(initial.city ?? '')
  const [maxPrice, setMaxPrice] = useState(initial.maxPrice ? String(initial.maxPrice) : '')
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState(readRecentSearches)
  const closeTimer = useRef<number>()

  const typed = plain(query.trim())
  const categories = typed.length >= 2 ? (catalog?.categories ?? []).filter((category) => plain(category.label).includes(typed) || category.subcategories.some((sub) => plain(sub.label).includes(typed))).slice(0, 4) : []
  const recents = recent.filter((item) => !typed || plain(item).includes(typed)).slice(0, 5)
  const showSuggestions = open && (categories.length > 0 || recents.length > 0)

  const submit = (event?: FormEvent, text = query) => {
    event?.preventDefault()
    setOpen(false)
    const price = maxPrice.replace(/\s/g, '')
    onSearch({ q: text.trim() || undefined, city: city.trim() || undefined, maxPrice: /^\d+$/.test(price) ? Number(price) : undefined })
  }

  return (
    <form className="market-search" role="search" onSubmit={submit}>
      <div className="market-search-main">
        <label className="market-search-query">
          <Search size={18} aria-hidden="true" />
          <span className="visually-hidden">Que cherchez-vous ?</span>
          <input
            type="search"
            value={query}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
            onFocus={() => { window.clearTimeout(closeTimer.current); setRecent(readRecentSearches()); setOpen(true) }}
            onBlur={() => { closeTimer.current = window.setTimeout(() => setOpen(false), 150) }}
            placeholder="Téléphone, riz, moto, panneau solaire…"
          />
          {query && <button type="button" className="icon-button market-search-clear" aria-label="Effacer la recherche" onClick={() => setQuery('')}><X size={16} /></button>}
        </label>
        <button type="submit" className="primary-button market-search-submit">Rechercher</button>
      </div>
      {showSuggestions && (
        <div className="market-suggestions" onMouseDown={(event) => event.preventDefault()}>
          {categories.length > 0 && (
            <ul aria-label="Catégories suggérées">
              {categories.map((category) => {
                const Icon = CATEGORY_ICONS[category.id] ?? LayoutGrid
                return <li key={category.id}><button type="button" onClick={() => { setOpen(false); onCategory(category.id) }}><Icon size={16} aria-hidden="true" /> {category.label}</button></li>
              })}
            </ul>
          )}
          {recents.length > 0 && (
            <ul aria-label="Recherches récentes">
              {recents.map((item) => <li key={item}><button type="button" onClick={() => { setQuery(item); submit(undefined, item) }}><Clock size={16} aria-hidden="true" /> {item}</button></li>)}
              <li><button type="button" className="market-suggestions-clear" onClick={() => { forgetSearches(); setRecent([]) }}>Effacer l’historique</button></li>
            </ul>
          )}
        </div>
      )}
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
      </div>
    </form>
  )
}
