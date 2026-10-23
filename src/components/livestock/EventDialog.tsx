import { useState, type FormEvent } from 'react'
import { parseAmount } from '../../app/businessFormat'
import { eventLabels, isCost, movesAnimals, needsAmount, recordableEvents, sexLabels } from '../../app/livestock'
import type { Animal, EventInput, Herd, LivestockEventKind, Sex } from '../../services/livestockApi'
import { Modal } from '../Modal'

type Kind = Exclude<LivestockEventKind, 'start'>

const amountLabels: Partial<Record<Kind, string>> = {
  purchase: 'Prix d’achat total',
  sale: 'Montant de la vente',
  feed: 'Coût de l’aliment',
  health: 'Coût des soins',
  expense: 'Montant',
}

/**
 * Événement du journal d’un lot. Lot suivi en groupe : nombre d’animaux ; lot suivi un par un : numéro
 * du nouvel animal (naissance, achat) ou animal concerné (vente, mortalité). La date ne peut pas être future.
 */
export function EventDialog({ herds, animals, today, initialHerdId, initialKind, onSave, onClose }: {
  herds: Herd[]
  animals: Animal[]
  today: string
  initialHerdId?: string
  initialKind?: Kind
  onSave: (input: EventInput) => Promise<void>
  onClose: () => void
}) {
  const [herdId, setHerdId] = useState(initialHerdId ?? (herds.length === 1 ? herds[0].id : ''))
  const [kind, setKind] = useState<Kind | ''>(initialKind ?? '')
  const [quantity, setQuantity] = useState('')
  const [amount, setAmount] = useState('')
  const [occurredOn, setOccurredOn] = useState(today)
  const [cause, setCause] = useState('')
  const [note, setNote] = useState('')
  const [tag, setTag] = useState('')
  const [sex, setSex] = useState<Sex>('unknown')
  const [animalId, setAnimalId] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const herd = herds.find((item) => item.id === herdId)
  const individual = herd?.tracking === 'individual'
  const present = animals.filter((animal) => animal.herdId === herdId && animal.status === 'present')
  const kinds = recordableEvents.filter((value) => !(individual && value === 'count'))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!herd) return setError('Choisissez le lot.')
    if (!kind) return setError('Choisissez le type d’événement.')
    if (!occurredOn || occurredOn > today) return setError('La date ne peut pas être dans le futur.')
    const value = needsAmount(kind) ? parseAmount(amount) : 0
    if (value === null) return setError('Indiquez un montant entier positif, sans centimes.')
    if (isCost(kind) && !value) return setError('Indiquez le montant de la dépense.')
    const input: EventInput = { herdId, kind, amount: value, occurredOn, note: note.trim() || null, cause: kind === 'death' ? cause.trim() || null : null }
    if (individual && (kind === 'birth' || kind === 'purchase')) {
      if (!tag.trim()) return setError('Indiquez le numéro de l’animal (boucle ou marque).')
      input.animal = { tag: tag.trim(), sex }
    } else if (individual && (kind === 'sale' || kind === 'death')) {
      if (!animalId) return setError('Choisissez l’animal concerné.')
      input.animalId = animalId
    } else if (movesAnimals(kind) || kind === 'count') {
      const count = parseAmount(quantity)
      if (count === null || (movesAnimals(kind) && !count)) return setError(kind === 'count' ? 'Indiquez le nombre d’animaux comptés.' : 'Indiquez le nombre d’animaux.')
      input.quantity = count
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
    <Modal title="Nouvel événement" onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">Lot</span>
            <select value={herdId} onChange={(event) => { setHerdId(event.target.value); setAnimalId('') }}>
              <option value="">Choisir…</option>
              {herds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Événement</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as Kind | '')}>
              <option value="">Choisir…</option>
              {kinds.map((value) => <option key={value} value={value}>{eventLabels[value]}</option>)}
            </select>
          </label>
        </div>
        {herd && kind && (
          <>
            {individual && (kind === 'birth' || kind === 'purchase') && (
              <div className="field-pair">
                <label className="field"><span className="field-label">Numéro de l’animal</span><input value={tag} maxLength={40} onChange={(event) => setTag(event.target.value)} placeholder="Par exemple : BF-001" /></label>
                <label className="field">
                  <span className="field-label">Sexe</span>
                  <select value={sex} onChange={(event) => setSex(event.target.value as Sex)}>
                    {(Object.keys(sexLabels) as Sex[]).map((value) => <option key={value} value={value}>{sexLabels[value]}</option>)}
                  </select>
                </label>
              </div>
            )}
            {individual && (kind === 'sale' || kind === 'death') && (
              <label className="field">
                <span className="field-label">Animal</span>
                <select value={animalId} onChange={(event) => setAnimalId(event.target.value)}>
                  <option value="">Choisir…</option>
                  {present.map((animal) => <option key={animal.id} value={animal.id}>{animal.tag}{animal.name ? ` (${animal.name})` : ''}</option>)}
                </select>
              </label>
            )}
            {!individual && (movesAnimals(kind) || kind === 'count') && (
              <label className="field">
                <span className="field-label">{kind === 'count' ? 'Nombre d’animaux comptés' : 'Nombre d’animaux'}</span>
                <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" />
              </label>
            )}
            {kind === 'count' && <p className="field-hint">Effectif enregistré : {herd.headcount}. L’écart sera ajouté au journal.</p>}
            {needsAmount(kind) && (
              <label className="field">
                <span className="field-label">{amountLabels[kind]}{kind === 'purchase' || kind === 'sale' ? ' (facultatif)' : ''}</span>
                <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
              </label>
            )}
            {kind === 'death' && (
              <label className="field">
                <span className="field-label">Cause (si connue)</span>
                <input value={cause} maxLength={200} onChange={(event) => setCause(event.target.value)} placeholder="Par exemple : chaleur, maladie (diagnostic du vétérinaire)…" />
              </label>
            )}
            <div className="field-pair">
              <label className="field"><span className="field-label">Date</span><input type="date" value={occurredOn} max={today} onChange={(event) => setOccurredOn(event.target.value)} /></label>
              <label className="field"><span className="field-label">Note (facultatif)</span><input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /></label>
            </div>
            {kind === 'death' && <p className="field-hint">Des morts nombreuses ou inhabituelles ? Isolez les animaux malades et contactez un vétérinaire.</p>}
          </>
        )}
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Enregistrer</button>
      </form>
    </Modal>
  )
}
