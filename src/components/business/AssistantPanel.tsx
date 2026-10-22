import { Bot, Send, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { formatAmount, formatQuantity } from '../../app/businessFormat'
import { BusinessApiError, type AiQuota, type AssistantContext, type AssistantMessage, type Business, type BusinessApi } from '../../services/businessApi'
import { MarkdownContent } from '../MarkdownContent'

const suggestions = [
  'Comment se passent mes ventes ce mois-ci ?',
  'Quels produits dois-je réapprovisionner ?',
  'Quel produit me rapporte le plus de marge ?',
  'Où partent mes dépenses ?',
]

interface Turn extends AssistantMessage {
  context?: AssistantContext
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

/**
 * Assistant Business : questions en langage courant sur les chiffres du commerce. La conversation reste
 * sur cet écran (elle n’est pas enregistrée) ; chaque question compte dans la limite du jour.
 */
export function AssistantPanel({ api, business }: { api: BusinessApi; business: Business }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [quota, setQuota] = useState<AiQuota | null>(null)
  const [error, setError] = useState('')
  const [isAnswering, setIsAnswering] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.assistantQuota(business.id).then(setQuota).catch(() => setQuota(null))
    return () => controllerRef.current?.abort()
  }, [api, business.id])

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [turns])

  const remaining = quota ? Math.max(quota.limit - quota.used, 0) : null

  const ask = async (text: string) => {
    const content = text.trim()
    if (!content || isAnswering) return
    const history: AssistantMessage[] = [...turns.map(({ role, content: previous }) => ({ role, content: previous })), { role: 'user' as const, content }].slice(-20)
    setTurns((current) => [...current, { role: 'user' as const, content }, { role: 'assistant' as const, content: '' }])
    setDraft('')
    setError('')
    setIsAnswering(true)
    const controller = new AbortController()
    controllerRef.current = controller
    const updateAnswer = (change: (turn: Turn) => Turn) => setTurns((current) => [...current.slice(0, -1), change(current[current.length - 1])])
    try {
      await api.askAssistant(business.id, history, (event) => {
        if ('context' in event) {
          setQuota(event.quota)
          updateAnswer((turn) => ({ ...turn, context: event.context }))
        } else if ('text' in event) {
          updateAnswer((turn) => ({ ...turn, content: turn.content + event.text }))
        } else {
          setQuota(event.quota)
        }
      }, controller.signal)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof BusinessApiError ? caught.userMessage : 'L’assistant n’a pas pu répondre. Réessayez.')
      // Une réponse vide (refus, limite atteinte) est retirée ; la question reste dans la zone de saisie.
      setTurns((current) => (current[current.length - 1]?.content ? current : current.slice(0, -2)))
      setDraft((current) => current || content)
      api.assistantQuota(business.id).then(setQuota).catch(() => undefined)
    } finally {
      setIsAnswering(false)
      controllerRef.current = null
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void ask(draft)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void ask(draft)
    }
  }

  return (
    <section aria-label="Assistant" className="business-panel assistant-panel">
      <p className="settings-callout">
        <Bot size={16} aria-hidden="true" />
        <span>
          L’assistant répond à partir des chiffres de votre commerce, calculés par Gilli ; il n’en invente pas. Ses conseils restent indicatifs : ce n’est pas un avis comptable ou fiscal.
          {remaining !== null && quota && <> <strong>{remaining} question{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''} aujourd’hui</strong> (sur {quota.limit}).</>}
        </span>
      </p>

      {turns.length === 0 ? (
        <div className="assistant-suggestions" aria-label="Exemples de questions">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="secondary-button" onClick={() => void ask(suggestion)} disabled={isAnswering || remaining === 0}>{suggestion}</button>
          ))}
        </div>
      ) : (
        <ol className="assistant-thread" aria-label="Conversation avec l’assistant" aria-live="polite">
          {turns.map((turn, index) => (
            <li key={index} className={`assistant-turn is-${turn.role}`}>
              {turn.role === 'user' ? <p>{turn.content}</p> : (
                <>
                  {turn.content ? <MarkdownContent content={turn.content} /> : <span className="assistant-typing" aria-label="L’assistant rédige sa réponse">…</span>}
                  {turn.context && turn.content && <ContextDetails context={turn.context} />}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />

      {error && <p className="message-error" role="alert">{error}</p>}
      <form className="assistant-composer" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="assistant-question">Votre question</label>
        <textarea id="assistant-question" rows={2} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="Posez une question sur votre commerce…" />
        {isAnswering ? (
          <button type="button" className="icon-button" aria-label="Arrêter la réponse" onClick={() => controllerRef.current?.abort()}><Square size={18} /></button>
        ) : (
          <button type="submit" className="primary-button icon-only" aria-label="Envoyer la question" disabled={!draft.trim() || remaining === 0}><Send size={18} /></button>
        )}
      </form>
      {turns.length > 0 && !isAnswering && (
        <button type="button" className="secondary-button assistant-reset" onClick={() => { setTurns([]); setError('') }}><Trash2 size={14} aria-hidden="true" /> Nouvelle conversation</button>
      )}
      <p className="field-hint">La conversation n’est pas enregistrée. Seul un résumé chiffré de votre commerce est transmis au moteur d’IA, sans noms de clients ni notes.</p>
    </section>
  )
}
