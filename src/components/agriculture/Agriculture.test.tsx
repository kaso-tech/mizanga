import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { farmTotals, formatArea, formatKg, parseDecimal } from '../../app/agriculture'
import type { AgricultureApi, Crop, CropResult, FarmTask, Plot } from '../../services/agricultureApi'
import type { Business } from '../../services/businessApi'
import { AgricultureProposalCard } from './AgricultureProposalCard'
import { FarmResults } from './FarmResults'
import { OperationDialog } from './OperationDialog'
import { PlotDialog } from './PlotDialog'
import { TasksPanel } from './TasksPanel'

const business: Business = { id: 'b1', name: 'Ferme Awa', currency: 'XOF', countryCode: 'BF', timezone: 'UTC', role: 'owner' }
const today = new Date().toISOString().slice(0, 10)
const year = Number(today.slice(0, 4))
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
const plot: Plot = { id: 'p1', name: 'Champ 1', location: 'Koudougou', areaM2: 20000, areaUnit: 'ha', tenure: 'owned', note: null, archived: false }
const maize: Crop = { id: 'c1', plotId: 'p1', plotName: 'Champ 1', crop: 'maize', cropLabel: 'Maïs', season: 'rainy', year, areaM2: 15000, sownOn: null, expectedHarvestOn: null, status: 'active', harvestedKg: 1800, stockKg: 800, note: null }
const plain = (text: string | null) => (text ?? '').replace(/[\u00a0\u202f]/g, ' ')

const result = (changes: Partial<CropResult>): CropResult => ({
  cropId: 'c1', crop: 'maize', cropLabel: 'Maïs', plotId: 'p1', plotName: 'Champ 1', season: 'rainy', year, status: 'active', areaM2: 15000, harvestedKg: 0, yieldKgPerHa: 0,
  soldKg: 0, consumedKg: 0, lostKg: 0, stockKg: 0, inputCost: 0, labourCost: 0, rentalCost: 0, otherCost: 0, totalCost: 0, salesRevenue: 0, estimatedMargin: 0, ...changes,
})

describe('calculs et saisies de l’agriculture', () => {
  it('lit les nombres à la française et affiche surfaces et quantités', () => {
    expect(parseDecimal('1,5')).toBe(1.5)
    expect(parseDecimal('2 500')).toBe(2500)
    expect(parseDecimal('0')).toBeNull()
    expect(parseDecimal('1,2345')).toBeNull()
    expect(formatArea(15000, 'ha')).toBe('1,5 ha')
    expect(plain(formatArea(800, 'm2'))).toBe('800 m²')
    expect(plain(formatKg(1800))).toBe('1 800 kg')
    expect(formatKg(12500)).toBe('12,5 t')
    expect(farmTotals([result({ harvestedKg: 1800, stockKg: 800, totalCost: 80000, salesRevenue: 250000, estimatedMargin: 170000 }), result({ cropId: 'c2', harvestedKg: 0.5, totalCost: 5000, estimatedMargin: -5000 })]))
      .toEqual({ harvestedKg: 1800.5, stockKg: 800, totalCost: 85000, salesRevenue: 250000, estimatedMargin: 165000 })
  })

  it('crée une parcelle en hectares en montrant l’équivalent en m²', async () => {
    const onSave = vi.fn(async () => {})
    render(<PlotDialog onSave={onSave} onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText('Nom de la parcelle'), 'Champ 1')
    await userEvent.type(screen.getByLabelText('Surface'), '1,5')
    expect(plain(screen.getByText(/Soit/).textContent)).toContain('15 000 m²')
    await userEvent.selectOptions(screen.getByLabelText('La terre est'), 'rented')
    expect(screen.getByText(/opération « Location »/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Créer la parcelle' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'Champ 1', location: null, area: 1.5, areaUnit: 'ha', tenure: 'rented', note: null })
  })

  it('enregistre une récolte en sacs avec le poids d’un sac', async () => {
    const onSave = vi.fn(async () => {})
    render(<OperationDialog crops={[maize]} today={today} onSave={onSave} onClose={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Opération'), 'harvest')
    await userEvent.type(screen.getByLabelText('Quantité'), '18')
    await userEvent.selectOptions(screen.getByLabelText('Unité'), 'sac')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Indiquez le poids d’un sac en kg.')
    await userEvent.type(screen.getByLabelText('Poids d’un sac (kg)'), '100')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave).toHaveBeenCalledWith({ cropId: 'c1', kind: 'harvest', occurredOn: today, label: null, note: null, quantity: 18, unit: 'sac', unitKg: 100 })
  })

  it('rappelle la prudence pour un produit de traitement et ne propose que les sorties pour une culture clôturée', async () => {
    const { unmount } = render(<OperationDialog crops={[maize]} today={today} onSave={async () => {}} onClose={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Opération'), 'input')
    await userEvent.selectOptions(screen.getByLabelText('Type d’intrant'), 'treatment_product')
    expect(screen.getByText(/suivez l’étiquette et l’avis de l’agent d’agriculture/)).toBeInTheDocument()
    unmount()
    render(<OperationDialog crops={[{ ...maize, status: 'closed' }]} today={today} onSave={async () => {}} onClose={() => {}} />)
    expect(within(screen.getByLabelText('Opération')).getAllByRole('option').map((option) => option.textContent)).toEqual(['Choisir…', 'Vente de récolte', 'Consommation familiale', 'Perte'])
  })
})

describe('travaux et résultats', () => {
  it('classe les travaux prévus et en marque un comme fait, avec la main-d’œuvre', async () => {
    const tasks: FarmTask[] = [{ id: 't1', cropId: 'c1', cropLabel: 'Maïs', plotName: 'Champ 1', workType: 'weeding', label: 'Deuxième sarclage', dueOn: day(-3), status: 'planned', doneOn: null }]
    const onDone = vi.fn(async () => {})
    render(<TasksPanel tasks={tasks} today={today} onNewTask={() => {}} onDone={onDone} onCancel={async () => {}} />)
    expect(screen.getByRole('list', { name: 'Travaux en retard' })).toHaveTextContent('En retard de 3 jours')
    await userEvent.click(screen.getByRole('button', { name: 'Marquer comme fait : Deuxième sarclage (Maïs — Champ 1)' }))
    const dialog = screen.getByRole('dialog', { name: 'Travail fait : Deuxième sarclage' })
    await userEvent.type(within(dialog).getByLabelText(/Main-d’œuvre/), '7 500')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Marquer comme fait' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(tasks[0], today, 7500))
  })

  it('montre rendement, stock et marge par culture, calculés par le serveur', async () => {
    const api = { results: vi.fn(async () => [result({ harvestedKg: 1800, yieldKgPerHa: 1200, soldKg: 1000, stockKg: 800, totalCost: 80000, salesRevenue: 250000, estimatedMargin: 170000 })]) } as unknown as AgricultureApi
    render(<FarmResults api={api} business={business} today={today} version={0} />)
    const row = within(await screen.findByRole('table', { name: 'Résultats par culture' })).getByRole('row', { name: /Maïs — Champ 1/ })
    expect(plain(row.textContent)).toContain('1 200 kg/ha')
    expect(plain(row.textContent)).toContain('170 000 F CFA')
    expect(api.results).toHaveBeenCalledWith('b1', year)
    expect(screen.getByText(/n’y est pas comptée en francs/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Campagne'), String(year - 1))
    await waitFor(() => expect(api.results).toHaveBeenLastCalledWith('b1', year - 1))
  })
})

describe('fiches de l’assistant Agriculture', () => {
  it('enregistre une vente de récolte après confirmation, et demande la culture si elle est introuvable', async () => {
    const recordOperation = vi.fn(async () => ({ id: 'o1', cropId: 'c1', cropLabel: 'Maïs', plotName: 'Champ 1', kind: 'sale' as const, workType: null, inputType: null, label: null, quantity: 5, unit: 'sac', quantityKg: 500, stockDelta: -500, amount: 125000, note: null, occurredOn: today, status: 'recorded' as const, cancelReason: null, createdAt: new Date().toISOString() }))
    const api = { recordOperation } as unknown as AgricultureApi
    const values = { cropId: null, cropName: 'Mil', kind: 'sale' as const, workType: null, inputType: null, label: null, quantity: 5, unit: 'sac', unitKg: 100, amount: 125000, occurredOn: null, note: null }
    render(<AgricultureProposalCard proposal={{ id: 'f1', action: 'farm_operation', values }} status="pending" api={api} business={business} plots={[plot]} crops={[maize]} onConfirm={async (save) => { await save() }} onDismiss={() => {}} />)
    const card = screen.getByRole('form', { name: 'Fiche à vérifier : Vente de récolte' })
    await userEvent.click(within(card).getByRole('button', { name: 'Confirmer et enregistrer' }))
    expect(await within(card).findByRole('alert')).toHaveTextContent('Culture « Mil » introuvable')
    await userEvent.selectOptions(within(card).getByLabelText('Culture'), 'c1')
    await userEvent.click(within(card).getByRole('button', { name: 'Confirmer et enregistrer' }))
    await waitFor(() => expect(recordOperation).toHaveBeenCalledWith('b1', { cropId: 'c1', kind: 'sale', occurredOn: today, label: null, note: null, quantity: 5, unit: 'sac', unitKg: 100, amount: 125000 }))
  })
})
