import { RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { isImage, prepareAttachments } from '../../app/attachments'
import { formatAmount, formatQuantity } from '../../app/businessFormat'
import type { Attachment, ChatMessage as ChatMessageType } from '../../domain/types'
import { BusinessApiError, type AiQuota, type AssistantContext, type AssistantMessage, type AssistantProposal, type Business, type BusinessApi, type Product } from '../../services/businessApi'
import { BrandMark } from '../Brand'
import { ChatMessage } from '../ChatMessage'
import { Composer } from '../Composer'
import { ProposalCard, type ProposalStatus } from './ProposalCard'

const suggestions = [
  'Comment se passent mes ventes ce mois-ci ?',
  'Quels produits dois-je réapprovisionner ?',
  'Quel produit me rapporte le plus de marge ?',
  'Où partent mes dépenses ?',
]

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp'

interface ProposalState {
  proposal: AssistantProposal
  status: ProposalStatus
  result?: string
}

/** Résumé d’une fiche pour la suite de la conversation (le modèle sait ce qui a été confirmé). */
function describeProposal({ proposal, status }: ProposalState) {
  const what = (() => {
    switch (proposal.action) {
      case 'create_product': return `nouveau produit « ${proposal.values.name} »`
      case 'stock_movement': return `mouvement de stock pour « ${proposal.values.productName} »`
      case 'sale': return `vente (${proposal.values.items.map((item) => item.productName).join(', ')})`
      case 'expense': return `dépense ${proposal.values.category}`
      case 'cancel_sale': return `annulation de la vente [${proposal.values.reference}]`
    }
  })()
  const outcome = status === 'done' ? 'confirmée et enregistrée par le commerçant' : status === 'dismissed' ? 'ignorée par le commerçant' : 'pas encore confirmée'
  return `[Fiche ${what} : ${outcome}]`
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

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

/**
 * Assistant Business, présenté comme le chatbot de Gilli (mêmes messages, même zone de saisie, mêmes
 * actions) mais répondant à partir des chiffres du commerce. La conversation reste sur cet écran
 * (elle n’est pas enregistrée) ; chaque question compte dans la limite du jour.
 */
export function AssistantPanel({ api, business, products, onDataChanged, onNotify }: {
  api: BusinessApi
  business: Business
  products: Product[]
  /** Appelé après un enregistrement confirmé (les produits et le stock ont changé). */
  onDataChanged: () => Promise<void>
  onNotify: (message: string, tone?: 'success' | 'info') => void
}) {
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [contexts, setContexts] = useState<Record<string, AssistantContext>>({})
  const [proposals, setProposals] = useState<Record<string, ProposalState[]>>({})
  const [draft, setDraft] = useState('')
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([])
  const [isPreparingFiles, setIsPreparingFiles] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const [quota, setQuota] = useState<AiQuota | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string>()
  const controllerRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.assistantQuota(business.id).then(setQuota).catch(() => setQuota(null))
    return () => controllerRef.current?.abort()
  }, [api, business.id])

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [messages])

  const remaining = quota ? Math.max(quota.limit - quota.used, 0) : null
  const lastMessage = messages.at(-1)
  const lastUserMessage = messages.findLast((message) => message.role === 'user')

  /** Envoie la conversation `history` (terminée par une question) et diffuse la réponse. */
  const run = async (history: ChatMessageType[]) => {
    setMessages(history)
    setIsGenerating(true)
    const controller = new AbortController()
    controllerRef.current = controller
    const answerId = newId()
    let context: AssistantContext | undefined
    let hasProposals = false
    /** Crée la réponse au premier fragment, puis la met à jour. */
    const updateAnswer = (change: (answer: ChatMessageType) => ChatMessageType) => setMessages((current) => {
      const existing = current.find((message) => message.id === answerId)
      const base: ChatMessageType = existing ?? { id: answerId, role: 'assistant', content: '', createdAt: new Date().toISOString(), status: 'streaming' }
      const updated = change(base)
      return existing ? current.map((message) => (message.id === answerId ? updated : message)) : [...current, updated]
    })
    try {
      const sent = history.slice(-20).map((message, index, all): AssistantMessage => ({
        role: message.role,
        content: [message.content, ...(proposals[message.id] ?? []).map(describeProposal)].filter(Boolean).join('\n\n'),
        // Seules les photos de la question posée partent au serveur.
        ...(index === all.length - 1 && message.attachments?.length ? { attachments: message.attachments.map(({ name, mimeType, data }) => ({ name, mimeType, data: data ?? '' })) } : {}),
      }))
      await api.askAssistant(business.id, sent, (event) => {
        if ('context' in event) {
          context = event.context
          setQuota(event.quota)
        } else if ('text' in event) {
          updateAnswer((answer) => ({ ...answer, content: answer.content + event.text }))
        } else if ('proposals' in event) {
          hasProposals = true
          updateAnswer((answer) => answer)
          setProposals((current) => ({ ...current, [answerId]: event.proposals.map((proposal) => ({ proposal, status: 'pending' })) }))
        } else {
          setQuota(event.quota)
        }
      }, controller.signal)
      // Fiches sans texte : une phrase d’accompagnement plutôt qu’une réponse vide.
      updateAnswer((answer) => ({ ...answer, status: 'complete', content: answer.content || (hasProposals ? 'Voici la fiche à vérifier avant l’enregistrement.' : '') }))
      if (context) setContexts((current) => ({ ...current, [answerId]: context as AssistantContext }))
    } catch (caught) {
      if (controller.signal.aborted) {
        updateAnswer((answer) => ({ ...answer, status: 'stopped' }))
      } else {
        const errorMessage = caught instanceof BusinessApiError ? caught.userMessage : 'L’assistant n’a pas pu répondre. Réessayez.'
        updateAnswer((answer) => ({ ...answer, status: 'error', errorMessage }))
      }
      api.assistantQuota(business.id).then(setQuota).catch(() => undefined)
    } finally {
      setIsGenerating(false)
      controllerRef.current = null
    }
  }

  const ask = (text: string) => {
    const content = text.trim()
    if ((!content && draftAttachments.length === 0) || isGenerating) return
    const attachments = draftAttachments
    setDraft('')
    setDraftAttachments([])
    void run([...messages, { id: newId(), role: 'user', content, createdAt: new Date().toISOString(), ...(attachments.length ? { attachments } : {}) }])
  }

  const addFiles = async (files: File[]) => {
    const photos = files.filter((file) => PHOTO_TYPES.split(',').includes(file.type === 'image/jpg' ? 'image/jpeg' : file.type))
    if (photos.length < files.length) onNotify('L’assistant Business lit seulement les photos (JPEG, PNG, WebP).')
    if (photos.length === 0) return
    setIsPreparingFiles(true)
    try {
      const { attachments, problems } = await prepareAttachments(photos, draftAttachments)
      setDraftAttachments((current) => [...current, ...attachments.filter(isImage)].slice(0, 3))
      if (problems.length > 0) onNotify(problems.join(' '))
    } catch {
      onNotify('La photo n’a pas pu être lue. Essayez une autre image.')
    } finally {
      setIsPreparingFiles(false)
    }
  }

  /** Met à jour une fiche ; une erreur d’enregistrement la remet « à vérifier » (message dans la fiche). */
  const setProposalState = (answerId: string, proposalId: string, change: Partial<ProposalState>) => setProposals((current) => ({
    ...current,
    [answerId]: (current[answerId] ?? []).map((state) => (state.proposal.id === proposalId ? { ...state, ...change } : state)),
  }))
  const confirm = async (answerId: string, proposalId: string, save: () => Promise<string>) => {
    setProposalState(answerId, proposalId, { status: 'saving' })
    try {
      const result = await save()
      setProposalState(answerId, proposalId, { status: 'done', result })
      onNotify(result, 'success')
      await onDataChanged().catch(() => onNotify('La liste des produits n’a pas pu être actualisée. Rechargez la page.'))
    } catch (error) {
      setProposalState(answerId, proposalId, { status: 'pending' })
      throw error
    }
  }

  /** Repose la dernière question (la réponse précédente est remplacée). */
  const regenerate = () => {
    const index = messages.findLastIndex((message) => message.role === 'user')
    if (index >= 0 && !isGenerating) void run(messages.slice(0, index + 1))
  }

  const editLastMessage = (content: string) => {
    const index = messages.findLastIndex((message) => message.role === 'user')
    if (index < 0 || isGenerating || !content.trim()) return
    void run([...messages.slice(0, index), { ...messages[index], content: content.trim() }])
  }

  const copy = async (message: ChatMessageType) => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
      window.setTimeout(() => setCopiedMessageId(undefined), 2000)
    } catch {
      // Copie refusée par le navigateur : rien à faire.
    }
  }

  const reset = () => {
    setMessages([])
    setContexts({})
    setProposals({})
    setFocusToken((token) => token + 1)
  }

  const isWaiting = isGenerating && lastMessage?.role === 'user'

  return (
    <section aria-label="Assistant" className="assistant-panel">
      {messages.length === 0 ? (
        <div className="welcome assistant-welcome">
          <div className="welcome-head fade-up">
            <div className="weave-band welcome-band" aria-hidden="true" />
            <h2>Que voulez-vous savoir sur votre commerce&#8239;?</h2>
            <p className="assistant-intro">Réponses à partir de vos chiffres, calculés par Gilli. Conseils indicatifs, pas un avis comptable ou fiscal.</p>
          </div>
          <div className="saved-prompt-row" aria-label="Exemples de questions">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" className="saved-prompt-chip" onClick={() => ask(suggestion)} disabled={isGenerating || remaining === 0}>
                <Sparkles size={14} aria-hidden="true" />
                <span>{suggestion}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="messages-list" aria-label="Conversation avec l’assistant">
          {messages.map((message) => (
            <div key={message.id} className="assistant-message">
              <ChatMessage
                message={message}
                copiedMessageId={copiedMessageId}
                canRegenerate={message === lastMessage && !isGenerating}
                canEdit={message === lastUserMessage && !isGenerating}
                onEdit={editLastMessage}
                onCopy={(copied) => void copy(copied)}
                onRegenerate={regenerate}
              />
              {(proposals[message.id] ?? []).map((state) => (
                <ProposalCard
                  key={state.proposal.id}
                  proposal={state.proposal}
                  status={state.status}
                  result={state.result}
                  api={api}
                  business={business}
                  products={products}
                  onDismiss={() => setProposalState(message.id, state.proposal.id, { status: 'dismissed' })}
                  onConfirm={(save) => confirm(message.id, state.proposal.id, save)}
                />
              ))}
              {contexts[message.id] && <ContextDetails context={contexts[message.id]} />}
            </div>
          ))}
          {isWaiting && (
            <div className="message-row is-assistant fade-up" aria-live="polite">
              <BrandMark />
              <span className="typing-dots" aria-hidden="true"><span /><span /><span /></span>
              <span className="visually-hidden">L’assistant rédige sa réponse…</span>
            </div>
          )}
          {!isGenerating && (
            <div className="restart-row">
              <button type="button" className="restart-button" onClick={reset}>
                <RotateCcw size={14} aria-hidden="true" /> Nouvelle conversation
              </button>
            </div>
          )}
        </div>
      )}
      <div ref={endRef} aria-hidden="true" />

      <div className="assistant-composer-zone">
        {remaining !== null && quota && (
          <p className="assistant-quota">{remaining} question{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''} aujourd’hui (sur {quota.limit}) · conversation non enregistrée</p>
        )}
        <Composer
          value={draft}
          isGenerating={isGenerating}
          isDemonstration={false}
          stopLabel="Arrêter la réponse"
          focusToken={focusToken}
          attachments={draftAttachments}
          isPreparingFiles={isPreparingFiles}
          onAddFiles={(files) => void addFiles(files)}
          onRemoveAttachment={(id) => setDraftAttachments((current) => current.filter((attachment) => attachment.id !== id))}
          onValueChange={setDraft}
          onSend={ask}
          onStop={() => controllerRef.current?.abort()}
          onNotify={onNotify}
          allowVoice={false}
          accept={PHOTO_TYPES}
          attachLabel="Joindre une photo de produit"
          placeholder={remaining === 0 ? 'Limite du jour atteinte : revenez demain.' : 'Question ou demande : vente, dépense, produit (photo possible)…'}
          label="Votre question"
        />
      </div>
    </section>
  )
}
