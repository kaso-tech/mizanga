import { CalendarDays, FileText, GraduationCap, Lightbulb, MessageCircle, PenLine } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { suggestions, type SuggestionIcon } from '../data/content'
import type { ChatMessage as ChatMessageType } from '../domain/types'
import { BrandMark } from './Brand'
import { ChatMessage } from './ChatMessage'

const suggestionIcons: Record<SuggestionIcon, typeof PenLine> = {
  write: PenLine,
  summarize: FileText,
  explain: Lightbulb,
  plan: CalendarDays,
  homework: GraduationCap,
  moore: MessageCircle,
}

interface ChatViewProps {
  messages: ChatMessageType[]
  isGenerating: boolean
  isDemonstration: boolean
  /** Zone de saisie affichée au centre de l’écran d’accueil. */
  composer: ReactNode
  copiedMessageId?: string
  onSuggestion: (prompt: string) => void
  onCopy: (message: ChatMessageType) => void
  onRegenerate: () => void
  onFeedback: (message: ChatMessageType, positive: boolean) => void
  onReport: (message: ChatMessageType) => void
}

export function ChatView({
  messages,
  isGenerating,
  isDemonstration,
  composer,
  copiedMessageId,
  onSuggestion,
  onCopy,
  onRegenerate,
  onFeedback,
  onReport,
}: ChatViewProps) {
  const isEmpty = messages.length === 0
  const lastMessage = messages.at(-1)
  // L’indicateur d’attente disparaît dès que le premier fragment de réponse s’affiche.
  const isStreaming = lastMessage?.status === 'streaming'
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isEmpty) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' })
  }, [messages.length, isGenerating, isEmpty, lastMessage?.content.length])

  if (isEmpty) {
    return (
      <section className="welcome" aria-labelledby="welcome-title">
        <div className="welcome-head">
          <BrandMark size={44} />
          <h1 id="welcome-title">Bonjour, que puis-je faire&nbsp;?</h1>
          <p className="welcome-subtitle">Assistant généraliste, à l’aise en français comme en mooré.</p>
        </div>
        <div className="welcome-composer">
          {composer}
          <p className="disclaimer">
            {isDemonstration ? 'Version de démonstration — aucun moteur IA n’est encore connecté.' : 'Mizanga peut faire des erreurs ; vérifiez les informations importantes.'}
          </p>
        </div>
        <div className="suggestion-chips" aria-label="Suggestions">
          {suggestions.map(({ label, prompt, icon, highlight }) => {
            const Icon = suggestionIcons[icon]
            return (
              <button type="button" key={label} className={`suggestion-chip ${highlight ? 'is-highlight' : ''}`} onClick={() => onSuggestion(prompt)}>
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <section className="conversation-view" aria-label="Conversation">
      <div className="messages-list">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            copiedMessageId={copiedMessageId}
            canRegenerate={message === lastMessage && !isGenerating}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onFeedback={onFeedback}
            onReport={onReport}
          />
        ))}
        {isGenerating && !isStreaming && (
          <div className="message-row is-assistant generation-indicator" aria-live="polite">
            <BrandMark size={28} />
            <span className="typing-dots" aria-hidden="true"><span /><span /><span /></span>
            <span className="visually-hidden">{isDemonstration ? 'Préparation de la démonstration…' : 'Génération de la réponse…'}</span>
          </div>
        )}
        <div ref={endRef} aria-hidden="true" />
      </div>
    </section>
  )
}
