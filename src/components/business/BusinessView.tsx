import { AlertTriangle, History, PackagePlus, Pencil, Plus, Search, Store } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AccountView } from '../../app/accountView'
import { periodFor, type PeriodPreset } from '../../app/businessPeriods'
import { formatAmount, formatQuantity, stockLevel, stockValue } from '../../app/businessFormat'
import type { AuthClient } from '../../services/authService'
import { createBusinessApi, type Business, type Product } from '../../services/businessApi'
import { AssistantPanel } from './AssistantPanel'
import { ExpensesPanel } from './ExpensesPanel'
import { HistoryDialog } from './HistoryDialog'
import { MovementDialog } from './MovementDialog'
import { PeriodPicker } from './PeriodPicker'
import { ProductDialog } from './ProductDialog'
import { ResultsPanel } from './ResultsPanel'
import { SalesPanel } from './SalesPanel'

/** Pays de la zone UEMOA (franc CFA, XOF) proposés à la création ; d’autres pays suivront. */
const countries: Array<{ code: string; name: string }> = [
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BJ', name: 'Bénin' },
  { code: 'CI', name: 'Côte d’Ivoire' },
  { code: 'GW', name: 'Guinée-Bissau' },
  { code: 'ML', name: 'Mali' },
  { code: 'NE', name: 'Niger' },
  { code: 'SN', name: 'Sénégal' },
  { code: 'TG', name: 'Togo' },
]

type Tab = 'products' | 'sales' | 'expenses' | 'results' | 'assistant'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'products', label: 'Produits' },
  { id: 'sales', label: 'Ventes' },
  { id: 'expenses', label: 'Dépenses' },
  { id: 'results', label: 'Résultats' },
  { id: 'assistant', label: 'Assistant' },
]

type DialogState =
  | { type: 'create' }
  | { type: 'edit'; product: Product }
  | { type: 'movement'; product: Product }
  | { type: 'history'; product: Product }
  | null

interface BusinessViewProps {
  account: AccountView
  client: AuthClient | null
  onSignIn: () => void
  onNotify: (message: string, tone?: 'success' | 'info') => void
}

function BusinessSetup({ onCreate }: { onCreate: (input: { name: string; countryCode: string }) => Promise<void> }) {
  const [name, setName] = useState('')
  const [countryCode, setCountryCode] = useState('BF')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('Indiquez le nom de votre commerce.')
    setIsSaving(true)
    setError('')
    try {
      await onCreate({ name: name.trim(), countryCode })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La création a échoué.')
      setIsSaving(false)
    }
  }
  return (
    <form className="settings-section business-setup" onSubmit={(event) => void submit(event)}>
      <h2>Créer votre commerce</h2>
      <label className="field">
        <span className="field-label">Nom du commerce</span>
        <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Par exemple : Boutique Awa" />
      </label>
      <label className="field">
        <span className="field-label">Pays</span>
        <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
          {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
        </select>
      </label>
      <p className="field-hint">Les montants sont en francs CFA (XOF).</p>
      {error && <p className="message-error" role="alert">{error}</p>}
      <button type="submit" className="primary-button is-block" disabled={isSaving}>Créer</button>
    </form>
  )
}

/** Espace Business : produits et stocks, ventes, dépenses et résultats du commerce de l’utilisateur. */
export function BusinessView({ account, client, onSignIn, onNotify }: BusinessViewProps) {
  const api = useMemo(() => (client ? createBusinessApi(() => client.accessToken()) : null), [client])
  const [business, setBusiness] = useState<Business | null | undefined>(undefined)
  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [tab, setTab] = useState<Tab>('products')
  const [preset, setPreset] = useState<PeriodPreset>('today')

  const loadProducts = useCallback(async (businessId: string) => {
    if (!api) return
    setProducts(await api.listProducts(businessId))
  }, [api])

  useEffect(() => {
    if (!api || account.status !== 'signedIn') return
    let cancelled = false
    setError('')
    api.listBusinesses()
      .then(async (businesses) => {
        if (cancelled) return
        const first = businesses[0] ?? null
        setBusiness(first)
        if (first) setProducts(await api.listProducts(first.id))
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Chargement impossible.') })
    return () => { cancelled = true }
  }, [api, account.status])

  if (account.status === 'unavailable') {
    return <div className="page-view business-view"><h1>Espace Business</h1><p className="settings-callout"><Store size={16} aria-hidden="true" /><span>L’espace Business demande un compte : il n’est pas encore disponible sur ce serveur.</span></p></div>
  }
  if (account.status === 'loading') return <div className="page-loading" aria-busy="true" />
  if (account.status === 'signedOut') {
    return (
      <div className="page-view business-view">
        <h1>Espace Business</h1>
        <div className="settings-section business-welcome">
          <Store size={28} aria-hidden="true" />
          <p>Gérez vos produits et votre stock, enregistrez ventes et dépenses, et posez vos questions à l’assistant.</p>
          <button type="button" className="primary-button" onClick={onSignIn}>Se connecter</button>
        </div>
      </div>
    )
  }

  const currency = business?.currency ?? 'XOF'
  const normalizedQuery = query.trim().toLocaleLowerCase('fr')
  const lowCount = (products ?? []).filter((product) => stockLevel(product) !== 'ok').length
  const visible = (products ?? []).filter((product) => (
    (!onlyLow || stockLevel(product) !== 'ok') && (!normalizedQuery || `${product.name} ${product.sku ?? ''}`.toLocaleLowerCase('fr').includes(normalizedQuery))
  ))

  /** Exécute une opération puis recharge les produits ; l’erreur reste affichée dans la fenêtre. */
  const mutate = async (action: () => Promise<unknown>, success: string) => {
    if (!business) return
    await action()
    setDialog(null)
    onNotify(success, 'success')
    await loadProducts(business.id).catch(() => onNotify('La liste n’a pas pu être actualisée. Rechargez la page.'))
  }

  return (
    <div className="page-view business-view">
      <h1>{business?.name ?? 'Espace Business'}</h1>
      {error && <p className="message-error" role="alert">{error}</p>}
      {business === undefined && !error && <div className="page-loading" aria-busy="true" />}
      {business === null && api && (
        <BusinessSetup onCreate={async (input) => {
          const created = await api.createBusiness(input)
          setBusiness(created)
          setProducts([])
          onNotify('Votre commerce est créé. Ajoutez vos produits.', 'success')
        }} />
      )}

      {business && products && api && (
        <div className="segmented business-tabs" role="tablist" aria-label="Sections de l’espace Business">
          {tabs.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'is-selected' : ''} onClick={() => setTab(item.id)}>{item.label}</button>
          ))}
        </div>
      )}
      {business && api && tab === 'assistant' && <AssistantPanel api={api} business={business} />}
      {business && products && api && tab !== 'products' && tab !== 'assistant' && (() => {
        const period = periodFor(preset, business.timezone)
        const picker = <PeriodPicker preset={preset} period={period} onChange={setPreset} />
        if (tab === 'sales') return <SalesPanel api={api} business={business} products={products} period={period} picker={picker} onNotify={onNotify} onStockChanged={() => loadProducts(business.id)} />
        if (tab === 'expenses') return <ExpensesPanel api={api} business={business} period={period} picker={picker} onNotify={onNotify} />
        return <ResultsPanel api={api} business={business} period={period} picker={picker} />
      })()}

      {business && products && tab === 'products' && (
        <>
          <div className="admin-stats business-stats">
            <div className="admin-stat"><span className="admin-stat-value">{products.length}</span><span className="admin-stat-label">Produits</span></div>
            <button type="button" className={`admin-stat stat-button ${onlyLow ? 'is-active' : ''}`} aria-pressed={onlyLow} onClick={() => setOnlyLow((value) => !value)}>
              <span className="admin-stat-value">{lowCount}</span><span className="admin-stat-label">À réapprovisionner</span>
            </button>
            <div className="admin-stat"><span className="admin-stat-value">{formatAmount(stockValue(products), currency)}</span><span className="admin-stat-label">Valeur du stock (prix d’achat)</span></div>
          </div>

          <div className="business-toolbar">
            <label className="sidebar-search business-search">
              <Search size={16} aria-hidden="true" />
              <span className="visually-hidden">Rechercher un produit</span>
              <input type="search" value={query} placeholder="Rechercher un produit" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <button type="button" className="primary-button" onClick={() => setDialog({ type: 'create' })}><Plus size={16} aria-hidden="true" /> Ajouter un produit</button>
          </div>

          {products.length === 0 ? (
            <div className="settings-section business-empty">
              <PackagePlus size={28} aria-hidden="true" />
              <p>Ajoutez votre premier produit avec son prix d’achat, son prix de vente et le stock disponible.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="conversation-empty">Aucun produit ne correspond.</p>
          ) : (
            <ul className="product-list" aria-label="Produits">
              {visible.map((product) => {
                const level = stockLevel(product)
                return (
                  <li key={product.id} className={`product-card is-${level}`}>
                    <div className="product-main">
                      <span className="product-name">{product.name}</span>
                      {level !== 'ok' && (
                        <span className={`stock-badge is-${level}`}><AlertTriangle size={12} aria-hidden="true" /> {level === 'out' ? 'Rupture' : 'Stock bas'}</span>
                      )}
                    </div>
                    <div className="product-figures">
                      <span><strong>{formatQuantity(product.quantity)}</strong> {product.unit}</span>
                      <span>Vente : {formatAmount(product.salePrice, currency)}</span>
                      <span>Achat : {formatAmount(product.purchasePrice, currency)}</span>
                    </div>
                    <div className="product-actions">
                      <button type="button" className="secondary-button" onClick={() => setDialog({ type: 'movement', product })} aria-label={`Mouvement de stock pour ${product.name}`}><PackagePlus size={14} aria-hidden="true" /> Stock</button>
                      <button type="button" className="icon-button" onClick={() => setDialog({ type: 'history', product })} aria-label={`Historique de ${product.name}`} title="Historique"><History size={16} /></button>
                      <button type="button" className="icon-button" onClick={() => setDialog({ type: 'edit', product })} aria-label={`Modifier ${product.name}`} title="Modifier"><Pencil size={16} /></button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {business && api && dialog?.type === 'create' && (
        <ProductDialog currency={currency} onClose={() => setDialog(null)} onSave={(input) => mutate(() => api.createProduct(business.id, input), 'Produit ajouté.')} />
      )}
      {business && api && dialog?.type === 'edit' && (
        <ProductDialog
          product={dialog.product}
          currency={currency}
          onClose={() => setDialog(null)}
          onSave={(input) => mutate(() => api.updateProduct(business.id, dialog.product.id, input), 'Produit modifié.')}
          onArchive={() => mutate(() => api.updateProduct(business.id, dialog.product.id, { archived: true }), 'Produit archivé.')}
        />
      )}
      {business && api && dialog?.type === 'movement' && (
        <MovementDialog product={dialog.product} onClose={() => setDialog(null)} onSave={(input) => mutate(() => api.recordMovement(business.id, dialog.product.id, input), 'Stock mis à jour.')} />
      )}
      {business && api && dialog?.type === 'history' && (
        <HistoryDialog product={dialog.product} currency={currency} load={() => api.listMovements(business.id, dialog.product.id)} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
