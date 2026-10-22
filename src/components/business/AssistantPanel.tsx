import { RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatAmount, formatQuantity } from '../../app/businessFormat'
import type { ChatMessage as ChatMessageType } from '../../domain/types'
import { BusinessApiError, type AiQuota, type AssistantContext, type AssistantMessage, type Business, type BusinessApi } from '../../services/businessApi'
import { BrandMark } from '../Brand'
import { ChatMessage } from '../ChatMessage'
import { Composer } from '../Composer'

const suggestions = [
  'Comment se passent mes ventes ce mois-ci ?',
  'Quels produits dois-je réapprovisionner ?',
  'Quel produit me rapporte le plus de marge ?',
  'Où partent mes dépenses ?',
]

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
export function AssistantPanel({ api, business }: { api: BusinessApi; business: Business }) {
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [contexts, setContexts] = useState<Record<string, AssistantContext>>({})
  const [draft, setDraft] = useState('')
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
    /** Crée la réponse au premier fragment, puis la met à jour. */
    const updateAnswer = (change: (answer: ChatMessageType) => ChatMessageType) => setMessages((current) => {
      const existing = current.find((message) => message.id === answerId)
      const base: ChatMessageType = existing ?? { id: answerId, role: 'assistant', content: '', createdAt: new Date().toISOString(), status: 'streaming' }
      const updated = change(base)
      return existing ? current.map((message) => (message.id === answerId ? updated : message)) : [...current, updated]
    })
    try {
      await api.askAssistant(business.id, history.map(({ role, content }): AssistantMessage => ({ role, content })).slice(-20), (event) => {
        if ('context' in event) {
          context = event.context
          setQuota(event.quota)
        } else if ('text' in event) {
          updateAnswer((answer) => ({ ...answer, content: answer.content + event.text }))
        } else {
          setQuota(event.quota)
        }
      }, controller.signal)
      updateAnswer((answer) => ({ ...answer, status: 'complete' }))
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
    if (!content || isGenerating) return
    setDraft('')
    void run([...messages, { id: newId(), role: 'user', content, createdAt: new Date().toISOString() }])
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
          attachments={[]}
          isPreparingFiles={false}
          onAddFiles={() => undefined}
          onRemoveAttachment={() => undefined}
          onValueChange={setDraft}
          onSend={ask}
          onStop={() => controllerRef.current?.abort()}
          onNotify={() => undefined}
          allowAttachments={false}
          placeholder={remaining === 0 ? 'Limite du jour atteinte : revenez demain.' : 'Posez une question sur votre commerce…'}
          label="Votre question"
        />
      </div>
    </section>
  )
}
