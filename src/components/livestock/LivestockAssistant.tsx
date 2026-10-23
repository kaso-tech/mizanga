import { useMemo } from 'react'
import { formatAmount } from '../../app/businessFormat'
import { eventLabels, formatRate, healthLabels, totalsOf } from '../../app/livestock'
import type { ConversationSummary } from '../../domain/types'
import type { Business } from '../../services/businessApi'
import type { ConversationsApi } from '../../services/conversationsApi'
import type { Animal, Herd, LivestockApi, LivestockContext, LivestockProposal } from '../../services/livestockApi'
import { AssistantChat, type AssistantAdapter, type OpenRequest } from '../business/AssistantChat'
import { LivestockProposalCard } from './LivestockProposalCard'

const suggestions = [
  'Comment évolue la mortalité de mes lots ?',
  'Quels soins dois-je faire cette semaine ?',
  'Quel lot me rapporte le plus ?',
  'Où partent mes dépenses d’élevage ?',
]

function describe(proposal: LivestockProposal) {
  switch (proposal.action) {
    case 'create_herd': return `nouveau lot « ${proposal.values.name} »`
    case 'livestock_event': return `${eventLabels[proposal.values.kind].toLowerCase()} pour « ${proposal.values.herdName} »`
    case 'livestock_health': return `${healthLabels[proposal.values.kind].toLowerCase()} « ${proposal.values.product} » pour « ${proposal.values.herdName} »`
  }
}

/** Chiffres que l’assistant a reçus, pour que l’éleveur puisse vérifier sa réponse. */
function ContextDetails({ context }: { context: LivestockContext }) {
  const amount = (value: number) => formatAmount(value, context.farm.currency)
  const late = context.reminders.filter((reminder) => reminder.overdue).length
  return (
    <details className="assistant-context">
      <summary>Chiffres utilisés par l’assistant</summary>
      <div className="table-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Période</th><th scope="col">Animaux</th><th scope="col">Mortalité</th><th scope="col">Coûts</th><th scope="col">Ventes</th><th scope="col">Marge estimée</th></tr></thead>
          <tbody>
            {context.periods.map((period) => {
              const totals = totalsOf(period.herds)
              return (
                <tr key={period.key}>
                  <th scope="row">{period.label}</th>
                  <td>{totals.closingHeadcount}</td>
                  <td>{formatRate(totals.mortalityRate)}</td>
                  <td>{amount(totals.totalCost)}</td>
                  <td>{amount(totals.salesRevenue)}</td>
                  <td>{amount(totals.estimatedMargin)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p>
        {context.herds.length} lot{context.herds.length > 1 ? 's' : ''} actif{context.herds.length > 1 ? 's' : ''}.
        {context.reminders.length > 0 && ` ${context.reminders.length} soin${context.reminders.length > 1 ? 's' : ''} prévu${context.reminders.length > 1 ? 's' : ''}${late ? `, dont ${late} en retard` : ''}.`}
      </p>
      <p>Vos notes et les noms des acheteurs ne sont pas transmis.</p>
    </details>
  )
}

/** Assistant de l’onglet Élevage : réponses à partir des chiffres de l’élevage, fiches de lot, d’événement et de soin. */
export function LivestockAssistant({ api, business, herds, animals, onDataChanged, onNotify, conversations, openRequest, onConversationSaved, onConversationOpened }: {
  api: LivestockApi
  business: Business
  herds: Herd[]
  animals: Animal[]
  onDataChanged: () => Promise<void>
  onNotify: (message: string, tone?: 'success' | 'info') => void
  conversations: ConversationsApi | null
  openRequest?: OpenRequest
  onConversationSaved?: (summary: ConversationSummary) => void
  onConversationOpened?: (id: string | null) => void
}) {
  const activeHerds = useMemo(() => herds.filter((herd) => !herd.archived), [herds])
  const adapter = useMemo((): AssistantAdapter<LivestockContext, LivestockProposal> => ({
    quota: () => api.assistantQuota(business.id),
    ask: (messages, onEvent, signal) => api.askAssistant(business.id, messages, onEvent, signal),
    suggestions,
    heading: 'Que voulez-vous savoir sur votre élevage ?',
    intro: 'Réponses à partir de vos chiffres, calculés par Gilli. Conseils indicatifs : pour la santé de vos animaux, l’avis d’un vétérinaire prime.',
    placeholder: 'Question ou demande : naissance, vente, mortalité, vaccin…',
    confirmer: 'l’éleveur',
    describe,
    renderProposal: (props) => <LivestockProposalCard {...props} api={api} business={business} herds={activeHerds} animals={animals} />,
    renderContext: (context) => <ContextDetails context={context} />,
  }), [api, business, activeHerds, animals])
  return (
    <AssistantChat
      adapter={adapter}
      business={business}
      onDataChanged={onDataChanged}
      onNotify={onNotify}
      conversations={conversations}
      kind="elevage"
      openRequest={openRequest}
      onConversationSaved={onConversationSaved}
      onConversationOpened={onConversationOpened}
    />
  )
}
