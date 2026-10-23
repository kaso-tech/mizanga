import { NotebookPen, Rows3, Syringe } from 'lucide-react'
import { useState } from 'react'
import { currencyLabel, formatAmount, parseAmount } from '../../app/businessFormat'
import { localDay } from '../../app/businessPeriods'
import { eventLabels, healthLabels, isCost, movesAnimals, needsAmount, recordableEvents, sexLabels, speciesLabels, speciesOrder, trackingLabels } from '../../app/livestock'
import type { Business } from '../../services/businessApi'
import type { Animal, EventInput, HealthKind, Herd, LivestockApi, LivestockProposal, Sex, Species, Tracking } from '../../services/livestockApi'
import { ProposalFrame, type ProposalStatus } from '../business/ProposalCard'

const field = (value: number | null) => (value === null ? '' : String(value))

interface CardProps<P extends LivestockProposal> {
  proposal: P
  status: ProposalStatus
  result?: string
  api: LivestockApi
  business: Business
  herds: Herd[]
  animals: Animal[]
  onConfirm: (save: () => Promise<string>) => Promise<void>
  onDismiss: () => void
}

function HerdProposalCard({ proposal, status, result, api, business, onConfirm, onDismiss }: CardProps<Extract<LivestockProposal, { action: 'create_herd' }>>) {
  const values = proposal.values
  const today = localDay(business.timezone)
  const [name, setName] = useState(values.name)
  const [species, setSpecies] = useState<Species | ''>(values.species ?? '')
  const [tracking, setTracking] = useState<Tracking>(values.tracking ?? (values.species === 'cattle' ? 'individual' : 'group'))
  const [count, setCount] = useState(field(values.initialCount))
  const [startedOn, setStartedOn] = useState(values.startedOn ?? today)
  const submit = async () => {
    if (!name.trim()) return 'Donnez un nom au lot.'
    if (!species) return 'Choisissez une espèce.'
    const initialCount = tracking === 'group' ? parseAmount(count) : 0
    if (initialCount === null) return 'L’effectif de départ doit être un nombre entier.'
    if (!startedOn || startedOn > today) return 'La date de début ne peut pas être dans le futur.'
    await onConfirm(async () => {
      const herd = await api.createHerd(business.id, { name: name.trim(), species, tracking, initialCount, startedOn })
      return `Lot « ${herd.name} » créé (${herd.headcount} animaux).`
    })
  }
  return (
    <ProposalFrame title="Nouveau lot" icon={<Rows3 size={16} aria-hidden="true" />} status={status} result={result} onSubmit={submit} onDismiss={onDismiss}>
      <label className="field"><span className="field-label">Nom du lot</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
      <div className="field-pair">
        <label className="field">
          <span className="field-label">Espèce</span>
          <select value={species} onChange={(event) => setSpecies(event.target.value as Species | '')}>
            <option value="">Choisir…</option>
            {speciesOrder.map((value) => <option key={value} value={value}>{speciesLabels[value]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Suivi</span>
          <select value={tracking} onChange={(event) => setTracking(event.target.value as Tracking)}>
            {(['group', 'individual'] as Tracking[]).map((value) => <option key={value} value={value}>{trackingLabels[value]}</option>)}
          </select>
        </label>
      </div>
      <div className="field-pair">
        {tracking === 'group' && <label className="field"><span className="field-label">Effectif de départ</span><input inputMode="numeric" value={count} placeholder="À compléter" onChange={(event) => setCount(event.target.value)} /></label>}
        <label className="field"><span className="field-label">Date de début</span><input type="date" value={startedOn} max={today} onChange={(event) => setStartedOn(event.target.value)} /></label>
      </div>
    </ProposalFrame>
  )
}

function EventProposalCard({ proposal, status, result, api, business, herds, animals, onConfirm, onDismiss }: CardProps<Extract<LivestockProposal, { action: 'livestock_event' }>>) {
  const values = proposal.values
  const today = localDay(business.timezone)
  const [herdId, setHerdId] = useState(values.herdId ?? '')
  const [kind, setKind] = useState(values.kind)
  const [quantity, setQuantity] = useState(field(values.quantity))
  const [amount, setAmount] = useState(field(values.amount))
  const [cause, setCause] = useState(values.cause ?? '')
  const [occurredOn, setOccurredOn] = useState(values.occurredOn ?? today)
  const [tag, setTag] = useState(values.animalTag ?? '')
  const [sex, setSex] = useState<Sex>(values.sex ?? 'unknown')
  const [animalId, setAnimalId] = useState(values.animalId ?? '')
  const herd = herds.find((item) => item.id === herdId)
  const individual = herd?.tracking === 'individual'
  const present = animals.filter((animal) => animal.herdId === herdId && animal.status === 'present')
  const money = currencyLabel(business.currency)

  const submit = async () => {
    if (!herd) return values.herdId ? 'Lot introuvable.' : `Lot « ${values.herdName} » introuvable : choisissez le lot.`
    if (!occurredOn || occurredOn > today) return 'La date ne peut pas être dans le futur.'
    const value = needsAmount(kind) ? parseAmount(amount) : 0
    if (value === null) return 'Le montant est un nombre entier, sans centimes.'
    if (isCost(kind) && !value) return 'Indiquez le montant de la dépense.'
    const input: EventInput = { herdId, kind, amount: value, occurredOn, cause: kind === 'death' ? cause.trim() || null : null, note: values.note }
    if (individual && (kind === 'birth' || kind === 'purchase')) {
      if (!tag.trim()) return 'Indiquez le numéro de l’animal.'
      input.animal = { tag: tag.trim(), sex }
    } else if (individual && (kind === 'sale' || kind === 'death')) {
      if (!animalId) return 'Choisissez l’animal concerné.'
      input.animalId = animalId
    } else if (individual && kind === 'count') {
      return 'Un lot suivi un par un n’a pas d’inventaire : enregistrez chaque animal.'
    } else if (movesAnimals(kind) || kind === 'count') {
      const count = parseAmount(quantity)
      if (count === null || (movesAnimals(kind) && !count)) return 'Indiquez le nombre d’animaux.'
      input.quantity = count
    }
    await onConfirm(async () => {
      const event = await api.recordEvent(business.id, input)
      const what = `${eventLabels[event.kind]}${event.quantity && event.kind !== 'count' ? ` de ${event.quantity}` : ''}${event.animalTag ? ` (${event.animalTag})` : ''}`
      return `${what} enregistrée dans « ${event.herdName} »${event.amount ? `, ${formatAmount(event.amount, business.currency)}` : ''}.`
    })
  }

  return (
    <ProposalFrame title={eventLabels[kind]} icon={<NotebookPen size={16} aria-hidden="true" />} status={status} result={result} onSubmit={submit} onDismiss={onDismiss}>
      <div className="field-pair">
        <label className="field">
          <span className="field-label">Lot</span>
          <select value={herdId} onChange={(event) => { setHerdId(event.target.value); setAnimalId('') }}>
            <option value="">{values.herdId ? 'Choisir…' : `« ${values.herdName} » ? Choisir…`}</option>
            {herds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Événement</span>
          <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            {recordableEvents.map((value) => <option key={value} value={value}>{eventLabels[value]}</option>)}
          </select>
        </label>
      </div>
      {individual && (kind === 'birth' || kind === 'purchase') && (
        <div className="field-pair">
          <label className="field"><span className="field-label">Numéro de l’animal</span><input value={tag} maxLength={40} placeholder="À compléter" onChange={(event) => setTag(event.target.value)} /></label>
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
            <option value="">{values.animalTag && !values.animalId ? `« ${values.animalTag} » ? Choisir…` : 'Choisir…'}</option>
            {present.map((animal) => <option key={animal.id} value={animal.id}>{animal.tag}</option>)}
          </select>
        </label>
      )}
      <div className="field-pair">
        {!individual && (movesAnimals(kind) || kind === 'count') && (
          <label className="field"><span className="field-label">{kind === 'count' ? 'Animaux comptés' : 'Nombre d’animaux'}</span><input inputMode="numeric" value={quantity} placeholder="À compléter" onChange={(event) => setQuantity(event.target.value)} /></label>
        )}
        {needsAmount(kind) && (
          <label className="field"><span className="field-label">Montant ({money})</span><input inputMode="numeric" value={amount} placeholder={isCost(kind) ? 'À compléter' : 'Facultatif'} onChange={(event) => setAmount(event.target.value)} /></label>
        )}
      </div>
      {kind === 'death' && <label className="field"><span className="field-label">Cause</span><input value={cause} maxLength={200} onChange={(event) => setCause(event.target.value)} /></label>}
      <label className="field"><span className="field-label">Date</span><input type="date" value={occurredOn} max={today} onChange={(event) => setOccurredOn(event.target.value)} /></label>
    </ProposalFrame>
  )
}

function HealthProposalCard({ proposal, status, result, api, business, herds, animals, onConfirm, onDismiss }: CardProps<Extract<LivestockProposal, { action: 'livestock_health' }>>) {
  const values = proposal.values
  const today = localDay(business.timezone)
  const [herdId, setHerdId] = useState(values.herdId ?? '')
  const [kind, setKind] = useState<HealthKind>(values.kind)
  const [product, setProduct] = useState(values.product)
  const [state, setState] = useState<'planned' | 'done'>(values.doneOn ? 'done' : 'planned')
  const [date, setDate] = useState(values.doneOn ?? values.dueOn ?? '')
  const [cost, setCost] = useState(field(values.cost))
  const [animalId, setAnimalId] = useState(values.animalId ?? '')
  const herd = herds.find((item) => item.id === herdId)
  const present = animals.filter((animal) => animal.herdId === herdId && animal.status === 'present')

  const submit = async () => {
    if (!herd) return `Lot « ${values.herdName} » introuvable : choisissez le lot.`
    if (!product.trim()) return 'Indiquez le vaccin, le traitement ou le motif.'
    if (!date) return state === 'planned' ? 'Indiquez la date prévue.' : 'Indiquez la date du soin.'
    if (state === 'done' && date > today) return 'Un soin fait ne peut pas être daté dans le futur.'
    const value = state === 'done' ? parseAmount(cost) : 0
    if (value === null) return 'Le coût est un nombre entier, sans centimes.'
    await onConfirm(async () => {
      const record = await api.createHealth(business.id, { herdId, animalId: animalId || null, kind, product: product.trim(), ...(state === 'done' ? { doneOn: date, cost: value } : { dueOn: date }), note: values.note })
      return state === 'done' ? `${healthLabels[record.kind]} « ${record.product} » enregistrée.` : `Rappel enregistré : ${healthLabels[record.kind].toLowerCase()} « ${record.product} ».`
    })
  }

  return (
    <ProposalFrame title={state === 'planned' ? 'Soin à prévoir' : 'Soin fait'} icon={<Syringe size={16} aria-hidden="true" />} status={status} result={result} onSubmit={submit} onDismiss={onDismiss}>
      <div className="field-pair">
        <label className="field">
          <span className="field-label">Lot</span>
          <select value={herdId} onChange={(event) => { setHerdId(event.target.value); setAnimalId('') }}>
            <option value="">{values.herdId ? 'Choisir…' : `« ${values.herdName} » ? Choisir…`}</option>
            {herds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Type de soin</span>
          <select value={kind} onChange={(event) => setKind(event.target.value as HealthKind)}>
            {(Object.keys(healthLabels) as HealthKind[]).map((value) => <option key={value} value={value}>{healthLabels[value]}</option>)}
          </select>
        </label>
      </div>
      {herd?.tracking === 'individual' && (
        <label className="field">
          <span className="field-label">Animal</span>
          <select value={animalId} onChange={(event) => setAnimalId(event.target.value)}>
            <option value="">Tout le lot</option>
            {present.map((animal) => <option key={animal.id} value={animal.id}>{animal.tag}</option>)}
          </select>
        </label>
      )}
      <label className="field"><span className="field-label">Vaccin, traitement ou motif</span><input value={product} maxLength={120} onChange={(event) => setProduct(event.target.value)} /></label>
      <div className="field-pair">
        <label className="field">
          <span className="field-label">État</span>
          <select value={state} onChange={(event) => setState(event.target.value as 'planned' | 'done')}>
            <option value="planned">À faire (rappel)</option>
            <option value="done">Déjà fait</option>
          </select>
        </label>
        <label className="field"><span className="field-label">{state === 'planned' ? 'Date prévue' : 'Date du soin'}</span><input type="date" value={date} max={state === 'done' ? today : undefined} onChange={(event) => setDate(event.target.value)} /></label>
      </div>
      {state === 'done' && <label className="field"><span className="field-label">Coût ({currencyLabel(business.currency)})</span><input inputMode="numeric" value={cost} placeholder="Facultatif" onChange={(event) => setCost(event.target.value)} /></label>}
      <p className="field-hint">Ni dose ni posologie : suivez l’avis de votre vétérinaire.</p>
    </ProposalFrame>
  )
}

/** Fiche préparée par l’assistant Élevage : vérifiée, corrigée puis confirmée par l’éleveur. */
export function LivestockProposalCard(props: CardProps<LivestockProposal>) {
  const { proposal } = props
  switch (proposal.action) {
    case 'create_herd': return <HerdProposalCard {...props} proposal={proposal} />
    case 'livestock_event': return <EventProposalCard {...props} proposal={proposal} />
    case 'livestock_health': return <HealthProposalCard {...props} proposal={proposal} />
  }
}
