import { ArrowDown, Code2, FileText, Lightbulb, Mail, RotateCcw, Search, Sprout } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { suggestions, type SuggestionIcon } from '../data/content'
import type { ChatMessage as ChatMessageType, MessageRating } from '../domain/types'
import { BrandMark } from './Brand'
import { ChatMessage } from './ChatMessage'

const suggestionIcons: Record<SuggestionIcon, typeof Mail> = {
  mail: Mail,
  summarize: FileText,
  ideas: Lightbulb,
  code: Code2,
  advice: Sprout,
  explain: Search,
}

interface ChatViewProps {
  messages: ChatMessageType[]
  isGenerating: boolean
  isDemonstration: boolean
  responseLanguageLabel: string
  /** Zone de saisie affichée au centre de l’écran d’accueil. */
  composer: ReactNode
  copiedMessageId?: string
  onSuggestion: (prompt: string) => void
  onNewConversation: () => void
  onCopy: (message: ChatMessageType) => void
  onRegenerate: () => void
  onEditLastMessage: (content: string) => void
  onRate: (message: ChatMessageType, rating: MessageRating) => void
  onReport: (message: ChatMessageType, selectedPassage: string) => void
}

export function ChatView({
  messages,
  isGenerating,
  isDemonstration,
  responseLanguageLabel,
  composer,
  copiedMessageId,
  onSuggestion,
  onNewConversation,
  onCopy,
  onRegenerate,
  onEditLastMessage,
  onRate,
  onReport,
}: ChatViewProps) {
  const isEmpty = messages.length === 0
  const lastMessage = messages.at(-1)
  const lastUserMessage = messages.findLast((message) => message.role === 'user')
  // L’indicateur d’attente disparaît dès que le premier fragment de réponse s’affiche.
  const isStreaming = lastMessage?.status === 'streaming'
  const endRef = useRef<HTMLDivElement>(null)
  // La réponse n’est suivie que si l’on est déjà en bas : on peut remonter lire sans être ramené de force.
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAtBottomRef = useRef(true)
  const previousCount = useRef(messages.length)
  // Pendant un défilement lancé par l’application, les positions intermédiaires ne signifient pas que l’on remonte.
  const ignoreScrollUntil = useRef(0)

  const scrollToEnd = (smooth = false) => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const useSmooth = smooth && !reduceMotion
    isAtBottomRef.current = true
    setIsAtBottom(true)
    if (useSmooth) ignoreScrollUntil.current = Date.now() + 800
    endRef.current?.scrollIntoView({ behavior: useSmooth ? 'smooth' : 'auto', block: 'end' })
  }

  useEffect(() => {
    const container = endRef.current?.closest('.content-scroll')
    if (!container) return
    const onScroll = () => {
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120
      if (!atBottom && Date.now() < ignoreScrollUntil.current) return
      isAtBottomRef.current = atBottom
      setIsAtBottom(atBottom)
    }
    onScroll()
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [isEmpty])

  useEffect(() => {
    if (isEmpty) return
    // Un message que l’on vient d’envoyer ramène toujours en bas.
    const sentByUser = messages.length > previousCount.current && lastMessage?.role === 'user'
    previousCount.current = messages.length
    // Défilement instantané pendant la diffusion : un défilement doux serait plus lent que le texte.
    if (sentByUser || isAtBottomRef.current) scrollToEnd(sentByUser)
  }, [messages.length, isGenerating, isEmpty, lastMessage?.content.length, lastMessage?.role])

  if (isEmpty) {
    return (
      <section className="welcome" aria-labelledby="welcome-title">
        <div className="welcome-head fade-up">
          <div className="weave-band welcome-band" aria-hidden="true" />
          <h1 id="welcome-title">Comment puis-je vous aider&#8239;?</h1>
          <p>Un assistant pour écrire, analyser, apprendre et résoudre vos tâches — qui vous répond aussi en mooré.</p>
        </div>
        <div className="welcome-composer">{composer}</div>
        <p className="response-language-note">Réponses en : <strong>{responseLanguageLabel}</strong></p>
        <div className="suggestion-grid" aria-label="Suggestions">
          {suggestions.map(({ label, prompt, icon }) => {
            const Icon = suggestionIcons[icon]
            return (
              <button type="button" key={label} className="suggestion-card" onClick={() => onSuggestion(prompt)}>
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
            canEdit={message === lastUserMessage && !isGenerating}
            onEdit={onEditLastMessage}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onRate={onRate}
            onReport={onReport}
          />
        ))}
        {isGenerating && !isStreaming && (
          <div className="message-row is-assistant fade-up" aria-live="polite">
            <BrandMark />
            <span className="typing-dots" aria-hidden="true"><span /><span /><span /></span>
            <span className="visually-hidden">{isDemonstration ? 'Préparation de la démonstration…' : 'Génération de la réponse…'}</span>
          </div>
        )}
        {!isGenerating && (
          <div className="restart-row">
            <button type="button" className="restart-button" onClick={onNewConversation}>
              <RotateCcw size={14} aria-hidden="true" /> Nouvelle conversation
            </button>
          </div>
        )}
        <div ref={endRef} aria-hidden="true" />
        {!isAtBottom && (
          <button type="button" className="scroll-bottom-button" onClick={() => scrollToEnd(true)} aria-label="Aller à la fin de la conversation">
            <ArrowDown size={16} aria-hidden="true" /> {isGenerating ? 'Suivre la réponse' : 'Aller en bas'}
          </button>
        )}
      </div>
    </section>
  )
}
