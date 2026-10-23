import { useCallback, useEffect, useState } from 'react'
import { livestockPresets, localDay, periodFor, type PeriodPreset } from '../../app/businessPeriods'
import type { ConversationSummary } from '../../domain/types'
import type { Business } from '../../services/businessApi'
import type { ConversationsApi } from '../../services/conversationsApi'
import type { Animal, HealthRecord, Herd, LivestockApi, LivestockEventKind } from '../../services/livestockApi'
import type { OpenRequest } from '../business/AssistantChat'
import { HerdDialog } from './HerdDialog'
import { EventDialog } from './EventDialog'
import { HealthDialog } from './HealthDialog'
import { HealthPanel } from './HealthPanel'
import { HerdsPanel } from './HerdsPanel'
import { JournalPanel } from './JournalPanel'
import { LivestockAssistant } from './LivestockAssistant'
import { LivestockResults } from './LivestockResults'
import { PeriodPicker } from '../business/PeriodPicker'

type Tab = 'herds' | 'journal' | 'health' | 'results' | 'assistant'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'herds', label: 'Lots' },
  { id: 'journal', label: 'Journal' },
  { id: 'health', label: 'Santé' },
  { id: 'results', label: 'Résultats' },
  { id: 'assistant', label: 'Assistant' },
]

type Dialog =
  | { type: 'herd'; herd?: Herd }
  | { type: 'event'; herd?: Herd; kind?: Exclude<LivestockEventKind, 'start'> }
  | { type: 'health' }
  | null

/**
 * Onglet Élevage : lots et troupeaux (volailles, moutons et chèvres, bovins, porcs), journal (naissances,
 * achats, ventes, mortalité, alimentation, frais), santé (vaccins, traitements, rappels), résultats par
 * lot et assistant. Les chiffres sont calculés par la base ; ils restent séparés de ceux du Commerce.
 */
export function LivestockView({ api, business, onNotify, conversations, openRequest, onConversationSaved, onConversationOpened }: {
  api: LivestockApi
  business: Business
  onNotify: (message: string, tone?: 'success' | 'info') => void
  conversations: ConversationsApi | null
  openRequest?: OpenRequest
  onConversationSaved?: (summary: ConversationSummary) => void
  onConversationOpened?: (id: string | null) => void
}) {
  const [tab, setTab] = useState<Tab>(openRequest ? 'assistant' : 'herds')
  const [herds, setHerds] = useState<Herd[] | null>(null)
  const [animals, setAnimals] = useState<Animal[]>([])
  const [health, setHealth] = useState<HealthRecord[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [preset, setPreset] = useState<PeriodPreset>('last30')
  // Change après chaque enregistrement : journal et résultats sont relus.
  const [version, setVersion] = useState(0)
  const today = localDay(business.timezone)

  const load = useCallback(async () => {
    const [loadedHerds, loadedAnimals, loadedHealth] = await Promise.all([
      api.listHerds(business.id, showArchived),
      api.listAnimals(business.id),
      api.listHealth(business.id),
    ])
    setHerds(loadedHerds)
    setAnimals(loadedAnimals)
    setHealth(loadedHealth)
    setVersion((value) => value + 1)
  }, [api, business.id, showArchived])

  useEffect(() => {
    setError('')
    load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Chargement impossible.'))
  }, [load])

  // Conversation choisie dans le menu latéral : l’assistant s’ouvre.
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

  const activeHerds = (herds ?? []).filter((herd) => !herd.archived)
  const period = periodFor(preset, business.timezone)
  const picker = <PeriodPicker preset={preset} period={period} onChange={setPreset} presets={livestockPresets} />
  const newEvent = () => (activeHerds.length ? setDialog({ type: 'event' }) : onNotify('Créez d’abord un lot.'))

  return (
    <div className="livestock-view">
      <div className="segmented business-tabs" role="tablist" aria-label="Sections de l’élevage">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'is-selected' : ''} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!herds && !error && <div className="page-loading" aria-busy="true" />}
      {herds && tab === 'herds' && (
        <HerdsPanel
          herds={herds}
          animals={animals}
          health={health}
          today={today}
          showArchived={showArchived}
          onShowArchived={setShowArchived}
          onNewHerd={() => setDialog({ type: 'herd' })}
          onNewEvent={(herd) => setDialog({ type: 'event', herd })}
          onEditHerd={(herd) => setDialog({ type: 'herd', herd })}
        />
      )}
      {herds && tab === 'journal' && (
        <JournalPanel api={api} business={business} period={period} picker={picker} version={version} onNewEvent={newEvent} onChanged={() => void refresh()} onNotify={onNotify} />
      )}
      {herds && tab === 'health' && (
        <HealthPanel
          business={business}
          health={health}
          today={today}
          onNewHealth={() => (activeHerds.length ? setDialog({ type: 'health' }) : onNotify('Créez d’abord un lot.'))}
          onDone={async (record, doneOn, cost) => { await api.updateHealth(business.id, record.id, { status: 'done', doneOn, cost }); await after('Soin enregistré comme fait.') }}
          onCancel={async (record) => { await api.updateHealth(business.id, record.id, { status: 'cancelled' }); await after('Soin annulé.') }}
        />
      )}
      {herds && tab === 'results' && <LivestockResults api={api} business={business} period={period} picker={picker} version={version} />}
      {/* Toujours monté : la conversation et les fiches en attente restent quand on change d’onglet. */}
      {herds && (
        <div className="assistant-tab" hidden={tab !== 'assistant'}>
          <LivestockAssistant
            api={api}
            business={business}
            herds={herds}
            animals={animals}
            onDataChanged={load}
            onNotify={onNotify}
            conversations={conversations}
            openRequest={openRequest}
            onConversationSaved={onConversationSaved}
            onConversationOpened={onConversationOpened}
          />
        </div>
      )}

      {dialog?.type === 'herd' && (
        <HerdDialog
          herd={dialog.herd}
          today={today}
          onClose={() => setDialog(null)}
          onCreate={async (input) => { const herd = await api.createHerd(business.id, input); await after(`Lot « ${herd.name} » créé.`) }}
          onUpdate={async (changes) => {
            if (!dialog.herd) return
            await api.updateHerd(business.id, dialog.herd.id, changes)
            await after(changes.archived === true ? 'Lot archivé.' : changes.archived === false ? 'Lot réactivé.' : 'Lot modifié.')
          }}
        />
      )}
      {dialog?.type === 'event' && (
        <EventDialog
          herds={activeHerds}
          animals={animals}
          today={today}
          initialHerdId={dialog.herd?.id}
          initialKind={dialog.kind}
          onClose={() => setDialog(null)}
          onSave={async (input) => { await api.recordEvent(business.id, input); await after('Événement enregistré.') }}
        />
      )}
      {dialog?.type === 'health' && (
        <HealthDialog
          herds={activeHerds}
          animals={animals}
          today={today}
          onClose={() => setDialog(null)}
          onSave={async (input) => { await api.createHealth(business.id, input); await after(input.doneOn ? 'Soin enregistré.' : 'Rappel de soin enregistré.') }}
        />
      )}
    </div>
  )
}
