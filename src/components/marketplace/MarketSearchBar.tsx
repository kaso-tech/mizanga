import { ArrowLeft, ChevronDown, Clock, LayoutGrid, MapPin, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { suggestedCities } from '../../app/cities'
import type { MarketCatalog } from '../../services/marketplaceApi'
import { Modal } from '../Modal'
import { CATEGORY_ICONS, forgetSearches, readRecentSearches } from './marketUtils'

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Ville de la recherche, en pastille : un toucher ouvre une petite fenêtre pour la changer
 * (les annonces de cette ville passent en premier).
 */
export function CityButton({ city, onChange }: { city?: string; onChange: (city: string | undefined) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(city ?? '')
  const apply = (next: string) => {
    setOpen(false)
    onChange(next.trim() || undefined)
  }
  return (
    <>
      <button type="button" className={`market-city-chip ${city ? 'is-active' : ''}`} aria-label={`Ville : ${city || 'toutes les villes'}. Changer de ville`} onClick={() => { setValue(city ?? ''); setOpen(true) }}>
        <MapPin size={14} aria-hidden="true" /> <span>{city || 'Toutes les villes'}</span> <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <Modal title="Votre ville" onClose={() => setOpen(false)} className="business-dialog market-city-dialog">
          <form onSubmit={(event) => { event.preventDefault(); apply(value) }}>
            <label className="field">
              <span className="field-label">Ma ville</span>
              <input value={value} list="market-cities" autoComplete="address-level2" onChange={(event) => setValue(event.target.value)} placeholder="Ouagadougou, Bobo-Dioulasso…" />
              <datalist id="market-cities">{suggestedCities.map((option) => <option key={option} value={option} />)}</datalist>
            </label>
            <p className="field-hint">Les annonces de votre ville sont montrées en premier.</p>
            <div className="market-filters-actions">
              <button type="button" className="secondary-button" onClick={() => apply('')}>Toutes les villes</button>
              <button type="submit" className="primary-button">Valider</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

/**
 * Barre de recherche de la marketplace, fixée en haut et tenant sur une ligne : retour (pendant une
 * recherche), mots à chercher avec des suggestions pendant la frappe (catégories correspondantes,
 * recherches récentes), puis les raccourcis (favoris, alertes).
 */
export function MarketSearchBar({ initial, catalog, onSearch, onCategory, onBack, children }: {
  initial: { q?: string }
  catalog: MarketCatalog | null
  onSearch: (search: { q?: string }) => void
  onCategory: (categoryId: string) => void
  onBack?: () => void
  children?: ReactNode
}) {
  const [query, setQuery] = useState(initial.q ?? '')
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState(readRecentSearches)
  const closeTimer = useRef<number>()
  // La barre change de page (nouvelle recherche) : le délai de fermeture des suggestions est annulé.
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const typed = plain(query.trim())
  const categories = typed.length >= 2 ? (catalog?.categories ?? []).filter((category) => plain(category.label).includes(typed) || category.subcategories.some((sub) => plain(sub.label).includes(typed))).slice(0, 4) : []
  const recents = recent.filter((item) => !typed || plain(item).includes(typed)).slice(0, 5)
  const showSuggestions = open && (categories.length > 0 || recents.length > 0)

  const submit = (event?: FormEvent, text = query) => {
    event?.preventDefault()
    setOpen(false)
    onSearch({ q: text.trim() || undefined })
  }
  // Effacer une recherche déjà lancée la retire aussi des résultats.
  const clear = () => {
    setQuery('')
    if (initial.q) submit(undefined, '')
  }

  return (
    <form className="market-search" role="search" onSubmit={submit}>
      <div className="market-search-main">
        {onBack && <button type="button" className="icon-button market-search-back" aria-label="Accueil de la marketplace" onClick={onBack}><ArrowLeft size={20} /></button>}
        <label className="market-search-query">
          <span className="visually-hidden">Que cherchez-vous ?</span>
          <input
            type="search"
            value={query}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
            onFocus={() => { window.clearTimeout(closeTimer.current); setRecent(readRecentSearches()); setOpen(true) }}
            onBlur={() => { closeTimer.current = window.setTimeout(() => setOpen(false), 150) }}
            placeholder="Rechercher un produit"
          />
          {query && <button type="button" className="icon-button market-search-clear" aria-label="Effacer la recherche" onClick={clear}><X size={16} /></button>}
          <button type="submit" className="market-search-submit" aria-label="Rechercher"><Search size={18} aria-hidden="true" /></button>
        </label>
        {children}
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
    </form>
  )
}
