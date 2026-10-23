// Onglet Agriculture de l’Espace Business : parcelles, cultures, journal, travaux prévus, résultats et assistant.
import type { AiQuota, AssistantMessage, AssistantStreamEvent, Period } from './businessApi'

export type CropCode = 'maize' | 'sorghum' | 'millet' | 'rice' | 'cowpea' | 'groundnut' | 'soybean' | 'cotton' | 'sesame' | 'onion' | 'tomato' | 'cabbage' | 'pepper' | 'other'
export type Season = 'rainy' | 'dry'
export type Tenure = 'owned' | 'rented' | 'lent'
export type AreaUnit = 'ha' | 'm2'
export type OperationKind = 'work' | 'input' | 'rental' | 'expense' | 'harvest' | 'sale' | 'consumption' | 'loss'
export type WorkType = 'soil_prep' | 'sowing' | 'weeding' | 'fertilizing' | 'treatment' | 'irrigation' | 'harvesting' | 'other'
export type InputType = 'seed' | 'fertilizer' | 'manure' | 'treatment_product' | 'other'
export type HarvestUnit = 'kg' | 'tonne' | 'sac' | 'cageot' | 'panier'

export interface Plot {
  id: string
  name: string
  location: string | null
  areaM2: number
  areaUnit: AreaUnit
  tenure: Tenure
  note: string | null
  archived: boolean
}

export interface Crop {
  id: string
  plotId: string
  plotName: string
  crop: CropCode
  cropLabel: string
  season: Season
  year: number
  areaM2: number
  sownOn: string | null
  expectedHarvestOn: string | null
  status: 'active' | 'closed'
  harvestedKg: number
  stockKg: number
  note: string | null
}

export interface Operation {
  id: string
  cropId: string
  cropLabel: string
  plotName: string
  kind: OperationKind
  workType: WorkType | null
  inputType: InputType | null
  label: string | null
  quantity: number | null
  unit: string | null
  quantityKg: number
  stockDelta: number
  amount: number
  note: string | null
  occurredOn: string
  status: 'recorded' | 'cancelled'
  cancelReason: string | null
  createdAt: string
}

export interface FarmTask {
  id: string
  cropId: string
  cropLabel: string
  plotName: string
  workType: WorkType
  label: string | null
  dueOn: string
  status: 'planned' | 'done' | 'cancelled'
  doneOn: string | null
}

export interface CropResult {
  cropId: string
  crop: CropCode
  cropLabel: string
  plotId: string
  plotName: string
  season: Season
  year: number
  status: 'active' | 'closed'
  areaM2: number
  harvestedKg: number
  yieldKgPerHa: number
  soldKg: number
  consumedKg: number
  lostKg: number
  stockKg: number
  inputCost: number
  labourCost: number
  rentalCost: number
  otherCost: number
  totalCost: number
  salesRevenue: number
  estimatedMargin: number
}

export interface PlotInput { name: string; location?: string | null; area: number; areaUnit: AreaUnit; tenure: Tenure; note?: string | null }
export interface CropInput { plotId: string; crop: CropCode; label?: string | null; season: Season; year: number; area: number; areaUnit: AreaUnit; sownOn?: string | null; expectedHarvestOn?: string | null; note?: string | null }
export interface OperationInput {
  cropId: string
  kind: OperationKind
  quantity?: number | null
  unit?: string | null
  unitKg?: number | null
  amount?: number
  occurredOn?: string | null
  workType?: WorkType | null
  inputType?: InputType | null
  label?: string | null
  note?: string | null
}
export interface TaskInput { cropId: string; workType: WorkType; label?: string | null; dueOn: string }
export type TaskChange = { status: 'done'; doneOn: string; amount?: number } | { status: 'planned'; dueOn: string } | { status: 'cancelled' }

/** Chiffres de l’exploitation reçus par l’assistant (montrés sous sa réponse). */
export interface AgricultureContext {
  farm: { name: string; currency: string; today: string; role: 'owner' | 'staff' }
  plots: Array<{ name: string; location: string | null; areaM2: number; tenure: Tenure }>
  crops: Array<{ name: string; season: Season; year: number; areaM2: number; sownOn: string | null; expectedHarvestOn: string | null; status: 'active' | 'closed'; stockKg: number }>
  results: Array<{ year: number; crops: CropResult[] }>
  tasks: Array<{ crop: string; workType: WorkType; label: string | null; dueOn: string; overdue: boolean }>
  recentOperations: Array<{ occurredOn: string; crop: string; kind: OperationKind; workType: WorkType | null; quantityKg: number; amount: number; cancelled: boolean }>
}

export type AgricultureProposal =
  | { id: string; action: 'create_plot'; values: { name: string; location: string | null; area: number | null; areaUnit: AreaUnit; tenure: Tenure | null } }
  | { id: string; action: 'create_crop'; values: { plotId: string | null; plotName: string; crop: CropCode | null; customLabel: string | null; season: Season | null; year: number | null; area: number | null; areaUnit: AreaUnit; sownOn: string | null; expectedHarvestOn: string | null } }
  | { id: string; action: 'farm_operation'; values: { cropId: string | null; cropName: string; kind: OperationKind; workType: WorkType | null; inputType: InputType | null; label: string | null; quantity: number | null; unit: string | null; unitKg: number | null; amount: number | null; occurredOn: string | null; note: string | null } }
  | { id: string; action: 'farm_task'; values: { cropId: string | null; cropName: string; workType: WorkType; label: string | null; dueOn: string | null } }

export type AgricultureAssistantEvent = AssistantStreamEvent<AgricultureContext, AgricultureProposal>
export type AgricultureApi = ReturnType<typeof createAgricultureApi>

type Request = <T>(method: string, path: string, body?: unknown) => Promise<T>
type Stream = <Event extends object>(path: string, messages: AssistantMessage[], onEvent: (event: Event) => void, signal?: AbortSignal) => Promise<void>

export function createAgricultureApi(request: Request, stream: Stream) {
  const base = (businessId: string) => `/${businessId}/agriculture`
  return {
    listPlots: async (businessId: string, includeArchived = false) => (await request<{ plots: Plot[] }>('GET', `${base(businessId)}/plots${includeArchived ? '?archived=1' : ''}`)).plots,
    createPlot: async (businessId: string, input: PlotInput) => (await request<{ plot: Plot }>('POST', `${base(businessId)}/plots`, input)).plot,
    updatePlot: async (businessId: string, plotId: string, changes: Partial<PlotInput> & { archived?: boolean }) => (await request<{ plot: Plot }>('PATCH', `${base(businessId)}/plots/${plotId}`, changes)).plot,
    listCrops: async (businessId: string, year?: number) => (await request<{ crops: Crop[] }>('GET', `${base(businessId)}/crops${year ? `?year=${year}` : ''}`)).crops,
    createCrop: async (businessId: string, input: CropInput) => (await request<{ crop: Crop }>('POST', `${base(businessId)}/crops`, input)).crop,
    updateCrop: async (businessId: string, cropId: string, changes: { status?: 'active' | 'closed'; sownOn?: string | null; expectedHarvestOn?: string | null; note?: string | null }) => (await request<{ crop: Crop }>('PATCH', `${base(businessId)}/crops/${cropId}`, changes)).crop,
    listOperations: async (businessId: string, period: Period) => (await request<{ operations: Operation[] }>('GET', `${base(businessId)}/operations?from=${period.start}&to=${period.end}`)).operations,
    recordOperation: async (businessId: string, input: OperationInput) => (await request<{ operation: Operation }>('POST', `${base(businessId)}/operations`, input)).operation,
    cancelOperation: async (businessId: string, operationId: string, reason?: string) => (await request<{ operation: Operation }>('POST', `${base(businessId)}/operations/${operationId}/cancel`, { reason: reason ?? null })).operation,
    listTasks: async (businessId: string) => (await request<{ tasks: FarmTask[] }>('GET', `${base(businessId)}/tasks`)).tasks,
    createTask: async (businessId: string, input: TaskInput) => (await request<{ task: FarmTask }>('POST', `${base(businessId)}/tasks`, input)).task,
    updateTask: async (businessId: string, taskId: string, change: TaskChange) => (await request<{ task: FarmTask }>('PATCH', `${base(businessId)}/tasks/${taskId}`, change)).task,
    results: async (businessId: string, year: number) => (await request<{ crops: CropResult[] }>('GET', `${base(businessId)}/results?year=${year}`)).crops,
    assistantQuota: async (businessId: string) => (await request<{ quota: AiQuota }>('GET', `${base(businessId)}/assistant`)).quota,
    askAssistant: (businessId: string, messages: AssistantMessage[], onEvent: (event: AgricultureAssistantEvent) => void, signal?: AbortSignal) => (
      stream<AgricultureAssistantEvent>(`${base(businessId)}/assistant`, messages, onEvent, signal)
    ),
  }
}
