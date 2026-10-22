import { useState, type FormEvent } from 'react'
import { formatQuantity, parseAmount, parseQuantity } from '../../app/businessFormat'
import type { MovementInput, Product } from '../../services/businessApi'
import { Modal } from '../Modal'

type EntryKind = 'purchase' | 'return' | 'loss' | 'count'

const kinds: Array<{ value: EntryKind; label: string }> = [
  { value: 'purchase', label: 'Achat / entrée' },
  { value: 'return', label: 'Retour client' },
  { value: 'loss', label: 'Perte' },
  { value: 'count', label: 'Inventaire' },
]

/**
 * Mouvement de stock. « Inventaire » : on saisit la quantité comptée, Gilli en déduit l’écart
 * (correction positive ou négative) ; les ventes s’enregistreront à part (étape suivante).
 */
export function MovementDialog({ product, onClose, onSave }: { product: Product; onClose: () => void; onSave: (input: MovementInput) => Promise<void> }) {
  const [kind, setKind] = useState<EntryKind>('purchase')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = parseQuantity(quantity)
    if (value === null || (kind !== 'count' && value === 0)) return setError('Indiquez une quantité positive (par exemple 2,5).')
    const delta = kind === 'count' ? Math.round((value - product.quantity) * 1000) / 1000 : value
    if (kind === 'count' && delta === 0) return setError('Aucun écart avec le stock enregistré : rien à corriger.')
    const cost = kind === 'purchase' ? parseAmount(unitCost) : 0
    if (cost === null) return setError('Le coût est un montant entier, sans centimes.')
    setIsSaving(true)
    setError('')
    try {
      await onSave({
        kind: kind === 'count' ? 'adjustment' : kind,
        quantity: delta,
        unitCost: kind === 'purchase' && unitCost.trim() ? cost : null,
        note: note.trim() || (kind === 'count' ? `Inventaire : ${formatQuantity(value)} compté(s)` : null),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
      setIsSaving(false)
    }
  }

  return (
    <Modal title={`Stock : ${product.name}`} onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <p className="dialog-description">En stock : <strong>{formatQuantity(product.quantity)} {product.unit}</strong></p>
        <div className="segmented movement-kinds" role="radiogroup" aria-label="Type de mouvement">
          {kinds.map((option) => (
            <label key={option.value} className={kind === option.value ? 'is-selected' : ''}>
              <input type="radio" name="movement-kind" value={option.value} checked={kind === option.value} onChange={() => { setKind(option.value); setError('') }} />
              {option.label}
            </label>
          ))}
        </div>
        <label className="field">
          <span className="field-label">{kind === 'count' ? 'Quantité comptée' : 'Quantité'} ({product.unit})</span>
          <input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" />
        </label>
        {kind === 'purchase' && (
          <label className="field">
            <span className="field-label">Coût unitaire (facultatif)</span>
            <input inputMode="numeric" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder={String(product.purchasePrice)} />
          </label>
        )}
        <label className="field">
          <span className="field-label">Note (facultatif)</span>
          <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder={kind === 'loss' ? 'Casse, péremption…' : ''} />
        </label>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Enregistrer</button>
      </form>
    </Modal>
  )
}
