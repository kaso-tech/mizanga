import { useState, type FormEvent } from 'react'
import { cropName, formatKg, harvestUnitLabels, harvestUnits, inputLabels, inputUnits, movesHarvest, needsUnitWeight, operationKinds, operationLabels, parseDecimal, workLabels } from '../../app/agriculture'
import { parseAmount } from '../../app/businessFormat'
import type { Crop, InputType, OperationInput, OperationKind, WorkType } from '../../services/agricultureApi'
import { Modal } from '../Modal'

const amountLabels: Record<OperationKind, string> = {
  work: 'Main-d’œuvre payée (facultatif)',
  input: 'Coût',
  rental: 'Montant de la location',
  expense: 'Montant',
  harvest: '',
  sale: 'Montant de la vente',
  consumption: '',
  loss: '',
}

/**
 * Opération du journal d’une culture. Récolte et sorties : quantité convertie en kg (poids d’un sac,
 * cageot ou panier à indiquer) ; une sortie ne peut pas dépasser le stock. La date ne peut pas être future.
 */
export function OperationDialog({ crops, today, initialCropId, initialKind, onSave, onClose }: {
  crops: Crop[]
  today: string
  initialCropId?: string
  initialKind?: OperationKind
  onSave: (input: OperationInput) => Promise<void>
  onClose: () => void
}) {
  const [cropId, setCropId] = useState(initialCropId ?? (crops.length === 1 ? crops[0].id : ''))
  const [kind, setKind] = useState<OperationKind | ''>(initialKind ?? '')
  const [workType, setWorkType] = useState<WorkType | ''>('')
  const [inputType, setInputType] = useState<InputType | ''>('')
  const [label, setLabel] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('kg')
  const [unitKg, setUnitKg] = useState('')
  const [amount, setAmount] = useState('')
  const [occurredOn, setOccurredOn] = useState(today)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const crop = crops.find((item) => item.id === cropId)
  // Une culture clôturée ne garde que les sorties de son stock.
  const kinds = crop?.status === 'closed' ? operationKinds.filter((value) => value === 'sale' || value === 'consumption' || value === 'loss') : operationKinds

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!crop) return setError('Choisissez la culture.')
    if (!kind) return setError('Choisissez le type d’opération.')
    if (!occurredOn || occurredOn > today) return setError('La date ne peut pas être dans le futur.')
    const input: OperationInput = { cropId, kind, occurredOn, label: label.trim() || null, note: note.trim() || null }
    if (kind === 'work') {
      if (!workType) return setError('Choisissez le travail.')
      input.workType = workType
    }
    if (kind === 'input') {
      if (!inputType) return setError('Choisissez le type d’intrant.')
      input.inputType = inputType
    }
    if (movesHarvest(kind) || kind === 'input') {
      const value = quantity.trim() ? parseDecimal(quantity) : null
      if (movesHarvest(kind) && value === null) return setError('Indiquez la quantité.')
      if (quantity.trim() && value === null) return setError('La quantité doit être un nombre positif.')
      input.quantity = value
      input.unit = value === null ? null : unit
      if (movesHarvest(kind) && needsUnitWeight(unit)) {
        const weight = parseDecimal(unitKg)
        if (weight === null) return setError(`Indiquez le poids d’un ${unit} en kg.`)
        input.unitKg = weight
      }
    }
    if (amountLabels[kind]) {
      const value = parseAmount(amount)
      if (value === null) return setError('Le montant est un nombre entier, sans centimes.')
      if ((kind === 'rental' || kind === 'expense') && !value) return setError('Indiquez le montant.')
      input.amount = value
    }
    setIsSaving(true)
    setError('')
    try {
      await onSave(input)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’enregistrement a échoué.')
      setIsSaving(false)
    }
  }

  return (
    <Modal title="Nouvelle opération" onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">Culture</span>
            <select value={cropId} onChange={(event) => setCropId(event.target.value)}>
              <option value="">Choisir…</option>
              {crops.map((item) => <option key={item.id} value={item.id}>{cropName(item)} ({item.year})</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Opération</span>
            <select value={kind} onChange={(event) => { setKind(event.target.value as OperationKind | ''); setUnit('kg') }}>
              <option value="">Choisir…</option>
              {kinds.map((value) => <option key={value} value={value}>{operationLabels[value]}</option>)}
            </select>
          </label>
        </div>
        {crop && kind && (
          <>
            {kind === 'work' && (
              <label className="field">
                <span className="field-label">Travail</span>
                <select value={workType} onChange={(event) => setWorkType(event.target.value as WorkType | '')}>
                  <option value="">Choisir…</option>
                  {(Object.keys(workLabels) as WorkType[]).map((value) => <option key={value} value={value}>{workLabels[value]}</option>)}
                </select>
              </label>
            )}
            {kind === 'input' && (
              <div className="field-pair">
                <label className="field">
                  <span className="field-label">Type d’intrant</span>
                  <select value={inputType} onChange={(event) => setInputType(event.target.value as InputType | '')}>
                    <option value="">Choisir…</option>
                    {(Object.keys(inputLabels) as InputType[]).map((value) => <option key={value} value={value}>{inputLabels[value]}</option>)}
                  </select>
                </label>
                <label className="field"><span className="field-label">Produit (facultatif)</span><input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="NPK 15-15-15, urée, variété…" /></label>
              </div>
            )}
            {(movesHarvest(kind) || kind === 'input') && (
              <div className="field-pair">
                <label className="field"><span className="field-label">Quantité{kind === 'input' ? ' (facultatif)' : ''}</span><input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" /></label>
                <label className="field">
                  <span className="field-label">Unité</span>
                  <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                    {movesHarvest(kind)
                      ? harvestUnits.map((value) => <option key={value} value={value}>{harvestUnitLabels[value]}</option>)
                      : inputUnits.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
            )}
            {movesHarvest(kind) && needsUnitWeight(unit) && (
              <label className="field"><span className="field-label">Poids d’un {unit} (kg)</span><input inputMode="decimal" value={unitKg} onChange={(event) => setUnitKg(event.target.value)} placeholder="100" /></label>
            )}
            {kind !== 'harvest' && movesHarvest(kind) && <p className="field-hint">Stock de récolte : {formatKg(crop.stockKg)}.</p>}
            {amountLabels[kind] && (
              <label className="field"><span className="field-label">{amountLabels[kind]}</span><input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></label>
            )}
            {(kind === 'rental' || kind === 'expense' || kind === 'work') && (
              <label className="field"><span className="field-label">Précision (facultatif)</span><input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder={kind === 'rental' ? 'Loyer de la terre, tracteur, motopompe…' : kind === 'work' ? 'Premier sarclage…' : 'Transport, carburant…'} /></label>
            )}
            <div className="field-pair">
              <label className="field"><span className="field-label">Date</span><input type="date" value={occurredOn} max={today} onChange={(event) => setOccurredOn(event.target.value)} /></label>
              <label className="field"><span className="field-label">Note (facultatif)</span><input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /></label>
            </div>
            {(kind === 'input' && inputType === 'treatment_product') || (kind === 'work' && workType === 'treatment') ? (
              <p className="field-hint">Produits de traitement : suivez l’étiquette et l’avis de l’agent d’agriculture, protégez-vous et respectez le délai avant récolte.</p>
            ) : null}
          </>
        )}
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Enregistrer</button>
      </form>
    </Modal>
  )
}
