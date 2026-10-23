import { AlertTriangle, BadgeCheck, Globe, History, PackagePlus, PawPrint, Pencil, Plus, Search, Sprout, Store, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AccountView } from '../../app/accountView'
import { periodFor, type PeriodPreset } from '../../app/businessPeriods'
import { formatAmount, formatQuantity, stockLevel, stockValue } from '../../app/businessFormat'
import type { ConversationSummary } from '../../domain/types'
import type { AuthClient } from '../../services/authService'
import type { ConversationsApi } from '../../services/conversationsApi'
import { createBusinessApi, type Business, type ListingSubmission, type OwnListing, type Product, type SellerProfile } from '../../services/businessApi'
import { listingStatusLabels } from '../../app/listingStatus'
import { ListingDialog } from './ListingDialog'
import { SellerProfileDialog } from './SellerProfileDialog'
import { AssistantPanel, type OpenRequest } from './AssistantPanel'
import { ExpensesPanel } from './ExpensesPanel'
import { HistoryDialog } from './HistoryDialog'
import { MovementDialog } from './MovementDialog'
import { PeriodPicker } from './PeriodPicker'
import { ProductDialog } from './ProductDialog'
import { ResultsPanel } from './ResultsPanel'
import { SalesPanel } from './SalesPanel'
import { SubscriptionDialog } from './SubscriptionDialog'

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

/** Activités de l’Espace Business : chacune a ses données et son assistant. */
export type BusinessModule = 'commerce' | 'elevage' | 'agriculture'

const modules: Array<{ id: BusinessModule; label: string; icon: LucideIcon }> = [
  { id: 'commerce', label: 'Commerce', icon: Store },
  { id: 'elevage', label: 'Élevage', icon: PawPrint },
  { id: 'agriculture', label: 'Agriculture', icon: Sprout },
]

const upcoming: Record<Exclude<BusinessModule, 'commerce'>, string> = {
  elevage: 'Suivi des troupeaux et des lots (volailles, moutons et chèvres, bovins, porcs) : naissances, achats, ventes, mortalité, alimentation, vaccins et traitements avec rappels, résultats par lot et un assistant dédié.',
  agriculture: 'Suivi des parcelles et des cultures, des travaux, des intrants et des récoltes, avec un assistant dédié.',
}

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
  | { type: 'subscription' }
  | { type: 'seller'; then?: Product }
  | { type: 'listing'; product: Product }
  | null

interface BusinessViewProps {
  account: AccountView
  client: AuthClient | null
  onSignIn: () => void
  onNotify: (message: string, tone?: 'success' | 'info') => void
  /** Conversations des assistants, enregistrées sur le compte. */
  conversations?: ConversationsApi | null
  /** Conversation d’assistant à ouvrir (choisie dans le menu latéral). */
  openConversation?: OpenRequest & { module: BusinessModule }
  onConversationSaved?: (summary: ConversationSummary) => void
  onConversationOpened?: (id: string | null) => void
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
export function BusinessView({ account, client, onSignIn, onNotify, conversations = null, openConversation, onConversationSaved, onConversationOpened }: BusinessViewProps) {
  const api = useMemo(() => (client ? createBusinessApi(() => client.accessToken()) : null), [client])
  const [business, setBusiness] = useState<Business | null | undefined>(undefined)
  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [module, setModule] = useState<BusinessModule>(openConversation?.module ?? 'commerce')
  const [tab, setTab] = useState<Tab>(openConversation?.module === 'commerce' ? 'assistant' : 'products')
  const [preset, setPreset] = useState<PeriodPreset>('today')
  // Marketplace (propriétaire seulement) : vitrine et annonces ; undefined tant que non chargées.
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null | undefined>(undefined)
  const [listings, setListings] = useState<OwnListing[]>([])

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

  // Conversation choisie dans le menu latéral : son onglet s’ouvre.
  const openNonce = openConversation?.nonce
  const openModule = openConversation?.module
  useEffect(() => {
    if (openNonce === undefined || !openModule) return
    setModule(openModule)
    if (openModule === 'commerce') setTab('assistant')
  }, [openNonce, openModule])

  const businessId = business?.id
  const isOwner = business?.role === 'owner'
  useEffect(() => {
    if (!api || !businessId || !isOwner) return
    let cancelled = false
    Promise.all([api.sellerProfile(businessId), api.listListings(businessId)])
      .then(([profile, own]) => {
        if (cancelled) return
        setSellerProfile(profile)
        setListings(own)
      })
      // Marketplace absente de ce serveur : les boutons de publication restent cachés.
      .catch(() => { if (!cancelled) setSellerProfile(undefined) })
    return () => { cancelled = true }
  }, [api, businessId, isOwner])

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
      {business && (
        <div className="segmented business-modules" role="tablist" aria-label="Activités">
          {modules.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={module === id} className={module === id ? 'is-selected' : ''} onClick={() => setModule(id)}>
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      )}
      {business && module !== 'commerce' && (
        <div className="settings-section business-upcoming">
          {module === 'elevage' ? <PawPrint size={28} aria-hidden="true" /> : <Sprout size={28} aria-hidden="true" />}
          <h2>{module === 'elevage' ? 'Élevage' : 'Agriculture'} : bientôt disponible</h2>
          <p>{upcoming[module]}</p>
        </div>
      )}
      <div className="business-module" hidden={Boolean(business) && module !== 'commerce'}>
      {business && api && (
        <div className="business-chips">
          <button type="button" className="subscription-chip" onClick={() => setDialog({ type: 'subscription' })}>
            <BadgeCheck size={14} aria-hidden="true" /> Formule et limites
          </button>
          {isOwner && sellerProfile !== undefined && (
            <button type="button" className="subscription-chip" onClick={() => setDialog({ type: 'seller' })}>
              <Globe size={14} aria-hidden="true" /> {sellerProfile ? 'Ma vitrine' : 'Créer ma vitrine'}
            </button>
          )}
        </div>
      )}
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
      {/* Toujours monté : la conversation et les fiches en attente restent quand on change d’onglet. */}
      {business && api && (
        <div className="assistant-tab" hidden={tab !== 'assistant'}>
          <AssistantPanel
            api={api}
            business={business}
            products={products ?? []}
            onDataChanged={() => loadProducts(business.id)}
            onNotify={onNotify}
            conversations={conversations}
            kind="commerce"
            openRequest={openConversation?.module === 'commerce' ? openConversation : undefined}
            onConversationSaved={onConversationSaved}
            onConversationOpened={onConversationOpened}
          />
        </div>
      )}
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
                const listing = listings.find((item) => item.productId === product.id)
                return (
                  <li key={product.id} className={`product-card is-${level}`}>
                    <div className="product-main">
                      <span className="product-name">{product.name}</span>
                      {level !== 'ok' && (
                        <span className={`stock-badge is-${level}`}><AlertTriangle size={12} aria-hidden="true" /> {level === 'out' ? 'Rupture' : 'Stock bas'}</span>
                      )}
                      {listing && <span className={`listing-badge is-${listing.status}`}>{listingStatusLabels[listing.status]}</span>}
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
                      {isOwner && sellerProfile !== undefined && (
                        <button type="button" className="icon-button" onClick={() => setDialog(sellerProfile ? { type: 'listing', product } : { type: 'seller', then: product })} aria-label={`${listing ? 'Annonce' : 'Publier sur la marketplace'} : ${product.name}`} title={listing ? 'Annonce sur la marketplace' : 'Publier sur la marketplace'}><Globe size={16} /></button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
      </div>

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
      {business && api && dialog?.type === 'seller' && (
        <SellerProfileDialog
          profile={sellerProfile ?? null}
          defaultName={business.name}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            setSellerProfile(await api.saveSellerProfile(business.id, input))
            onNotify('Vitrine enregistrée.', 'success')
            setDialog(dialog.then ? { type: 'listing', product: dialog.then } : null)
          }}
        />
      )}
      {business && api && dialog?.type === 'listing' && (
        <ListingDialog
          product={dialog.product}
          listing={listings.find((item) => item.productId === dialog.product.id) ?? null}
          currency={currency}
          onClose={() => setDialog(null)}
          onSubmit={async (input: ListingSubmission) => {
            const { listing, moderation } = await api.submitListing(business.id, input)
            setListings((current) => [listing, ...current.filter((item) => item.id !== listing.id)])
            setDialog(null)
            onNotify(
              listing.status === 'published' ? 'Annonce publiée sur la marketplace.'
                : listing.status === 'review' ? 'Annonce en cours de vérification par l’équipe Gilli.'
                  : moderation === 'unavailable' ? 'Annonce enregistrée : elle sera publiée après vérification.' : 'Annonce enregistrée.',
              listing.status === 'published' ? 'success' : 'info',
            )
          }}
          onWithdraw={async () => {
            const current = listings.find((item) => item.productId === dialog.product.id)
            if (!current) return
            const withdrawn = await api.withdrawListing(business.id, current.id)
            setListings((items) => items.map((item) => (item.id === withdrawn.id ? withdrawn : item)))
            setDialog(null)
            onNotify('Annonce retirée de la marketplace.', 'success')
          }}
        />
      )}
      {business && api && dialog?.type === 'subscription' && (
        <SubscriptionDialog load={() => api.subscription(business.id)} onClose={() => setDialog(null)} />
      )}
      {business && api && dialog?.type === 'history' && (
        <HistoryDialog product={dialog.product} currency={currency} load={() => api.listMovements(business.id, dialog.product.id)} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
