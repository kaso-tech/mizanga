import { Bell, LayoutGrid, List, PackageSearch, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { addAlert, describeFilters } from '../../app/marketSaved'
import { formatPrice, marketplaceApi, type ListingCard, type MarketCatalog, type SearchFilters } from '../../services/marketplaceApi'
import { Modal } from '../Modal'
import { CardSkeletons, ListingCardView } from './MarketCards'
import { readViewMode, saveViewMode, SORTS, useWideLayout, type Notify, type ViewMode } from './marketUtils'

/** Nombre de filtres du panneau « Filtres » (prix, état, vendeurs vérifiés, caractéristiques). */
const countFilters = (filters: SearchFilters) => [filters.minPrice, filters.condition, filters.verified].filter((value) => value !== undefined).length + Object.keys(filters.attributes ?? {}).length

/** Panneau « Filtres » : prix, état, vendeurs vérifiés et caractéristiques de la catégorie choisie. */
function FiltersPanel({ filters, catalog, onApply }: { filters: SearchFilters; catalog: MarketCatalog | null; onApply: (filters: SearchFilters) => void }) {
  const category = catalog?.categories.find((item) => item.id === filters.category)
  const [minPrice, setMinPrice] = useState(filters.minPrice !== undefined ? String(filters.minPrice) : '')
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice !== undefined ? String(filters.maxPrice) : '')
  const [condition, setCondition] = useState(filters.condition ?? '')
  const [verified, setVerified] = useState(filters.verified === '1')
  const [attributes, setAttributes] = useState<Record<string, string>>(filters.attributes ?? {})
  const setAttribute = (key: string, value: string) => setAttributes((current) => {
    const next = { ...current }
    if (value) next[key] = value
    else delete next[key]
    return next
  })
  const amount = (value: string) => (/^\d+$/.test(value.replace(/\s/g, '')) ? Number(value.replace(/\s/g, '')) : undefined)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const kept = Object.fromEntries(Object.entries(attributes).filter(([key]) => category?.attributes?.some((attribute) => attribute.key === key)))
    onApply({ ...filters, minPrice: amount(minPrice), maxPrice: amount(maxPrice), condition: condition || undefined, verified: verified ? '1' : undefined, attributes: Object.keys(kept).length ? kept : undefined })
  }
  return (
    <form className="market-filters-panel" aria-label="Filtres" onSubmit={submit}>
      <div className="field-pair">
        <label className="field"><span className="field-label">Prix minimum (F)</span><input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></label>
        <label className="field"><span className="field-label">Prix maximum (F)</span><input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></label>
      </div>
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
        <button type="button" className="secondary-button" onClick={() => onApply({ ...filters, minPrice: undefined, maxPrice: undefined, condition: undefined, verified: undefined, attributes: undefined })}>Effacer les filtres</button>
        <button type="submit" className="primary-button">Appliquer</button>
      </div>
    </form>
  )
}

/** Filtres actifs, en pastilles qu’on retire d’un toucher. */
function ActiveFilters({ filters, catalog, onChange }: { filters: SearchFilters; catalog: MarketCatalog | null; onChange: (filters: SearchFilters) => void }) {
  const category = catalog?.categories.find((item) => item.id === filters.category)
  const chips: Array<{ label: string; remove: () => SearchFilters }> = []
  if (filters.q) chips.push({ label: `« ${filters.q} »`, remove: () => ({ ...filters, q: undefined }) })
  if (category) chips.push({ label: category.label, remove: () => ({ ...filters, category: undefined, subcategory: undefined, attributes: undefined }) })
  const sub = category?.subcategories.find((item) => item.id === filters.subcategory)
  if (sub) chips.push({ label: sub.label, remove: () => ({ ...filters, subcategory: undefined }) })
  if (filters.minPrice !== undefined) chips.push({ label: `Dès ${formatPrice(filters.minPrice)}`, remove: () => ({ ...filters, minPrice: undefined }) })
  if (filters.maxPrice !== undefined) chips.push({ label: `Jusqu’à ${formatPrice(filters.maxPrice)}`, remove: () => ({ ...filters, maxPrice: undefined }) })
  if (filters.condition) chips.push({ label: catalog?.conditions[filters.condition] ?? filters.condition, remove: () => ({ ...filters, condition: undefined }) })
  if (filters.verified === '1') chips.push({ label: 'Vendeurs vérifiés', remove: () => ({ ...filters, verified: undefined }) })
  for (const [key, value] of Object.entries(filters.attributes ?? {})) {
    const attribute = category?.attributes?.find((item) => item.key === key)
    const label = attribute ? (attribute.type === 'boolean' ? attribute.label : attribute.type === 'number' ? `${attribute.label} ≥ ${value}${attribute.unit ? ` ${attribute.unit}` : ''}` : `${attribute.label} : ${value}`) : `${key} : ${value}`
    chips.push({ label, remove: () => { const next = { ...(filters.attributes ?? {}) }; delete next[key]; return { ...filters, attributes: Object.keys(next).length ? next : undefined } } })
  }
  if (chips.length === 0) return null
  return (
    <ul className="market-chips" aria-label="Filtres actifs">
      {chips.map((chip) => (
        <li key={chip.label}><button type="button" className="market-chip" aria-label={`Retirer le filtre : ${chip.label}`} onClick={() => onChange(chip.remove())}>{chip.label} <X size={13} aria-hidden="true" /></button></li>
      ))}
      {chips.length > 1 && <li><button type="button" className="text-button" onClick={() => onChange({ city: filters.city })}>Tout effacer</button></li>}
    </ul>
  )
}

/** Résultats d’une recherche : catégories, filtres, tri, affichage en grille ou en liste, alerte. */
export function MarketResults({ filters, newSince, catalog, onSearch, onOpen, onNotify }: {
  filters: SearchFilters
  newSince?: string
  catalog: MarketCatalog | null
  onSearch: (filters: SearchFilters) => void
  onOpen: (id: string) => void
  onNotify: Notify
}) {
  const [results, setResults] = useState<{ total: number; items: ListingCard[]; sponsored?: ListingCard[] } | null>(null)
  const [page, setPage] = useState(1)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [view, setView] = useState<ViewMode>(readViewMode)
  const [error, setError] = useState('')
  const wide = useWideLayout()
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
  const createAlert = () => {
    const result = addAlert(filters, describeFilters(filters, category?.label))
    onNotify(result === 'added' ? 'Alerte créée : les nouvelles annonces vous seront signalées dans l’onglet Alertes.' : result === 'exists' ? 'Vous suivez déjà cette recherche.' : 'Vous avez déjà 10 alertes : supprimez-en une d’abord.', result === 'added' ? 'success' : 'info')
  }
  const changeView = (mode: ViewMode) => {
    setView(mode)
    saveViewMode(mode)
  }
  const panel = <FiltersPanel key={JSON.stringify(filters)} filters={filters} catalog={catalog} onApply={(next) => { setShowFilters(false); onSearch(next) }} />

  return (
    <div className={`market-results ${wide ? 'is-wide' : ''}`}>
      {wide && <aside className="market-filters-aside" aria-label="Affiner la recherche">{panel}</aside>}
      <div className="market-results-main">
        <nav className="market-categories" aria-label="Catégories">
          <button type="button" className={`saved-prompt-chip ${!filters.category ? 'is-active' : ''}`} aria-pressed={!filters.category} onClick={() => onSearch({ ...filters, category: undefined, subcategory: undefined, attributes: undefined })}>Toutes</button>
          {catalog?.categories.map((item) => (
            <button key={item.id} type="button" className={`saved-prompt-chip ${filters.category === item.id ? 'is-active' : ''}`} aria-pressed={filters.category === item.id} onClick={() => onSearch({ ...filters, category: item.id, subcategory: undefined, attributes: undefined })}>{item.label}</button>
          ))}
        </nav>
        {category && (
          <nav className="market-categories is-sub" aria-label="Sous-catégories">
            {category.subcategories.map((item) => (
              <button key={item.id} type="button" className={`saved-prompt-chip ${filters.subcategory === item.id ? 'is-active' : ''}`} aria-pressed={filters.subcategory === item.id} onClick={() => onSearch({ ...filters, subcategory: filters.subcategory === item.id ? undefined : item.id })}>{item.label}</button>
            ))}
          </nav>
        )}

        <div className="market-toolbar">
          <label className="field">
            <span className="visually-hidden">Trier</span>
            <select aria-label="Trier" value={filters.sort ?? 'relevance'} onChange={(event) => onSearch({ ...filters, sort: event.target.value === 'relevance' ? undefined : event.target.value })}>
              {Object.entries(SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {!wide && (
            <button type="button" className={`secondary-button ${activeFilters ? 'is-active' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters(true)}>
              <SlidersHorizontal size={16} aria-hidden="true" /> Filtres{activeFilters ? ` (${activeFilters})` : ''}
            </button>
          )}
          <div className="market-view-toggle" role="group" aria-label="Affichage">
            <button type="button" className={`icon-button ${view === 'grid' ? 'is-active' : ''}`} aria-pressed={view === 'grid'} aria-label="Affichage en grille" onClick={() => changeView('grid')}><LayoutGrid size={18} /></button>
            <button type="button" className={`icon-button ${view === 'list' ? 'is-active' : ''}`} aria-pressed={view === 'list'} aria-label="Affichage en liste" onClick={() => changeView('list')}><List size={18} /></button>
          </div>
        </div>
        <ActiveFilters filters={filters} catalog={catalog} onChange={onSearch} />
        {showFilters && !wide && <Modal title="Filtres" onClose={() => setShowFilters(false)} className="business-dialog market-filters-sheet">{panel}</Modal>}

        {error && <p className="message-error" role="alert">{error}</p>}
        {!results && !error && <CardSkeletons />}
        {results && (
          <>
            <div className="market-count-row">
              <p className="market-count" aria-live="polite">
                {results.total === 0 ? 'Aucune annonce ne correspond pour le moment.' : `${results.total} annonce${results.total > 1 ? 's' : ''}`}
                {filters.city && results.total > 0 && (filters.sort ?? 'relevance') === 'relevance' && ` · d’abord à ${filters.city}`}
              </p>
              <button type="button" className="text-button" onClick={createAlert}><Bell size={14} aria-hidden="true" /> Créer une alerte</button>
            </div>
            {(results.sponsored ?? []).length > 0 && (
              <section className="market-sponsored-block" aria-label="Annonces sponsorisées">
                <p className="market-sponsored-note">Sponsorisé · les vendeurs paient pour cette mise en avant ; le classement des résultats n’en tient pas compte.</p>
                <ul className={view === 'list' ? 'market-list' : 'market-grid'}>
                  {(results.sponsored ?? []).map((item) => <ListingCardView key={item.id} item={item} catalog={catalog} onOpen={() => onOpen(item.id)} onNotify={onNotify} sponsored />)}
                </ul>
              </section>
            )}
            {results.items.length > 0 ? (
              <ul className={view === 'list' ? 'market-list' : 'market-grid'} aria-label="Annonces">
                {results.items.map((item) => <ListingCardView key={item.id} item={item} catalog={catalog} onOpen={() => onOpen(item.id)} onNotify={onNotify} isNew={Boolean(newSince && Date.parse(item.publishedAt) > Date.parse(newSince))} />)}
              </ul>
            ) : (
              <p className="market-empty"><PackageSearch size={20} aria-hidden="true" /> Essayez avec moins de filtres, un autre mot ou un budget plus large. Vous pouvez aussi créer une alerte : Gilli vous préviendra dès qu’une annonce correspond.</p>
            )}
            {results.items.length < results.total && (
              <button type="button" className="secondary-button is-block market-more" disabled={isLoadingMore} onClick={() => void loadMore()}>
                {isLoadingMore ? 'Chargement…' : `Voir plus d’annonces (${results.total - results.items.length} de plus)`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
