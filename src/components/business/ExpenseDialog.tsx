import { useState, type FormEvent } from 'react'
import { parseAmount } from '../../app/businessFormat'
import type { ExpenseInput } from '../../services/businessApi'
import { Modal } from '../Modal'

const expenseCategories = ['Loyer', 'Transport', 'Électricité / eau', 'Salaires', 'Communication', 'Taxes et impôts', 'Entretien', 'Autre']

/** Nouvelle dépense ; la date ne peut pas être dans le futur (jour du commerce). */
export function ExpenseDialog({ today, onSave, onClose }: { today: string; onSave: (input: ExpenseInput) => Promise<void>; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [spentOn, setSpentOn] = useState(today)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = parseAmount(amount)
    if (!value) return setError('Indiquez un montant entier positif, sans centimes.')
    if (!category) return setError('Choisissez une catégorie.')
    if (!spentOn || spentOn > today) return setError('La date ne peut pas être dans le futur.')
    setIsSaving(true)
    setError('')
    try {
      await onSave({ amount: value, category, description: description.trim() || null, spentOn })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
      setIsSaving(false)
    }
  }

  return (
    <Modal title="Nouvelle dépense" onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">Montant</span>
            <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
          </label>
          <label className="field">
            <span className="field-label">Date</span>
            <input type="date" value={spentOn} max={today} onChange={(event) => setSpentOn(event.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Catégorie</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Choisir…</option>
            {expenseCategories.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Description (facultatif)</span>
          <input value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <p className="field-hint">Les achats de marchandises s’enregistrent dans le stock (onglet Produits), pas en dépenses : leur coût est compté quand ils sont vendus.</p>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Enregistrer la dépense</button>
      </form>
    </Modal>
  )
}
