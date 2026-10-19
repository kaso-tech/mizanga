import { ArrowUpRight, BookOpenText, Globe2, Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ChatMessage as ChatMessageType } from '../domain/types'
import { suggestions, welcomeText } from '../data/content'
import { ChatMessage } from './ChatMessage'

interface ChatViewProps {
  messages: ChatMessageType[]
  isGenerating: boolean
  copiedMessageId?: string
  onSuggestion: (suggestion: string) => void
  onCopy: (message: ChatMessageType) => void
  onFeedback: (message: ChatMessageType, positive: boolean) => void
  onReport: (message: ChatMessageType) => void
}

export function ChatView({
  messages,
  isGenerating,
  copiedMessageId,
  onSuggestion,
  onCopy,
  onFeedback,
  onReport,
}: ChatViewProps) {
  const isEmpty = messages.length === 0
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isEmpty) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' })
  }, [messages.length, isGenerating, isEmpty])

  return (
    <section className={`conversation-view ${isEmpty ? 'is-empty' : ''}`} aria-label="Conversation">
      {isEmpty ? (
        <div className="welcome-panel">
          <div className="welcome-kicker"><span><Sparkles size={16} /></span> Comprendre, transmettre, apprendre</div>
          <h1>Votre espace pour dialoguer<br />dans la richesse du <em>Mooré.</em></h1>
          <p className="welcome-copy">{welcomeText}</p>
          <div className="demo-notice">
            <Globe2 size={18} />
            <p><strong>Interface en démonstration.</strong> Le moteur de recherche et le moteur linguistique seront connectés progressivement.</p>
          </div>
          <div className="suggestion-header"><BookOpenText size={17} /> Commencer avec une idée</div>
          <div className="suggestion-list">
            {suggestions.map((suggestion, index) => (
              <button type="button" key={suggestion} className="suggestion-card" onClick={() => onSuggestion(suggestion)}>
                <span>0{index + 1}</span>
                <strong>{suggestion}</strong>
                <ArrowUpRight size={17} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="messages-list">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              copiedMessageId={copiedMessageId}
              onCopy={onCopy}
              onFeedback={onFeedback}
              onReport={onReport}
            />
          ))}
          {isGenerating && (
            <div className="generation-indicator" aria-live="polite">
              <span className="assistant-avatar" aria-hidden="true">M</span>
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              <span>Préparation d’un état de démonstration…</span>
            </div>
          )}
          <div ref={endRef} aria-hidden="true" />
        </div>
      )}
    </section>
  )
}
