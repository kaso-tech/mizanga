import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { totalsOf } from '../../app/livestock'
import type { Business } from '../../services/businessApi'
import type { Animal, HealthRecord, Herd, HerdSummary, LivestockApi } from '../../services/livestockApi'
import { EventDialog } from './EventDialog'
import { HealthPanel } from './HealthPanel'
import { LivestockProposalCard } from './LivestockProposalCard'
import { LivestockResults } from './LivestockResults'

const business: Business = { id: 'b1', name: 'Ferme Awa', currency: 'XOF', countryCode: 'BF', timezone: 'UTC', role: 'owner' }
const today = new Date().toISOString().slice(0, 10)
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
const poultry: Herd = { id: 'h1', name: 'Poulets bande 1', species: 'poultry', tracking: 'group', headcount: 150, startedOn: day(-20), note: null, archived: false }
const cattle: Herd = { id: 'h2', name: 'Bovins', species: 'cattle', tracking: 'individual', headcount: 1, startedOn: day(-90), note: null, archived: false }
const cow: Animal = { id: 'a1', herdId: 'h2', tag: 'BF-001', name: null, sex: 'female', bornOn: null, status: 'present' }

const summaryRow = (changes: Partial<HerdSummary>): HerdSummary => ({
  herdId: 'h1', herdName: 'Poulets bande 1', species: 'poultry', tracking: 'group', archived: false, headcount: 0, openingHeadcount: 0, closingHeadcount: 0,
  births: 0, purchases: 0, sales: 0, deaths: 0, countAdjustment: 0, mortalityRate: null, purchaseCost: 0, feedCost: 0, healthCost: 0, otherCost: 0, totalCost: 0, salesRevenue: 0, estimatedMargin: 0, ...changes,
})

describe('calculs affichés de l’élevage', () => {
  it('additionne les lots et recalcule la mortalité sur l’ensemble', () => {
    const totals = totalsOf([
      summaryRow({ openingHeadcount: 200, deaths: 4, closingHeadcount: 146, totalCost: 51000, salesRevenue: 150000, estimatedMargin: 99000 }),
      summaryRow({ herdId: 'h2', openingHeadcount: 0, purchases: 1, closingHeadcount: 1, totalCost: 350000, estimatedMargin: -350000 }),
    ])
    // 4 morts sur 201 animaux exposés : 1,99 % → 2 %.
    expect(totals).toEqual({ closingHeadcount: 147, deaths: 4, mortalityRate: 2, totalCost: 401000, salesRevenue: 150000, estimatedMargin: -251000 })
    expect(totalsOf([]).mortalityRate).toBeNull()
  })

  it('montre les résultats par lot calculés par le serveur', async () => {
    const api = { summary: vi.fn(async () => [summaryRow({ openingHeadcount: 200, deaths: 4, mortalityRate: 2, closingHeadcount: 146, feedCost: 45000, healthCost: 6000, totalCost: 51000, salesRevenue: 150000, estimatedMargin: 99000 })]) } as unknown as LivestockApi
    render(<LivestockResults api={api} business={business} period={{ start: day(-29), end: today }} picker={null} version={0} />)
    const table = await screen.findByRole('table', { name: 'Résultats par lot' })
    const row = within(table).getByRole('row', { name: /Poulets bande 1/ })
    const plain = (row.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ')
    expect(plain).toContain('2 %')
    expect(plain).toContain('99 000 F CFA')
    expect(screen.getByText(/séparés de ceux du Commerce/)).toBeInTheDocument()
    expect(screen.getByText(/pas un résultat comptable ou fiscal certifié/)).toBeInTheDocument()
  })
})

describe('saisie d’un événement', () => {
  it('lot en groupe : nombre d’animaux et cause de la mortalité, avec un rappel de prudence', async () => {
    const onSave = vi.fn(async () => {})
    render(<EventDialog herds={[poultry, cattle]} animals={[cow]} today={today} initialHerdId="h1" onSave={onSave} onClose={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Événement'), 'death')
    expect(screen.getByText(/contactez un vétérinaire/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Indiquez le nombre d’animaux.')
    await userEvent.type(screen.getByLabelText('Nombre d’animaux'), '3')
    await userEvent.type(screen.getByLabelText('Cause (si connue)'), 'Chaleur')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave).toHaveBeenCalledWith({ herdId: 'h1', kind: 'death', quantity: 3, amount: 0, occurredOn: today, note: null, cause: 'Chaleur' })
  })

  it('lot suivi un par un : numéro du nouvel animal, ou animal vendu ; pas d’inventaire', async () => {
    const onSave = vi.fn(async () => {})
    const first = render(<EventDialog herds={[poultry, cattle]} animals={[cow]} today={today} initialHerdId="h2" onSave={onSave} onClose={() => {}} />)
    expect(within(screen.getByLabelText('Événement')).queryByRole('option', { name: 'Inventaire (comptage)' })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Événement'), 'purchase')
    await userEvent.type(screen.getByLabelText('Numéro de l’animal'), 'BF-002')
    await userEvent.selectOptions(screen.getByLabelText('Sexe'), 'male')
    await userEvent.type(screen.getByLabelText(/Prix d’achat total/), '300 000')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ herdId: 'h2', kind: 'purchase', amount: 300000, animal: { tag: 'BF-002', sex: 'male' } }))
    first.unmount()

    render(<EventDialog herds={[poultry, cattle]} animals={[cow]} today={today} initialHerdId="h2" initialKind="sale" onSave={onSave} onClose={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Animal'), 'a1')
    await userEvent.type(screen.getByLabelText(/Montant de la vente/), '420000')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'sale', amount: 420000, animalId: 'a1' }))
  })

  it('refuse une date future et une dépense sans montant', async () => {
    const onSave = vi.fn(async () => {})
    render(<EventDialog herds={[poultry]} animals={[]} today={today} onSave={onSave} onClose={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Événement'), 'feed')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Indiquez le montant de la dépense.')
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('santé du troupeau', () => {
  const records: HealthRecord[] = [
    { id: 's1', herdId: 'h1', herdName: 'Poulets bande 1', animalId: null, animalTag: null, kind: 'vaccination', product: 'Newcastle', dueOn: day(-2), doneOn: null, status: 'planned', cost: 0, note: null },
    { id: 's2', herdId: 'h2', herdName: 'Bovins', animalId: 'a1', animalTag: 'BF-001', kind: 'deworming', product: 'Déparasitage de saison', dueOn: day(5), doneOn: null, status: 'planned', cost: 0, note: null },
  ]

  it('classe les rappels en retard et à venir, et marque un soin comme fait', async () => {
    const onDone = vi.fn(async () => {})
    render(<HealthPanel business={business} health={records} today={today} onNewHealth={() => {}} onDone={onDone} onCancel={async () => {}} />)
    const late = screen.getByRole('list', { name: 'Soins en retard' })
    expect(late).toHaveTextContent('Vaccination : Newcastle')
    expect(late).toHaveTextContent('En retard de 2 jours')
    expect(screen.getByRole('list', { name: 'Soins à venir' })).toHaveTextContent('Dans 5 jours')
    expect(screen.getByText(/ne donne ni dose ni traitement/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Marquer comme fait : Newcastle (Poulets bande 1)' }))
    const dialog = screen.getByRole('dialog', { name: 'Soin fait : Newcastle' })
    await userEvent.type(within(dialog).getByLabelText(/Coût/), '6 000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Marquer comme fait' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(records[0], today, 6000))
  })
})

describe('fiches de l’assistant Élevage', () => {
  it('enregistre une mortalité seulement après confirmation, et demande le lot s’il est introuvable', async () => {
    const recordEvent = vi.fn(async () => ({ id: 'e1', herdId: 'h1', herdName: 'Poulets bande 1', animalId: null, animalTag: null, kind: 'death' as const, quantity: 3, headcountDelta: -3, amount: 0, cause: 'inconnue', note: null, occurredOn: today, status: 'recorded' as const, cancelReason: null, createdAt: new Date().toISOString() }))
    const api = { recordEvent } as unknown as LivestockApi
    const onConfirm = vi.fn(async (save: () => Promise<string>) => { await save() })
    const values = { herdId: null, herdName: 'Pintades', kind: 'death' as const, quantity: 3, amount: null, cause: 'inconnue', occurredOn: null, animalId: null, animalTag: null, sex: null, note: null }
    render(<LivestockProposalCard proposal={{ id: 'p1', action: 'livestock_event', values }} status="pending" api={api} business={business} herds={[poultry, cattle]} animals={[cow]} onConfirm={onConfirm} onDismiss={() => {}} />)
    const card = screen.getByRole('form', { name: 'Fiche à vérifier : Mortalité' })
    await userEvent.click(within(card).getByRole('button', { name: 'Confirmer et enregistrer' }))
    expect(await within(card).findByRole('alert')).toHaveTextContent('Lot « Pintades » introuvable')
    expect(recordEvent).not.toHaveBeenCalled()

    await userEvent.selectOptions(within(card).getByLabelText('Lot'), 'h1')
    expect(within(card).getByLabelText('Nombre d’animaux')).toHaveValue('3')
    await userEvent.click(within(card).getByRole('button', { name: 'Confirmer et enregistrer' }))
    await waitFor(() => expect(recordEvent).toHaveBeenCalledWith('b1', { herdId: 'h1', kind: 'death', amount: 0, occurredOn: today, cause: 'inconnue', note: null, quantity: 3 }))
  })

  it('prépare un rappel de soin sans dose', async () => {
    const createHealth = vi.fn(async () => ({ id: 's9', herdId: 'h2', herdName: 'Bovins', animalId: 'a1', animalTag: 'BF-001', kind: 'vaccination' as const, product: 'Pasteurellose', dueOn: day(10), doneOn: null, status: 'planned' as const, cost: 0, note: null }))
    const api = { createHealth } as unknown as LivestockApi
    const values = { herdId: 'h2', herdName: 'Bovins', kind: 'vaccination' as const, product: 'Pasteurellose', dueOn: day(10), doneOn: null, cost: null, animalId: 'a1', animalTag: 'BF-001', note: null }
    render(<LivestockProposalCard proposal={{ id: 'p2', action: 'livestock_health', values }} status="pending" api={api} business={business} herds={[poultry, cattle]} animals={[cow]} onConfirm={async (save) => { await save() }} onDismiss={() => {}} />)
    const card = screen.getByRole('form', { name: 'Fiche à vérifier : Soin à prévoir' })
    expect(within(card).getByText(/Ni dose ni posologie/)).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Confirmer et enregistrer' }))
    await waitFor(() => expect(createHealth).toHaveBeenCalledWith('b1', { herdId: 'h2', animalId: 'a1', kind: 'vaccination', product: 'Pasteurellose', dueOn: day(10), note: null }))
  })
})
