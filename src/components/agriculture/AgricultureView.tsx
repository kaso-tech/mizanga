import { useCallback, useEffect, useState } from 'react'
import { livestockPresets, localDay, periodFor, type PeriodPreset } from '../../app/businessPeriods'
import type { ConversationSummary } from '../../domain/types'
import type { AgricultureApi, Crop, FarmTask, OperationKind, Plot } from '../../services/agricultureApi'
import type { Business } from '../../services/businessApi'
import type { ConversationsApi } from '../../services/conversationsApi'
import type { OpenRequest } from '../business/AssistantChat'
import { PeriodPicker } from '../business/PeriodPicker'
import { AgricultureAssistant } from './AgricultureAssistant'
import { CropDialog } from './CropDialog'
import { FarmJournalPanel } from './FarmJournalPanel'
import { FarmResults } from './FarmResults'
import { FieldsPanel } from './FieldsPanel'
import { OperationDialog } from './OperationDialog'
import { PlotDialog } from './PlotDialog'
import { TaskDialog } from './TaskDialog'
import { TasksPanel } from './TasksPanel'

type Tab = 'fields' | 'journal' | 'tasks' | 'results' | 'assistant'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'fields', label: 'Parcelles' },
  { id: 'journal', label: 'Journal' },
  { id: 'tasks', label: 'Travaux' },
  { id: 'results', label: 'Résultats' },
  { id: 'assistant', label: 'Assistant' },
]

type Dialog =
  | { type: 'plot'; plot?: Plot }
  | { type: 'crop'; plot?: Plot }
  | { type: 'operation'; crop?: Crop; kind?: OperationKind }
  | { type: 'task' }
  | null

/**
 * Onglet Agriculture : parcelles et cultures par saison, journal (travaux, intrants, frais, récoltes, ventes,
 * consommation, pertes), travaux prévus avec rappels, résultats par culture et assistant. Les chiffres sont
 * calculés par la base ; ils restent séparés de ceux du Commerce et de l’Élevage.
 */
export function AgricultureView({ api, business, onNotify, conversations, openRequest, onConversationSaved, onConversationOpened }: {
  api: AgricultureApi
  business: Business
  onNotify: (message: string, tone?: 'success' | 'info') => void
  conversations: ConversationsApi | null
  openRequest?: OpenRequest
  onConversationSaved?: (summary: ConversationSummary) => void
  onConversationOpened?: (id: string | null) => void
}) {
  const [tab, setTab] = useState<Tab>(openRequest ? 'assistant' : 'fields')
  const [plots, setPlots] = useState<Plot[] | null>(null)
  const [crops, setCrops] = useState<Crop[]>([])
  const [tasks, setTasks] = useState<FarmTask[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [preset, setPreset] = useState<PeriodPreset>('last30')
  const [version, setVersion] = useState(0)
  const today = localDay(business.timezone)
  const thisYear = Number(today.slice(0, 4))

  const load = useCallback(async () => {
    const [loadedPlots, loadedCrops, loadedTasks] = await Promise.all([api.listPlots(business.id, showArchived), api.listCrops(business.id), api.listTasks(business.id)])
    setPlots(loadedPlots)
    setCrops(loadedCrops)
    setTasks(loadedTasks)
    setVersion((value) => value + 1)
  }, [api, business.id, showArchived])

  useEffect(() => {
    setError('')
    load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Chargement impossible.'))
  }, [load])

  const openNonce = openRequest?.nonce
  useEffect(() => {
    if (openNonce !== undefined) setTab('assistant')
  }, [openNonce])

  const refresh = () => load().catch(() => onNotify('Les données n’ont pas pu être actualisées. Rechargez la page.'))
  const after = async (message: string) => {
    setDialog(null)
    onNotify(message, 'success')
    await refresh()
  }

  const activePlots = (plots ?? []).filter((plot) => !plot.archived)
  // Cultures montrées : celles en cours, et celles clôturées des deux dernières campagnes (stock à vendre).
  const shownCrops = crops.filter((crop) => crop.status === 'active' || crop.year >= thisYear - 1)
  const period = periodFor(preset, business.timezone)
  const picker = <PeriodPicker preset={preset} period={period} onChange={setPreset} presets={livestockPresets} />
  const needCrop = () => onNotify('Ajoutez d’abord une culture à une parcelle.')

  return (
    <div className="livestock-view agriculture-view">
      <div className="segmented business-tabs" role="tablist" aria-label="Sections de l’agriculture">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'is-selected' : ''} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!plots && !error && <div className="page-loading" aria-busy="true" />}
      {plots && tab === 'fields' && (
        <FieldsPanel
          plots={plots}
          crops={shownCrops}
          tasks={tasks}
          today={today}
          showArchived={showArchived}
          onShowArchived={setShowArchived}
          onNewPlot={() => setDialog({ type: 'plot' })}
          onEditPlot={(plot) => setDialog({ type: 'plot', plot })}
          onNewCrop={(plot) => setDialog({ type: 'crop', plot })}
          onNewOperation={(crop) => setDialog({ type: 'operation', crop })}
          onToggleCrop={(crop) => {
            const closing = crop.status === 'active'
            api.updateCrop(business.id, crop.id, { status: closing ? 'closed' : 'active' })
              .then(() => after(closing ? `Culture « ${crop.cropLabel} » clôturée : seules les sorties du stock restent possibles.` : `Culture « ${crop.cropLabel} » rouverte.`))
              .catch((caught: unknown) => onNotify(caught instanceof Error ? caught.message : 'L’opération a échoué.'))
          }}
        />
      )}
      {plots && tab === 'journal' && (
        <FarmJournalPanel api={api} business={business} period={period} picker={picker} version={version} onNewOperation={() => (shownCrops.length ? setDialog({ type: 'operation' }) : needCrop())} onChanged={() => void refresh()} onNotify={onNotify} />
      )}
      {plots && tab === 'tasks' && (
        <TasksPanel
          tasks={tasks}
          today={today}
          onNewTask={() => (shownCrops.some((crop) => crop.status === 'active') ? setDialog({ type: 'task' }) : needCrop())}
          onDone={async (task, doneOn, amount) => { await api.updateTask(business.id, task.id, { status: 'done', doneOn, amount }); await after('Travail enregistré comme fait.') }}
          onCancel={async (task) => { await api.updateTask(business.id, task.id, { status: 'cancelled' }); await after('Travail prévu annulé.') }}
        />
      )}
      {plots && tab === 'results' && <FarmResults api={api} business={business} today={today} version={version} />}
      {plots && (
        <div className="assistant-tab" hidden={tab !== 'assistant'}>
          <AgricultureAssistant
            api={api}
            business={business}
            plots={plots}
            crops={shownCrops}
            onDataChanged={load}
            onNotify={onNotify}
            conversations={conversations}
            openRequest={openRequest}
            onConversationSaved={onConversationSaved}
            onConversationOpened={onConversationOpened}
          />
        </div>
      )}

      {dialog?.type === 'plot' && (
        <PlotDialog
          plot={dialog.plot}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            if (dialog.plot) {
              await api.updatePlot(business.id, dialog.plot.id, input)
              await after('Parcelle modifiée.')
            } else {
              const plot = await api.createPlot(business.id, input)
              await after(`Parcelle « ${plot.name} » créée.`)
            }
          }}
          onArchive={dialog.plot ? async () => {
            await api.updatePlot(business.id, dialog.plot!.id, { archived: !dialog.plot!.archived })
            await after(dialog.plot!.archived ? 'Parcelle réactivée.' : 'Parcelle archivée.')
          } : undefined}
        />
      )}
      {dialog?.type === 'crop' && (
        <CropDialog plots={activePlots} today={today} initialPlotId={dialog.plot?.id} onClose={() => setDialog(null)} onSave={async (input) => { const crop = await api.createCrop(business.id, input); await after(`Culture « ${crop.cropLabel} » ajoutée à « ${crop.plotName} ».`) }} />
      )}
      {dialog?.type === 'operation' && (
        <OperationDialog crops={shownCrops} today={today} initialCropId={dialog.crop?.id} initialKind={dialog.kind} onClose={() => setDialog(null)} onSave={async (input) => { await api.recordOperation(business.id, input); await after('Opération enregistrée.') }} />
      )}
      {dialog?.type === 'task' && (
        <TaskDialog crops={shownCrops.filter((crop) => crop.status === 'active')} today={today} onClose={() => setDialog(null)} onSave={async (input) => { await api.createTask(business.id, input); await after('Travail prévu enregistré.') }} />
      )}
    </div>
  )
}
