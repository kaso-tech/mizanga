import { useMemo } from 'react'
import { formatAmount, formatQuantity } from '../../app/businessFormat'
import type { ConversationSummary } from '../../domain/types'
import type { AssistantContext, AssistantProposal, Business, BusinessApi, Product } from '../../services/businessApi'
import type { ConversationsApi } from '../../services/conversationsApi'
import { AssistantChat, type AssistantAdapter } from './AssistantChat'
import { ProposalCard } from './ProposalCard'

export type { OpenRequest } from './AssistantChat'

const suggestions = [
  'Comment se passent mes ventes ce mois-ci ?',
  'Quels produits dois-je réapprovisionner ?',
  'Quel produit me rapporte le plus de marge ?',
  'Où partent mes dépenses ?',
]

/** Nom court d’une fiche du Commerce. @param proposal */
function describe(proposal: AssistantProposal) {
  switch (proposal.action) {
    case 'create_product': return `nouveau produit « ${proposal.values.name} »`
    case 'stock_movement': return `mouvement de stock pour « ${proposal.values.productName} »`
    case 'sale': return `vente (${proposal.values.items.map((item) => item.productName).join(', ')})`
    case 'expense': return `dépense ${proposal.values.category}`
    case 'cancel_sale': return `annulation de la vente [${proposal.values.reference}]`
  }
}

/** Chiffres que l’assistant a reçus, pour que le commerçant puisse vérifier sa réponse. */
function ContextDetails({ context }: { context: AssistantContext }) {
  const amount = (value: number) => formatAmount(value, context.business.currency)
  const alerts = context.stock.products.filter((product) => product.level !== 'ok')
  return (
    <details className="assistant-context">
      <summary>Chiffres utilisés par l’assistant</summary>
      <div className="table-scroll">
        <table className="results-table">
          <thead><tr><th scope="col">Période</th><th scope="col">Chiffre d’affaires</th><th scope="col">Marge brute</th><th scope="col">Dépenses</th><th scope="col">Résultat estimé</th></tr></thead>
          <tbody>
            {context.periods.map((period) => (
              <tr key={period.key}>
                <th scope="row">{period.label}</th>
                <td>{amount(period.summary.revenue)}</td>
                <td>{amount(period.summary.grossMargin)}</td>
                <td>{amount(period.summary.expenses)}</td>
                <td>{amount(period.summary.estimatedResult)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Stock : {context.stock.productCount} produit{context.stock.productCount > 1 ? 's' : ''}, valeur {amount(context.stock.value)} au prix d’achat.
        {alerts.length > 0 && ` À surveiller : ${alerts.map((product) => `${product.name} (${formatQuantity(product.quantity)} ${product.unit})`).join(', ')}.`}
      </p>
      <p>Les noms de vos clients, vos notes et vos descriptions ne sont pas transmis.</p>
    </details>
  )
}

/** Assistant de l’onglet Commerce : réponses à partir des chiffres du commerce, fiches de produit, stock, vente, dépense. */
export function AssistantPanel({ api, business, products, onDataChanged, onNotify, conversations = null, openRequest, onConversationSaved, onConversationOpened }: {
  api: BusinessApi
  business: Business
  products: Product[]
  /** Appelé après un enregistrement confirmé (les produits et le stock ont changé). */
  onDataChanged: () => Promise<void>
  onNotify: (message: string, tone?: 'success' | 'info') => void
  conversations?: ConversationsApi | null
  openRequest?: import('./AssistantChat').OpenRequest
  onConversationSaved?: (summary: ConversationSummary) => void
  onConversationOpened?: (id: string | null) => void
}) {
  const adapter = useMemo((): AssistantAdapter<AssistantContext, AssistantProposal> => ({
    quota: () => api.assistantQuota(business.id),
    ask: (messages, onEvent, signal) => api.askAssistant(business.id, messages, onEvent, signal),
    suggestions,
    heading: 'Que voulez-vous savoir sur votre commerce\u202f?',
    intro: 'Réponses à partir de vos chiffres, calculés par Gilli. Conseils indicatifs, pas un avis comptable ou fiscal.',
    placeholder: 'Question ou demande : vente, dépense, produit (photo possible)…',
    confirmer: 'le commerçant',
    describe,
    renderProposal: (props) => <ProposalCard {...props} api={api} business={business} products={products} />,
    renderContext: (context) => <ContextDetails context={context} />,
  }), [api, business, products])
  return (
    <AssistantChat
      adapter={adapter}
      business={business}
      onDataChanged={onDataChanged}
      onNotify={onNotify}
      conversations={conversations}
      kind="commerce"
      openRequest={openRequest}
      onConversationSaved={onConversationSaved}
      onConversationOpened={onConversationOpened}
    />
  )
}
