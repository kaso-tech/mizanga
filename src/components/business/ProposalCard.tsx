import { Ban, Check, PackagePlus, Receipt, Repeat, ShoppingCart, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { localDay } from '../../app/businessPeriods'
import { formatAmount, formatQuantity, parseAmount, parseQuantity } from '../../app/businessFormat'
import { expenseCategories } from '../../app/expenseCategories'
import type { AssistantProposal, Business, BusinessApi, MovementInput, Product, SaleInput } from '../../services/businessApi'

export type ProposalStatus = 'pending' | 'saving' | 'done' | 'dismissed'

const kindLabels: Record<string, string> = { purchase: 'Achat / entrée', return: 'Retour client', loss: 'Perte', count: 'Inventaire' }
const field = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

interface CardProps<P extends AssistantProposal> {
  proposal: P
  status: ProposalStatus
  /** Phrase affichée une fois la fiche enregistrée. */
  result?: string
  api: BusinessApi
  business: Business
  products: Product[]
  /** Enregistre (`save` renvoie la phrase de confirmation) ; une erreur reste affichée dans la fiche. */
  onConfirm: (save: () => Promise<string>) => Promise<void>
  onDismiss: () => void
}

/** Cadre commun : titre, état, champs (verrouillés une fois la fiche traitée), erreur et boutons. */
function ProposalFrame({ title, icon, status, result, confirmLabel = 'Confirmer et enregistrer', blocked, onSubmit, onDismiss, children }: {
  title: string
  icon: ReactNode
  status: ProposalStatus
  result?: string
  confirmLabel?: string
  /** Raison pour laquelle la fiche ne peut pas être confirmée (ex. réservé au propriétaire). */
  blocked?: string
  onSubmit: () => Promise<string | void>
  onDismiss: () => void
  children: ReactNode
}) {
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const problem = await onSubmit()
      if (problem) setError(problem)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
    }
  }
  return (
    <form className={`proposal-card is-${status}`} aria-label={`Fiche à vérifier : ${title}`} onSubmit={(event) => void submit(event)}>
      <p className="proposal-title">
        {icon}
        <strong>{title}</strong>
        <span className="proposal-status">{status === 'done' ? 'Enregistré' : status === 'dismissed' ? 'Ignoré' : 'À vérifier'}</span>
      </p>
      <fieldset disabled={status !== 'pending'}>{children}</fieldset>
      {error && <p className="message-error" role="alert">{error}</p>}
      {blocked && status === 'pending' && <p className="field-hint">{blocked}</p>}
      {status === 'done' && result && <p className="proposal-result"><Check size={14} aria-hidden="true" /> {result}</p>}
      {(status === 'pending' || status === 'saving') && (
        <div className="proposal-actions">
          <button type="button" className="secondary-button" onClick={onDismiss} disabled={status === 'saving'}><X size={14} aria-hidden="true" /> Ignorer</button>
          <button type="submit" className="primary-button" disabled={status === 'saving' || Boolean(blocked)}><Check size={14} aria-hidden="true" /> {confirmLabel}</button>
        </div>
      )}
    </form>
  )
}

const currencyLabel = (currency: string) => (currency === 'XOF' ? 'F CFA' : currency)

function ProductProposalCard({ proposal, status, result, api, business, onConfirm, onDismiss }: CardProps<Extract<AssistantProposal, { action: 'create_product' }>>) {
  const values = proposal.values
  const [name, setName] = useState(values.name)
  const [unit, setUnit] = useState(values.unit ?? 'pièce')
  const [purchasePrice, setPurchasePrice] = useState(field(values.purchasePrice))
  const [salePrice, setSalePrice] = useState(field(values.salePrice))
  const [initialQuantity, setInitialQuantity] = useState(field(values.initialQuantity))
  const [alertThreshold, setAlertThreshold] = useState(field(values.alertThreshold))
  const submit = async () => {
    const parsed = { purchase: parseAmount(purchasePrice), sale: parseAmount(salePrice), initial: parseQuantity(initialQuantity), threshold: parseQuantity(alertThreshold) }
    if (!name.trim()) return 'Indiquez le nom du produit.'
    if (parsed.purchase === null || parsed.sale === null) return 'Les prix sont des montants entiers, sans centimes.'
    if (parsed.initial === null || parsed.threshold === null) return 'Les quantités sont des nombres positifs (trois décimales au plus).'
    await onConfirm(async () => {
      const created = await api.createProduct(business.id, { name: name.trim(), unit: unit.trim() || 'pièce', purchasePrice: parsed.purchase as number, salePrice: parsed.sale as number, initialQuantity: parsed.initial as number, alertThreshold: parsed.threshold as number })
      return `Produit « ${created.name} » enregistré.`
    })
  }
  const money = currencyLabel(business.currency)
  return (
    <ProposalFrame title="Nouveau produit" icon={<PackagePlus size={16} aria-hidden="true" />} status={status} result={result} onSubmit={submit} onDismiss={onDismiss}>
      <label className="field"><span className="field-label">Nom</span><input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
      <div className="field-pair">
        <label className="field"><span className="field-label">Unité</span><input value={unit} maxLength={24} onChange={(event) => setUnit(event.target.value)} /></label>
        <label className="field"><span className="field-label">Stock initial</span><input inputMode="decimal" value={initialQuantity} placeholder="À compléter" onChange={(event) => setInitialQuantity(event.target.value)} /></label>
      </div>
      <div className="field-pair">
        <label className="field"><span className="field-label">Prix d’achat ({money})</span><input inputMode="numeric" value={purchasePrice} placeholder="À compléter" onChange={(event) => setPurchasePrice(event.target.value)} /></label>
        <label className="field"><span className="field-label">Prix de vente ({money})</span><input inputMode="numeric" value={salePrice} placeholder="À compléter" onChange={(event) => setSalePrice(event.target.value)} /></label>
      </div>
      <label className="field"><span className="field-label">Seuil d’alerte (facultatif)</span><input inputMode="decimal" value={alertThreshold} placeholder="0" onChange={(event) => setAlertThreshold(event.target.value)} /></label>
    </ProposalFrame>
  )
}

function MovementProposalCard({ proposal, status, result, api, business, products, onConfirm, onDismiss }: CardProps<Extract<AssistantProposal, { action: 'stock_movement' }>>) {
  const values = proposal.values
  const [productId, setProductId] = useState(values.productId ?? '')
  const [kind, setKind] = useState<string>(values.kind)
  const [quantity, setQuantity] = useState(field(values.quantity))
  const [unitCost, setUnitCost] = useState(field(values.unitCost))
  const [note, setNote] = useState(values.note ?? '')
  const chosen = products.find((candidate) => candidate.id === productId)
  const submit = async () => {
    if (!chosen) return 'Choisissez le produit concerné.'
    const value = parseQuantity(quantity)
    if (value === null || (kind !== 'count' && value === 0)) return 'Indiquez une quantité positive (par exemple 2,5).'
    // Inventaire : la quantité comptée devient une correction de l’écart avec le stock enregistré.
    const delta = kind === 'count' ? Math.round((value - chosen.quantity) * 1000) / 1000 : value
    if (kind === 'count' && delta === 0) return 'Aucun écart avec le stock enregistré : rien à corriger.'
    const cost = kind === 'purchase' && unitCost.trim() ? parseAmount(unitCost) : null
    if (kind === 'purchase' && unitCost.trim() && cost === null) return 'Le coût est un montant entier, sans centimes.'
    const input: MovementInput = {
      kind: kind === 'count' ? 'adjustment' : kind as MovementInput['kind'],
      quantity: delta,
      unitCost: cost,
      note: note.trim() || (kind === 'count' ? `Inventaire : ${formatQuantity(value)} compté(s)` : null),
    }
    await onConfirm(async () => {
      await api.recordMovement(business.id, chosen.id, input)
      return `Stock de « ${chosen.name} » mis à jour.`
    })
  }
  return (
    <ProposalFrame title="Mouvement de stock" icon={<Repeat size={16} aria-hidden="true" />} status={status} result={result} onSubmit={submit} onDismiss={onDismiss}>
      <label className="field">
        <span className="field-label">Produit</span>
        <select value={productId} onChange={(event) => setProductId(event.target.value)}>
          <option value="">{values.productName ? `« ${values.productName} » : choisir…` : 'Choisir…'}</option>
          {products.map((option) => <option key={option.id} value={option.id}>{option.name} ({formatQuantity(option.quantity)} {option.unit})</option>)}
        </select>
      </label>
      <div className="field-pair">
        <label className="field">
          <span className="field-label">Type</span>
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">{kind === 'count' ? 'Quantité comptée' : 'Quantité'}{chosen ? ` (${chosen.unit})` : ''}</span><input inputMode="decimal" value={quantity} placeholder="À compléter" onChange={(event) => setQuantity(event.target.value)} /></label>
      </div>
      {kind === 'purchase' && <label className="field"><span className="field-label">Coût unitaire (facultatif)</span><input inputMode="numeric" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label>}
      <label className="field"><span className="field-label">Note (facultatif)</span><input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /></label>
    </ProposalFrame>
  )
}

interface SaleLine { key: number; productId: string; quantity: string; price: string }

function SaleProposalCard({ proposal, status, result, api, business, products, onConfirm, onDismiss }: CardProps<Extract<AssistantProposal, { action: 'sale' }>>) {
  const values = proposal.values
  const productOf = (id: string) => products.find((product) => product.id === id)
  // Sans prix donné par le commerçant, le prix de vente habituel du produit est proposé.
  const [lines, setLines] = useState<SaleLine[]>(() => values.items.map((item, index) => ({
    key: index,
    productId: item.productId ?? '',
    quantity: field(item.quantity),
    price: field(item.unitPrice ?? (item.productId ? productOf(item.productId)?.salePrice ?? null : null)),
  })))
  const [customerName, setCustomerName] = useState(values.customerName ?? '')
  const update = (key: number, change: Partial<SaleLine>) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)))
  const totalOf = (line: SaleLine) => {
    const quantity = parseQuantity(line.quantity)
    const price = parseAmount(line.price)
    return line.productId && quantity && price !== null ? Math.round(quantity * price) : 0
  }
  const total = lines.reduce((sum, line) => sum + totalOf(line), 0)
  const submit = async () => {
    if (lines.some((line) => !line.productId)) return 'Choisissez le produit de chaque ligne (ou ignorez la fiche).'
    if (new Set(lines.map((line) => line.productId)).size !== lines.length) return 'Un même produit apparaît deux fois : regroupez les quantités.'
    const items: SaleInput['items'] = []
    for (const line of lines) {
      const product = productOf(line.productId) as Product
      const quantity = parseQuantity(line.quantity)
      const price = parseAmount(line.price)
      if (!quantity) return `Indiquez une quantité positive pour « ${product.name} ».`
      if (price === null || !line.price.trim()) return `Indiquez le prix de « ${product.name} » (montant entier, sans centimes).`
      if (quantity > product.quantity) return `Stock insuffisant pour « ${product.name} » : il reste ${formatQuantity(product.quantity)} ${product.unit}.`
      items.push({ productId: product.id, quantity, unitPrice: price })
    }
    await onConfirm(async () => {
      const sale = await api.recordSale(business.id, { items, customerName: customerName.trim() || null, note: values.note })
      return `Vente de ${formatAmount(sale.totalAmount, business.currency)} enregistrée.`
    })
  }
  return (
    <ProposalFrame title="Vente" icon={<ShoppingCart size={16} aria-hidden="true" />} status={status} result={result} onSubmit={submit} onDismiss={onDismiss}>
      {lines.map((line, index) => {
        const product = productOf(line.productId)
        const asked = values.items[index]?.productName
        return (
          <div key={line.key} className="proposal-line">
            <label className="field">
              <span className="field-label">Produit {index + 1}</span>
              <select value={line.productId} onChange={(event) => update(line.key, { productId: event.target.value, price: line.price || field(productOf(event.target.value)?.salePrice ?? null) })}>
                <option value="">{asked ? `« ${asked} » : choisir…` : 'Choisir…'}</option>
                {products.map((option) => <option key={option.id} value={option.id}>{option.name} ({formatQuantity(option.quantity)} {option.unit})</option>)}
              </select>
            </label>
            <div className="field-pair">
              <label className="field"><span className="field-label">Quantité{product ? ` (${product.unit})` : ''}<span className="visually-hidden"> {index + 1}</span></span><input inputMode="decimal" value={line.quantity} placeholder="À compléter" onChange={(event) => update(line.key, { quantity: event.target.value })} /></label>
              <label className="field"><span className="field-label">Prix unitaire<span className="visually-hidden"> {index + 1}</span></span><input inputMode="numeric" value={line.price} placeholder="À compléter" onChange={(event) => update(line.key, { price: event.target.value })} /></label>
            </div>
          </div>
        )
      })}
      <label className="field"><span className="field-label">Client (facultatif)</span><input value={customerName} maxLength={120} onChange={(event) => setCustomerName(event.target.value)} /></label>
      <p className="sale-total">Total : <strong>{formatAmount(total, business.currency)}</strong></p>
    </ProposalFrame>
  )
}

function ExpenseProposalCard({ proposal, status, result, api, business, onConfirm, onDismiss }: CardProps<Extract<AssistantProposal, { action: 'expense' }>>) {
  const values = proposal.values
  const today = localDay(business.timezone)
  const [amount, setAmount] = useState(field(values.amount))
  const [category, setCategory] = useState(values.category)
  const [description, setDescription] = useState(values.description ?? '')
  const [spentOn, setSpentOn] = useState(values.spentOn ?? today)
  const submit = async () => {
    const value = parseAmount(amount)
    if (!value) return 'Indiquez un montant entier positif, sans centimes.'
    if (!spentOn || spentOn > today) return 'La date ne peut pas être dans le futur.'
    await onConfirm(async () => {
      await api.recordExpense(business.id, { amount: value, category, description: description.trim() || null, spentOn })
      return `Dépense de ${formatAmount(value, business.currency)} enregistrée (${category}).`
    })
  }
  return (
    <ProposalFrame title="Dépense" icon={<Receipt size={16} aria-hidden="true" />} status={status} result={result} onSubmit={submit} onDismiss={onDismiss}>
      <div className="field-pair">
        <label className="field"><span className="field-label">Montant ({currencyLabel(business.currency)})</span><input inputMode="numeric" value={amount} placeholder="À compléter" onChange={(event) => setAmount(event.target.value)} /></label>
        <label className="field"><span className="field-label">Date</span><input type="date" value={spentOn} max={today} onChange={(event) => setSpentOn(event.target.value)} /></label>
      </div>
      <label className="field">
        <span className="field-label">Catégorie</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {expenseCategories.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label className="field"><span className="field-label">Description (facultatif)</span><input value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></label>
    </ProposalFrame>
  )
}

function CancelSaleProposalCard({ proposal, status, result, api, business, onConfirm, onDismiss }: CardProps<Extract<AssistantProposal, { action: 'cancel_sale' }>>) {
  const { saleId, sale, reference } = proposal.values
  const [reason, setReason] = useState(proposal.values.reason ?? '')
  const blocked = business.role !== 'owner'
    ? 'Seul le propriétaire peut annuler une vente.'
    : !saleId || !sale ? `Vente « ${reference} » introuvable parmi les ventes des 7 derniers jours : annulez-la depuis l’onglet Ventes.`
      : sale.status === 'cancelled' ? 'Cette vente est déjà annulée.' : undefined
  const submit = async () => {
    if (blocked || !saleId) return blocked
    await onConfirm(async () => {
      await api.cancelSale(business.id, saleId, reason.trim() || undefined)
      return 'Vente annulée, stock rétabli.'
    })
  }
  return (
    <ProposalFrame title="Annulation de vente" icon={<Ban size={16} aria-hidden="true" />} status={status} result={result} confirmLabel="Confirmer l’annulation" blocked={blocked} onSubmit={submit} onDismiss={onDismiss}>
      {sale ? (
        <div className="proposal-summary">
          <p><strong>{formatAmount(sale.totalAmount, business.currency)}</strong> · {new Date(sale.soldAt).toLocaleString('fr', { timeZone: business.timezone, dateStyle: 'medium', timeStyle: 'short' })}</p>
          <p>{sale.items.map((item) => `${formatQuantity(item.quantity)} ${item.unit} · ${item.productName}`).join(' ; ')}</p>
          <p className="field-hint">La vente restera visible, marquée « Annulée », et les produits reviendront en stock.</p>
        </div>
      ) : null}
      <label className="field"><span className="field-label">Motif (facultatif)</span><input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
    </ProposalFrame>
  )
}

/**
 * Fiche préparée par l’assistant : l’utilisateur la vérifie, la corrige puis la confirme.
 * L’enregistrement passe par les mêmes adresses et contrôles que les formulaires de l’espace Business.
 */
export function ProposalCard(props: CardProps<AssistantProposal>) {
  const { proposal } = props
  switch (proposal.action) {
    case 'create_product': return <ProductProposalCard {...props} proposal={proposal} />
    case 'stock_movement': return <MovementProposalCard {...props} proposal={proposal} />
    case 'sale': return <SaleProposalCard {...props} proposal={proposal} />
    case 'expense': return <ExpenseProposalCard {...props} proposal={proposal} />
    case 'cancel_sale': return <CancelSaleProposalCard {...props} proposal={proposal} />
  }
}
