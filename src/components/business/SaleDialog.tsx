import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { formatAmount, formatQuantity, parseAmount, parseQuantity } from '../../app/businessFormat'
import type { Product, SaleInput } from '../../services/businessApi'
import { Modal } from '../Modal'

interface Line { key: number; productId: string; quantity: string; price: string }

/**
 * Nouvelle vente : une ligne par produit, prix de vente proposé et modifiable (remise, négociation).
 * Le total affiché suit la même règle que la base : quantité × prix, arrondi au franc ;
 * la base recontrôle le stock et refuse une vente impossible.
 */
export function SaleDialog({ products, currency, onSave, onClose }: { products: Product[]; currency: string; onSave: (input: SaleInput) => Promise<void>; onClose: () => void }) {
  const available = products.filter((product) => !product.archived)
  const [lines, setLines] = useState<Line[]>([{ key: 0, productId: '', quantity: '1', price: '' }])
  const [customerName, setCustomerName] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const productOf = (id: string) => available.find((product) => product.id === id)

  const update = (key: number, changes: Partial<Line>) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...changes } : line)))
  const choose = (key: number, productId: string) => update(key, { productId, price: String(productOf(productId)?.salePrice ?? '') })
  const addLine = () => setLines((current) => [...current, { key: Math.max(...current.map((line) => line.key)) + 1, productId: '', quantity: '1', price: '' }])

  const totalOf = (line: Line) => {
    const quantity = parseQuantity(line.quantity)
    const price = parseAmount(line.price)
    return line.productId && quantity && price !== null ? Math.round(quantity * price) : 0
  }
  const total = lines.reduce((sum, line) => sum + totalOf(line), 0)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const chosen = lines.filter((line) => line.productId)
    if (chosen.length === 0) return setError('Ajoutez au moins un produit à la vente.')
    if (new Set(chosen.map((line) => line.productId)).size !== chosen.length) return setError('Un même produit apparaît deux fois : regroupez les quantités.')
    const items: SaleInput['items'] = []
    for (const line of chosen) {
      const product = productOf(line.productId) as Product
      const quantity = parseQuantity(line.quantity)
      const price = parseAmount(line.price)
      if (!quantity) return setError(`Indiquez une quantité positive pour « ${product.name} ».`)
      if (price === null) return setError(`Le prix de « ${product.name} » est un montant entier, sans centimes.`)
      if (quantity > product.quantity) return setError(`Stock insuffisant pour « ${product.name} » : il reste ${formatQuantity(product.quantity)} ${product.unit}.`)
      items.push({ productId: product.id, quantity, unitPrice: price })
    }
    setIsSaving(true)
    setError('')
    try {
      await onSave({ items, customerName: customerName.trim() || null })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
      setIsSaving(false)
    }
  }

  return (
    <Modal title="Nouvelle vente" onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        {available.length === 0 && <p className="dialog-description">Ajoutez d’abord vos produits dans l’onglet Produits.</p>}
        <ol className="sale-lines">
          {lines.map((line, index) => {
            const product = productOf(line.productId)
            return (
              <li key={line.key} className="sale-line">
                <label className="field sale-product">
                  <span className="field-label">Produit {index + 1}</span>
                  <select value={line.productId} onChange={(event) => choose(line.key, event.target.value)}>
                    <option value="">Choisir…</option>
                    {available.map((option) => (
                      <option key={option.id} value={option.id} disabled={option.quantity <= 0}>
                        {option.name} ({formatQuantity(option.quantity)} {option.unit}{option.quantity <= 0 ? ', rupture' : ''})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-pair">
                  <label className="field">
                    <span className="field-label">Quantité{product ? ` (${product.unit})` : ''}<span className="visually-hidden"> {index + 1}</span></span>
                    <input inputMode="decimal" value={line.quantity} onChange={(event) => update(line.key, { quantity: event.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field-label">Prix unitaire<span className="visually-hidden"> {index + 1}</span></span>
                    <input inputMode="numeric" value={line.price} onChange={(event) => update(line.key, { price: event.target.value })} />
                  </label>
                </div>
                <div className="sale-line-footer">
                  <span>{formatAmount(totalOf(line), currency)}</span>
                  {lines.length > 1 && (
                    <button type="button" className="icon-button" aria-label={`Retirer le produit ${index + 1}`} onClick={() => setLines((current) => current.filter((other) => other.key !== line.key))}><Trash2 size={16} /></button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
        <button type="button" className="secondary-button add-line" onClick={addLine}><Plus size={14} aria-hidden="true" /> Ajouter un produit</button>
        <label className="field">
          <span className="field-label">Client (facultatif)</span>
          <input value={customerName} maxLength={120} onChange={(event) => setCustomerName(event.target.value)} />
        </label>
        <p className="sale-total">Total : <strong>{formatAmount(total, currency)}</strong></p>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving || available.length === 0}>Enregistrer la vente</button>
      </form>
    </Modal>
  )
}
