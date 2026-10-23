import { useMemo } from 'react'
import { farmTotals, formatKg, operationLabels, workLabels } from '../../app/agriculture'
import { formatAmount } from '../../app/businessFormat'
import type { ConversationSummary } from '../../domain/types'
import type { AgricultureApi, AgricultureContext, AgricultureProposal, Crop, Plot } from '../../services/agricultureApi'
import type { Business } from '../../services/businessApi'
import type { ConversationsApi } from '../../services/conversationsApi'
import { AssistantChat, type AssistantAdapter, type OpenRequest } from '../business/AssistantChat'
import { AgricultureProposalCard } from './AgricultureProposalCard'

const suggestions = [
  'Quel est le rendement de mes cultures cette année ?',
  'Quels travaux dois-je faire cette semaine ?',
  'Quelle culture me rapporte le plus ?',
  'Combien me reste-t-il de récolte en stock ?',
]

function describe(proposal: AgricultureProposal) {
  switch (proposal.action) {
    case 'create_plot': return `nouvelle parcelle « ${proposal.values.name} »`
    case 'create_crop': return `nouvelle culture sur « ${proposal.values.plotName} »`
    case 'farm_operation': return `${operationLabels[proposal.values.kind].toLowerCase()} pour « ${proposal.values.cropName} »`
    case 'farm_task': return `${workLabels[proposal.values.workType].toLowerCase()} prévu pour « ${proposal.values.cropName} »`
  }
}

/** Chiffres que l’assistant a reçus, pour que l’agriculteur puisse vérifier sa réponse. */
function ContextDetails({ context }: { context: AgricultureContext }) {
  const amount = (value: number) => formatAmount(value, context.farm.currency)
  const late = context.tasks.filter((task) => task.overdue).length
  return (
    <details className="assistant-context">
      <summary>Chiffres utilisés par l’assistant</summary>
      <div className="table-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Campagne</th><th scope="col">Récolté</th><th scope="col">En stock</th><th scope="col">Coûts</th><th scope="col">Ventes</th><th scope="col">Marge estimée</th></tr></thead>
          <tbody>
            {context.results.map((group) => {
              const totals = farmTotals(group.crops)
              return (
                <tr key={group.year}>
                  <th scope="row">{group.year}</th>
                  <td>{formatKg(totals.harvestedKg)}</td>
                  <td>{formatKg(totals.stockKg)}</td>
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
        {context.plots.length} parcelle{context.plots.length > 1 ? 's' : ''}, {context.crops.length} culture{context.crops.length > 1 ? 's' : ''}.
        {context.tasks.length > 0 && ` ${context.tasks.length} travail${context.tasks.length > 1 ? 'x' : ''} prévu${context.tasks.length > 1 ? 's' : ''}${late ? `, dont ${late} en retard` : ''}.`}
      </p>
      <p>Vos notes et les noms des acheteurs ne sont pas transmis.</p>
    </details>
  )
}

/** Assistant de l’onglet Agriculture : réponses à partir des chiffres de l’exploitation, fiches à confirmer. */
export function AgricultureAssistant({ api, business, plots, crops, onDataChanged, onNotify, conversations, openRequest, onConversationSaved, onConversationOpened }: {
  api: AgricultureApi
  business: Business
  plots: Plot[]
  crops: Crop[]
  onDataChanged: () => Promise<void>
  onNotify: (message: string, tone?: 'success' | 'info') => void
  conversations: ConversationsApi | null
  openRequest?: OpenRequest
  onConversationSaved?: (summary: ConversationSummary) => void
  onConversationOpened?: (id: string | null) => void
}) {
  const activePlots = useMemo(() => plots.filter((plot) => !plot.archived), [plots])
  const adapter = useMemo((): AssistantAdapter<AgricultureContext, AgricultureProposal> => ({
    quota: () => api.assistantQuota(business.id),
    ask: (messages, onEvent, signal) => api.askAssistant(business.id, messages, onEvent, signal),
    suggestions,
    heading: 'Que voulez-vous savoir sur vos cultures ?',
    intro: 'Réponses à partir de vos chiffres, calculés par Gilli. Conseils indicatifs : pour les traitements, suivez l’étiquette et l’avis de l’agent d’agriculture.',
    placeholder: 'Question ou demande : récolte, vente, engrais, sarclage…',
    confirmer: 'l’agriculteur',
    describe,
    renderProposal: (props) => <AgricultureProposalCard {...props} api={api} business={business} plots={activePlots} crops={crops} />,
    renderContext: (context) => <ContextDetails context={context} />,
  }), [api, business, activePlots, crops])
  return (
    <AssistantChat
      adapter={adapter}
      business={business}
      onDataChanged={onDataChanged}
      onNotify={onNotify}
      conversations={conversations}
      kind="agriculture"
      openRequest={openRequest}
      onConversationSaved={onConversationSaved}
      onConversationOpened={onConversationOpened}
    />
  )
}
