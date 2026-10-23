// Onglet Élevage de l’Espace Business : lots, animaux, journal, santé, résultats et assistant.
import type { AiQuota, AssistantMessage, AssistantStreamEvent, Period } from './businessApi'

export type Species = 'poultry' | 'small_ruminant' | 'cattle' | 'pig'
export type Tracking = 'group' | 'individual'
export type LivestockEventKind = 'start' | 'birth' | 'purchase' | 'sale' | 'death' | 'count' | 'feed' | 'health' | 'expense'
export type HealthKind = 'vaccination' | 'treatment' | 'deworming' | 'vet_visit' | 'other'
export type Sex = 'female' | 'male' | 'unknown'

export interface Herd {
  id: string
  name: string
  species: Species
  tracking: Tracking
  headcount: number
  startedOn: string
  note: string | null
  archived: boolean
}

export interface Animal {
  id: string
  herdId: string
  tag: string
  name: string | null
  sex: Sex
  bornOn: string | null
  status: 'present' | 'sold' | 'dead'
}

export interface LivestockEvent {
  id: string
  herdId: string
  herdName: string
  animalId: string | null
  animalTag: string | null
  kind: LivestockEventKind
  quantity: number
  headcountDelta: number
  amount: number
  cause: string | null
  note: string | null
  occurredOn: string
  status: 'recorded' | 'cancelled'
  cancelReason: string | null
  createdAt: string
}

export interface HealthRecord {
  id: string
  herdId: string
  herdName: string
  animalId: string | null
  animalTag: string | null
  kind: HealthKind
  product: string
  dueOn: string | null
  doneOn: string | null
  status: 'planned' | 'done' | 'cancelled'
  cost: number
  note: string | null
}

export interface HerdSummary {
  herdId: string
  herdName: string
  species: Species
  tracking: Tracking
  archived: boolean
  headcount: number
  openingHeadcount: number
  closingHeadcount: number
  births: number
  purchases: number
  sales: number
  deaths: number
  countAdjustment: number
  mortalityRate: number | null
  purchaseCost: number
  feedCost: number
  healthCost: number
  otherCost: number
  totalCost: number
  salesRevenue: number
  estimatedMargin: number
}

export interface HerdInput {
  name: string
  species: Species
  tracking: Tracking
  initialCount?: number
  startedOn?: string | null
  note?: string | null
}

export interface EventInput {
  herdId: string
  kind: Exclude<LivestockEventKind, 'start'>
  quantity?: number
  amount?: number
  occurredOn?: string | null
  cause?: string | null
  note?: string | null
  animalId?: string | null
  animal?: { tag: string; name?: string | null; sex?: Sex; bornOn?: string | null } | null
}

export interface HealthInput {
  herdId: string
  animalId?: string | null
  kind: HealthKind
  product: string
  dueOn?: string | null
  doneOn?: string | null
  cost?: number
  note?: string | null
}

export type HealthChange = { status: 'done'; doneOn: string; cost?: number; note?: string | null } | { status: 'planned'; dueOn: string } | { status: 'cancelled' }

/** Chiffres de l’élevage reçus par l’assistant (montrés sous sa réponse). */
export interface LivestockContext {
  farm: { name: string; currency: string; today: string; role: 'owner' | 'staff' }
  herds: Array<{ name: string; species: Species; tracking: Tracking; headcount: number; startedOn: string }>
  animals: Array<{ herd: string; tag: string; sex: Sex }>
  periods: Array<{ key: string; label: string; start: string; end: string; herds: HerdSummary[] }>
  reminders: Array<{ herd: string; kind: HealthKind; product: string; dueOn: string; overdue: boolean }>
  recentEvents: Array<{ occurredOn: string; herd: string; kind: LivestockEventKind; quantity: number; amount: number; cause: string | null; cancelled: boolean }>
}

export type LivestockProposal =
  | { id: string; action: 'create_herd'; values: { name: string; species: Species | null; tracking: Tracking | null; initialCount: number | null; startedOn: string | null } }
  | { id: string; action: 'livestock_event'; values: { herdId: string | null; herdName: string; kind: Exclude<LivestockEventKind, 'start'>; quantity: number | null; amount: number | null; cause: string | null; occurredOn: string | null; animalId: string | null; animalTag: string | null; sex: Sex | null; note: string | null } }
  | { id: string; action: 'livestock_health'; values: { herdId: string | null; herdName: string; kind: HealthKind; product: string; dueOn: string | null; doneOn: string | null; cost: number | null; animalId: string | null; animalTag: string | null; note: string | null } }

export type LivestockAssistantEvent = AssistantStreamEvent<LivestockContext, LivestockProposal>

export type LivestockApi = ReturnType<typeof createLivestockApi>

type Request = <T>(method: string, path: string, body?: unknown) => Promise<T>
type Stream = <Event extends object>(path: string, messages: AssistantMessage[], onEvent: (event: Event) => void, signal?: AbortSignal) => Promise<void>

export function createLivestockApi(request: Request, stream: Stream) {
  const base = (businessId: string) => `/${businessId}/livestock`
  return {
    listHerds: async (businessId: string, includeArchived = false) => (await request<{ herds: Herd[] }>('GET', `${base(businessId)}/herds${includeArchived ? '?archived=1' : ''}`)).herds,
    createHerd: async (businessId: string, input: HerdInput) => (await request<{ herd: Herd }>('POST', `${base(businessId)}/herds`, input)).herd,
    updateHerd: async (businessId: string, herdId: string, changes: { name?: string; note?: string | null; archived?: boolean }) => (await request<{ herd: Herd }>('PATCH', `${base(businessId)}/herds/${herdId}`, changes)).herd,
    listAnimals: async (businessId: string) => (await request<{ animals: Animal[] }>('GET', `${base(businessId)}/animals`)).animals,
    listEvents: async (businessId: string, period: Period) => (await request<{ events: LivestockEvent[] }>('GET', `${base(businessId)}/events?from=${period.start}&to=${period.end}`)).events,
    recordEvent: async (businessId: string, input: EventInput) => (await request<{ event: LivestockEvent }>('POST', `${base(businessId)}/events`, input)).event,
    cancelEvent: async (businessId: string, eventId: string, reason?: string) => (await request<{ event: LivestockEvent }>('POST', `${base(businessId)}/events/${eventId}/cancel`, { reason: reason ?? null })).event,
    listHealth: async (businessId: string) => (await request<{ health: HealthRecord[] }>('GET', `${base(businessId)}/health`)).health,
    createHealth: async (businessId: string, input: HealthInput) => (await request<{ record: HealthRecord }>('POST', `${base(businessId)}/health`, input)).record,
    updateHealth: async (businessId: string, healthId: string, change: HealthChange) => (await request<{ record: HealthRecord }>('PATCH', `${base(businessId)}/health/${healthId}`, change)).record,
    summary: async (businessId: string, period: Period) => (await request<{ herds: HerdSummary[] }>('GET', `${base(businessId)}/summary?from=${period.start}&to=${period.end}`)).herds,
    assistantQuota: async (businessId: string) => (await request<{ quota: AiQuota }>('GET', `${base(businessId)}/assistant`)).quota,
    askAssistant: (businessId: string, messages: AssistantMessage[], onEvent: (event: LivestockAssistantEvent) => void, signal?: AbortSignal) => (
      stream<LivestockAssistantEvent>(`${base(businessId)}/assistant`, messages, onEvent, signal)
    ),
  }
}
