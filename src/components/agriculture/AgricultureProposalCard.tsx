import { CalendarClock, MapPinned, NotebookPen, Sprout } from 'lucide-react'
import { useState } from 'react'
import { areaUnitLabels, cropGroups, cropLabels, cropName, harvestUnitLabels, harvestUnits, inputLabels, inputUnits, movesHarvest, needsUnitWeight, operationKinds, operationLabels, parseDecimal, seasonLabels, tenureLabels, workLabels } from '../../app/agriculture'
import { currencyLabel, formatAmount, parseAmount } from '../../app/businessFormat'
import { localDay } from '../../app/businessPeriods'
import type { Business } from '../../services/businessApi'
import type { AgricultureApi, AgricultureProposal, AreaUnit, Crop, CropCode, InputType, OperationInput, OperationKind, Plot, Season, Tenure, WorkType } from '../../services/agricultureApi'
import { ProposalFrame, type ProposalStatus } from '../business/ProposalCard'

const field = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

interface CardProps<P extends AgricultureProposal> {
  proposal: P
  status: ProposalStatus
  result?: string
  api: AgricultureApi
  business: Business
  plots: Plot[]
  crops: Crop[]
  onConfirm: (save: () => Promise<string>) => Promise<void>
  onDismiss: () => void
}

function AreaFields({ area, unit, onArea, onUnit, label = 'Surface' }: { area: string; unit: AreaUnit; onArea: (value: string) => void; onUnit: (value: AreaUnit) => void; label?: string }) {
  return (
    <div className="field-pair">
      <label className="field"><span className="field-label">{label}</span><input inputMode="decimal" value={area} placeholder="À compléter" onChange={(event) => onArea(event.target.value)} /></label>
      <label className="field">
        <span className="field-label">Unité</span>
        <select value={unit} onChange={(event) => onUnit(event.target.value as AreaUnit)}>
          {(Object.keys(areaUnitLabels) as AreaUnit[]).map((value) => <option key={value} value={value}>{areaUnitLabels[value]}</option>)}
        </select>
      </label>
    </div>
  )
}

function PlotProposalCard({ proposal, status, result, api, business, onConfirm, onDismiss }: CardProps<Extract<AgricultureProposal, { action: 'create_plot' }>>) {
  const values = proposal.values
  const [name, setName] = useState(values.name)
  const [location, setLocation] = useState(values.location ?? '')
  const [area, setArea] = useState(field(values.area))
  const [unit, setUnit] = useState<AreaUnit>(values.areaUnit)
  const [tenure, setTenure] = useState<Tenure>(values.tenure ?? 'owned')
  const submit = async () => {
    if (!name.trim()) return 'Donnez un nom à la parcelle.'
    const value = parseDecimal(area)
    if (value === null) return 'Indiquez la surface.'
    await onConfirm(async () => {
      const plot = await api.createPlot(business.id, { name: name.trim(), location: location.trim() || null, area: value, areaUnit: unit, tenure })
      return `Parcelle « ${plot.name} » créée.`
    })
  }
  return (
    <ProposalFrame title="Nouvelle parcelle" icon={<MapPinned size={16} aria-hidden="true" />} status={status} result={result} onSubmit={submit} onDismiss={onDismiss}>
      <label className="field"><span className="field-label">Nom de la parcelle</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
      <label className="field"><span className="field-label">Village ou lieu</span><input value={location} maxLength={80} onChange={(event) => setLocation(event.target.value)} /></label>
      <AreaFields area={area} unit={unit} onArea={setArea} onUnit={setUnit} />
      <label className="field">
        <span className="field-label">La terre est</span>
        <select value={tenure} onChange={(event) => setTenure(event.target.value as Tenure)}>
          {(Object.keys(tenureLabels) as Tenure[]).map((value) => <option key={value} value={value}>{tenureLabels[value]}</option>)}
        </select>
      </label>
    </ProposalFrame>
  )
}

function CropProposalCard({ proposal, status, result, api, business, plots, onConfirm, onDismiss }: CardProps<Extract<AgricultureProposal, { action: 'create_crop' }>>) {
  const values = proposal.values
  const today = localDay(business.timezone)
  const [plotId, setPlotId] = useState(values.plotId ?? '')
  const [crop, setCrop] = useState<CropCode | ''>(values.crop ?? '')
  const [label, setLabel] = useState(values.customLabel ?? '')
  const [season, setSeason] = useState<Season>(values.season ?? 'rainy')
  const [year, setYear] = useState(String(values.year ?? today.slice(0, 4)))
  const [area, setArea] = useState(field(values.area))
  const [unit, setUnit] = useState<AreaUnit>(values.areaUnit)
  const [sownOn, setSownOn] = useState(values.sownOn ?? '')
  const submit = async () => {
    if (!plots.some((plot) => plot.id === plotId)) return `Parcelle « ${values.plotName} » introuvable : choisissez la parcelle.`
    if (!crop) return 'Choisissez la culture.'
    if (crop === 'other' && !label.trim()) return 'Indiquez le nom de la culture.'
    const value = parseDecimal(area)
    if (value === null) return 'Indiquez la surface cultivée.'
    const numericYear = Number(year)
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) return 'Année invalide.'
    await onConfirm(async () => {
      const created = await api.createCrop(business.id, { plotId, crop, label: crop === 'other' ? label.trim() : null, season, year: numericYear, area: value, areaUnit: unit, sownOn: sownOn || null, expectedHarvestOn: values.expectedHarvestOn })
      return `Culture « ${cropName(created)} » créée.`
    })
  }
  return (
    <ProposalFrame title="Nouvelle culture" icon={<Sprout size={16} aria-hidden="true" />} status={status} result={result} onSubmit={submit} onDismiss={onDismiss}>
      <label className="field">
        <span className="field-label">Parcelle</span>
        <select value={plotId} onChange={(event) => setPlotId(event.target.value)}>
          <option value="">{values.plotId ? 'Choisir…' : `« ${values.plotName} » ? Choisir…`}</option>
          {plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.name}</option>)}
        </select>
      </label>
      <div className="field-pair">
        <label className="field">
          <span className="field-label">Culture</span>
          <select value={crop} onChange={(event) => setCrop(event.target.value as CropCode | '')}>
            <option value="">Choisir…</option>
            {cropGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.crops.map((value) => <option key={value} value={value}>{cropLabels[value]}</option>)}</optgroup>)}
          </select>
        </label>
        {crop === 'other' && <label className="field"><span className="field-label">Nom de la culture</span><input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} /></label>}
      </div>
      <div className="field-pair">
        <label className="field">
          <span className="field-label">Saison</span>
          <select value={season} onChange={(event) => setSeason(event.target.value as Season)}>
            {(Object.keys(seasonLabels) as Season[]).map((value) => <option key={value} value={value}>{seasonLabels[value]}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Année</span><input inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value)} /></label>
      </div>
      <AreaFields area={area} unit={unit} onArea={setArea} onUnit={setUnit} label="Surface cultivée" />
      <label className="field"><span className="field-label">Date de semis</span><input type="date" value={sownOn} onChange={(event) => setSownOn(event.target.value)} /></label>
    </ProposalFrame>
  )
}

function OperationProposalCard({ proposal, status, result, api, business, crops, onConfirm, onDismiss }: CardProps<Extract<AgricultureProposal, { action: 'farm_operation' }>>) {
  const values = proposal.values
  const today = localDay(business.timezone)
  const [cropId, setCropId] = useState(values.cropId ?? '')
  const [kind, setKind] = useState<OperationKind>(values.kind)
  const [workType, setWorkType] = useState<WorkType | ''>(values.workType ?? '')
  const [inputType, setInputType] = useState<InputType | ''>(values.inputType ?? '')
  const [label, setLabel] = useState(values.label ?? '')
  const [quantity, setQuantity] = useState(field(values.quantity))
  const [unit, setUnit] = useState(values.unit ?? 'kg')
  const [unitKg, setUnitKg] = useState(field(values.unitKg))
  const [amount, setAmount] = useState(field(values.amount))
  const [occurredOn, setOccurredOn] = useState(values.occurredOn ?? today)
  const crop = crops.find((item) => item.id === cropId)
  const withAmount = kind === 'work' || kind === 'input' || kind === 'rental' || kind === 'expense' || kind === 'sale'
  const units = movesHarvest(kind) ? harvestUnits : inputUnits

  const submit = async () => {
    if (!crop) return `Culture « ${values.cropName} » introuvable : choisissez la culture.`
    if (!occurredOn || occurredOn > today) return 'La date ne peut pas être dans le futur.'
    const input: OperationInput = { cropId, kind, occurredOn, label: label.trim() || null, note: values.note }
    if (kind === 'work') {
      if (!workType) return 'Choisissez le travail.'
      input.workType = workType
    }
    if (kind === 'input') {
      if (!inputType) return 'Choisissez le type d’intrant.'
      input.inputType = inputType
    }
    if (movesHarvest(kind) || kind === 'input') {
      const value = quantity.trim() ? parseDecimal(quantity) : null
      if (movesHarvest(kind) && value === null) return 'Indiquez la quantité.'
      input.quantity = value
      input.unit = value === null ? null : unit
      if (movesHarvest(kind) && needsUnitWeight(unit)) {
        const weight = parseDecimal(unitKg)
        if (weight === null) return `Indiquez le poids d’un ${unit} en kg.`
        input.unitKg = weight
      }
    }
    if (withAmount) {
      const value = parseAmount(amount)
      if (value === null) return 'Le montant est un nombre entier, sans centimes.'
      if ((kind === 'rental' || kind === 'expense') && !value) return 'Indiquez le montant.'
      input.amount = value
    }
    await onConfirm(async () => {
      const operation = await api.recordOperation(business.id, input)
      const quantityText = operation.quantityKg ? ` de ${operation.quantityKg.toLocaleString('fr')} kg` : ''
      return `${operationLabels[operation.kind]}${quantityText} enregistrée (${cropName(operation)})${operation.amount ? `, ${formatAmount(operation.amount, business.currency)}` : ''}.`
    })
  }

  return (
    <ProposalFrame title={operationLabels[kind]} icon={<NotebookPen size={16} aria-hidden="true" />} status={status} result={result} onSubmit={submit} onDismiss={onDismiss}>
      <div className="field-pair">
        <label className="field">
          <span className="field-label">Culture</span>
          <select value={cropId} onChange={(event) => setCropId(event.target.value)}>
            <option value="">{values.cropId ? 'Choisir…' : `« ${values.cropName} » ? Choisir…`}</option>
            {crops.map((item) => <option key={item.id} value={item.id}>{cropName(item)} ({item.year})</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Opération</span>
          <select value={kind} onChange={(event) => setKind(event.target.value as OperationKind)}>
            {operationKinds.map((value) => <option key={value} value={value}>{operationLabels[value]}</option>)}
          </select>
        </label>
      </div>
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
          <label className="field"><span className="field-label">Produit</span><input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} /></label>
        </div>
      )}
      {(movesHarvest(kind) || kind === 'input') && (
        <div className="field-pair">
          <label className="field"><span className="field-label">Quantité</span><input inputMode="decimal" value={quantity} placeholder={movesHarvest(kind) ? 'À compléter' : 'Facultatif'} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label className="field">
            <span className="field-label">Unité</span>
            <select value={units.includes(unit as never) ? unit : units[0]} onChange={(event) => setUnit(event.target.value)}>
              {units.map((value) => <option key={value} value={value}>{movesHarvest(kind) ? harvestUnitLabels[value as keyof typeof harvestUnitLabels] : value}</option>)}
            </select>
          </label>
        </div>
      )}
      {movesHarvest(kind) && needsUnitWeight(unit) && <label className="field"><span className="field-label">Poids d’un {unit} (kg)</span><input inputMode="decimal" value={unitKg} placeholder="À compléter" onChange={(event) => setUnitKg(event.target.value)} /></label>}
      {withAmount && <label className="field"><span className="field-label">Montant ({currencyLabel(business.currency)})</span><input inputMode="numeric" value={amount} placeholder={kind === 'rental' || kind === 'expense' ? 'À compléter' : 'Facultatif'} onChange={(event) => setAmount(event.target.value)} /></label>}
      <label className="field"><span className="field-label">Date</span><input type="date" value={occurredOn} max={today} onChange={(event) => setOccurredOn(event.target.value)} /></label>
      {((kind === 'input' && inputType === 'treatment_product') || (kind === 'work' && workType === 'treatment')) && (
        <p className="field-hint">Ni dose ni dilution : suivez l’étiquette et l’avis de l’agent d’agriculture.</p>
      )}
    </ProposalFrame>
  )
}

function TaskProposalCard({ proposal, status, result, api, business, crops, onConfirm, onDismiss }: CardProps<Extract<AgricultureProposal, { action: 'farm_task' }>>) {
  const values = proposal.values
  const [cropId, setCropId] = useState(values.cropId ?? '')
  const [workType, setWorkType] = useState<WorkType>(values.workType)
  const [label, setLabel] = useState(values.label ?? '')
  const [dueOn, setDueOn] = useState(values.dueOn ?? '')
  const submit = async () => {
    if (!crops.some((crop) => crop.id === cropId)) return `Culture « ${values.cropName} » introuvable : choisissez la culture.`
    if (!dueOn) return 'Indiquez la date prévue.'
    await onConfirm(async () => {
      const task = await api.createTask(business.id, { cropId, workType, label: label.trim() || null, dueOn })
      return `Rappel enregistré : ${(task.label ?? workLabels[task.workType]).toLowerCase()} (${cropName(task)}).`
    })
  }
  return (
    <ProposalFrame title="Travail à prévoir" icon={<CalendarClock size={16} aria-hidden="true" />} status={status} result={result} onSubmit={submit} onDismiss={onDismiss}>
      <label className="field">
        <span className="field-label">Culture</span>
        <select value={cropId} onChange={(event) => setCropId(event.target.value)}>
          <option value="">{values.cropId ? 'Choisir…' : `« ${values.cropName} » ? Choisir…`}</option>
          {crops.map((item) => <option key={item.id} value={item.id}>{cropName(item)} ({item.year})</option>)}
        </select>
      </label>
      <div className="field-pair">
        <label className="field">
          <span className="field-label">Travail</span>
          <select value={workType} onChange={(event) => setWorkType(event.target.value as WorkType)}>
            {(Object.keys(workLabels) as WorkType[]).map((value) => <option key={value} value={value}>{workLabels[value]}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Date prévue</span><input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} /></label>
      </div>
      <label className="field"><span className="field-label">Précision</span><input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} /></label>
    </ProposalFrame>
  )
}

/** Fiche préparée par l’assistant Agriculture : vérifiée, corrigée puis confirmée par l’agriculteur. */
export function AgricultureProposalCard(props: CardProps<AgricultureProposal>) {
  const { proposal } = props
  switch (proposal.action) {
    case 'create_plot': return <PlotProposalCard {...props} proposal={proposal} />
    case 'create_crop': return <CropProposalCard {...props} proposal={proposal} />
    case 'farm_operation': return <OperationProposalCard {...props} proposal={proposal} />
    case 'farm_task': return <TaskProposalCard {...props} proposal={proposal} />
  }
}
