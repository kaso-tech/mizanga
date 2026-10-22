import { useState, type FormEvent } from 'react'
import { parseAmount, parseQuantity } from '../../app/businessFormat'
import type { Product, ProductInput } from '../../services/businessApi'
import { Modal } from '../Modal'

interface ProductDialogProps {
  /** Produit à modifier ; absent pour une création. */
  product?: Product
  currency: string
  onClose: () => void
  onSave: (input: ProductInput) => Promise<void>
  onArchive?: () => Promise<void>
}

const amountText = (value: number | undefined) => (value === undefined ? '' : String(value))
const quantityText = (value: number | undefined) => (value === undefined ? '' : String(value).replace('.', ','))

/** Création ou modification d’un produit. La quantité en stock ne se change que par un mouvement. */
export function ProductDialog({ product, currency, onClose, onSave, onArchive }: ProductDialogProps) {
  const [name, setName] = useState(product?.name ?? '')
  const [unit, setUnit] = useState(product?.unit ?? 'pièce')
  const [purchasePrice, setPurchasePrice] = useState(amountText(product?.purchasePrice))
  const [salePrice, setSalePrice] = useState(amountText(product?.salePrice))
  const [alertThreshold, setAlertThreshold] = useState(quantityText(product?.alertThreshold))
  const [initialQuantity, setInitialQuantity] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const purchase = parseAmount(purchasePrice)
    const sale = parseAmount(salePrice)
    const threshold = parseQuantity(alertThreshold)
    const initial = parseQuantity(initialQuantity)
    if (!name.trim()) return setError('Indiquez le nom du produit.')
    if (purchase === null || sale === null) return setError(`Les prix sont des montants entiers en ${currency === 'XOF' ? 'francs CFA' : currency}, sans centimes.`)
    if (threshold === null || initial === null) return setError('Les quantités sont des nombres positifs (par exemple 2,5), trois décimales au plus.')
    setIsSaving(true)
    setError('')
    try {
      await onSave({ name: name.trim(), unit: unit.trim() || 'pièce', purchasePrice: purchase, salePrice: sale, alertThreshold: threshold, ...(product ? {} : { initialQuantity: initial }) })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
      setIsSaving(false)
    }
  }

  const margin = parseAmount(salePrice) !== null && parseAmount(purchasePrice) !== null ? (parseAmount(salePrice) ?? 0) - (parseAmount(purchasePrice) ?? 0) : null

  return (
    <Modal title={product ? 'Modifier le produit' : 'Nouveau produit'} onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span className="field-label">Nom</span>
          <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Par exemple : Riz 25 kg" />
        </label>
        <label className="field">
          <span className="field-label">Unité</span>
          <input value={unit} maxLength={24} onChange={(event) => setUnit(event.target.value)} placeholder="pièce, kg, sac, litre…" />
        </label>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">Prix d’achat</span>
            <input inputMode="numeric" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="0" />
          </label>
          <label className="field">
            <span className="field-label">Prix de vente</span>
            <input inputMode="numeric" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} placeholder="0" />
          </label>
        </div>
        {margin !== null && margin < 0 && <p className="field-warning">Le prix de vente est inférieur au prix d’achat.</p>}
        <div className="field-pair">
          {!product && (
            <label className="field">
              <span className="field-label">Stock initial</span>
              <input inputMode="decimal" value={initialQuantity} onChange={(event) => setInitialQuantity(event.target.value)} placeholder="0" />
            </label>
          )}
          <label className="field">
            <span className="field-label">Seuil d’alerte</span>
            <input inputMode="decimal" value={alertThreshold} onChange={(event) => setAlertThreshold(event.target.value)} placeholder="0" />
          </label>
        </div>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>{product ? 'Enregistrer' : 'Ajouter le produit'}</button>
        {product && onArchive && (
          <button type="button" className="text-button" disabled={isSaving} onClick={() => void onArchive()}>Archiver ce produit</button>
        )}
      </form>
    </Modal>
  )
}
