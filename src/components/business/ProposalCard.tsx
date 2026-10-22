import { Check, PackagePlus, Repeat, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { formatQuantity, parseAmount, parseQuantity } from '../../app/businessFormat'
import type { AssistantProposal, MovementInput, Product, ProductInput } from '../../services/businessApi'

export type ProposalStatus = 'pending' | 'saving' | 'done' | 'dismissed'

const kindLabels: Record<string, string> = { purchase: 'Achat / entrée', return: 'Retour client', loss: 'Perte', count: 'Inventaire' }
const field = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

/**
 * Fiche préparée par l’assistant : l’utilisateur la vérifie, la corrige puis la confirme.
 * L’enregistrement passe par les mêmes adresses et contrôles que les formulaires de l’espace Business.
 */
export function ProposalCard({ proposal, status, result, products, currency, onConfirmProduct, onConfirmMovement, onDismiss }: {
  proposal: AssistantProposal
  status: ProposalStatus
  /** Phrase affichée une fois la fiche enregistrée. */
  result?: string
  products: Product[]
  currency: string
  onConfirmProduct: (input: ProductInput) => Promise<void>
  onConfirmMovement: (product: Product, input: MovementInput) => Promise<void>
  onDismiss: () => void
}) {
  const product = proposal.action === 'create_product' ? proposal.values : null
  const movement = proposal.action === 'stock_movement' ? proposal.values : null
  const [name, setName] = useState(product?.name ?? '')
  const [unit, setUnit] = useState(product?.unit ?? 'pièce')
  const [purchasePrice, setPurchasePrice] = useState(field(product?.purchasePrice ?? null))
  const [salePrice, setSalePrice] = useState(field(product?.salePrice ?? null))
  const [initialQuantity, setInitialQuantity] = useState(field(product?.initialQuantity ?? null))
  const [alertThreshold, setAlertThreshold] = useState(field(product?.alertThreshold ?? null))
  const [productId, setProductId] = useState(movement?.productId ?? '')
  const [kind, setKind] = useState<string>(movement?.kind ?? 'purchase')
  const [quantity, setQuantity] = useState(field(movement?.quantity ?? null))
  const [unitCost, setUnitCost] = useState(field(movement?.unitCost ?? null))
  const [note, setNote] = useState(movement?.note ?? '')
  const [error, setError] = useState('')
  const isLocked = status !== 'pending'
  const chosen = products.find((candidate) => candidate.id === productId)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      if (product) {
        const values = { purchase: parseAmount(purchasePrice), sale: parseAmount(salePrice), initial: parseQuantity(initialQuantity), threshold: parseQuantity(alertThreshold) }
        if (!name.trim()) return setError('Indiquez le nom du produit.')
        if (values.purchase === null || values.sale === null) return setError('Les prix sont des montants entiers, sans centimes.')
        if (values.initial === null || values.threshold === null) return setError('Les quantités sont des nombres positifs (trois décimales au plus).')
        await onConfirmProduct({ name: name.trim(), unit: unit.trim() || 'pièce', purchasePrice: values.purchase, salePrice: values.sale, initialQuantity: values.initial, alertThreshold: values.threshold })
      } else {
        if (!chosen) return setError('Choisissez le produit concerné.')
        const value = parseQuantity(quantity)
        if (value === null || (kind !== 'count' && value === 0)) return setError('Indiquez une quantité positive (par exemple 2,5).')
        // Inventaire : la quantité comptée devient une correction de l’écart avec le stock enregistré.
        const delta = kind === 'count' ? Math.round((value - chosen.quantity) * 1000) / 1000 : value
        if (kind === 'count' && delta === 0) return setError('Aucun écart avec le stock enregistré : rien à corriger.')
        const cost = kind === 'purchase' && unitCost.trim() ? parseAmount(unitCost) : null
        if (kind === 'purchase' && unitCost.trim() && cost === null) return setError('Le coût est un montant entier, sans centimes.')
        await onConfirmMovement(chosen, {
          kind: kind === 'count' ? 'adjustment' : kind as MovementInput['kind'],
          quantity: delta,
          unitCost: cost,
          note: note.trim() || (kind === 'count' ? `Inventaire : ${formatQuantity(value)} compté(s)` : null),
        })
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
    }
  }

  const title = product ? 'Nouveau produit' : 'Mouvement de stock'
  return (
    <form className={`proposal-card is-${status}`} aria-label={`Fiche à vérifier : ${title}`} onSubmit={(event) => void submit(event)}>
      <p className="proposal-title">
        {product ? <PackagePlus size={16} aria-hidden="true" /> : <Repeat size={16} aria-hidden="true" />}
        <strong>{title}</strong>
        <span className="proposal-status">{status === 'done' ? 'Enregistré' : status === 'dismissed' ? 'Ignoré' : 'À vérifier'}</span>
      </p>
      <fieldset disabled={isLocked}>
        {product ? (
          <>
            <label className="field"><span className="field-label">Nom</span><input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
            <div className="field-pair">
              <label className="field"><span className="field-label">Unité</span><input value={unit} maxLength={24} onChange={(event) => setUnit(event.target.value)} /></label>
              <label className="field"><span className="field-label">Stock initial</span><input inputMode="decimal" value={initialQuantity} placeholder="À compléter" onChange={(event) => setInitialQuantity(event.target.value)} /></label>
            </div>
            <div className="field-pair">
              <label className="field"><span className="field-label">Prix d’achat ({currency === 'XOF' ? 'F CFA' : currency})</span><input inputMode="numeric" value={purchasePrice} placeholder="À compléter" onChange={(event) => setPurchasePrice(event.target.value)} /></label>
              <label className="field"><span className="field-label">Prix de vente ({currency === 'XOF' ? 'F CFA' : currency})</span><input inputMode="numeric" value={salePrice} placeholder="À compléter" onChange={(event) => setSalePrice(event.target.value)} /></label>
            </div>
            <label className="field"><span className="field-label">Seuil d’alerte (facultatif)</span><input inputMode="decimal" value={alertThreshold} placeholder="0" onChange={(event) => setAlertThreshold(event.target.value)} /></label>
          </>
        ) : (
          <>
            <label className="field">
              <span className="field-label">Produit</span>
              <select value={productId} onChange={(event) => setProductId(event.target.value)}>
                <option value="">{movement?.productName ? `« ${movement.productName} » : choisir…` : 'Choisir…'}</option>
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
          </>
        )}
      </fieldset>
      {error && <p className="message-error" role="alert">{error}</p>}
      {status === 'done' && result && <p className="proposal-result"><Check size={14} aria-hidden="true" /> {result}</p>}
      {(status === 'pending' || status === 'saving') && (
        <div className="proposal-actions">
          <button type="button" className="secondary-button" onClick={onDismiss} disabled={status === 'saving'}><X size={14} aria-hidden="true" /> Ignorer</button>
          <button type="submit" className="primary-button" disabled={status === 'saving'}><Check size={14} aria-hidden="true" /> Confirmer et enregistrer</button>
        </div>
      )}
    </form>
  )
}
