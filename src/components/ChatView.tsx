import { ArrowDown, Bookmark, RotateCcw, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { SavedPrompt } from '../app/savedPrompts'
import type { ChatMessage as ChatMessageType, MessageRating } from '../domain/types'
import { BrandMark } from './Brand'
import { ChatMessage } from './ChatMessage'

/** Exemples de recherches proposés à l’accueil (le client les complète ou les envoie tels quels). */
const shoppingExamples = [
  'Un téléphone Android performant à moins de 50 000 F',
  'Un réfrigérateur pour une petite boutique',
  'Des chaussures de sport pointure 42',
  'Un sac de riz parfumé 25 kg à Ouagadougou',
]

interface ChatViewProps {
  messages: ChatMessageType[]
  isGenerating: boolean
  isDemonstration: boolean
  copiedMessageId?: string
  /** Insère une consigne enregistrée dans la zone de saisie. */
  onSuggestion: (prompt: string) => void
  onNewConversation: () => void
  onCopy: (message: ChatMessageType) => void
  onRegenerate: () => void
  /** Proposé quand le quota du modèle principal est épuisé et qu’un modèle économe existe. */
  onEditLastMessage: (content: string) => void
  onRate: (message: ChatMessageType, rating: MessageRating) => void
  onReport?: (message: ChatMessageType, selectedPassage: string) => void
  /** Ouvre une annonce proposée par l’assistant d’achat. */
  onOpenListing?: (id: string) => void
  /** Lecture à voix haute ; absent quand elle est désactivée ou non prise en charge. */
  onSpeak?: (message: ChatMessageType) => void
  speakingMessageId?: string
  onSelectVersion: (message: ChatMessageType, index: number) => void
  savedPrompts: SavedPrompt[]
  onSavePrompt: (prompt: string) => void
  /** Titre de la conversation, repris en tête de la version imprimée. */
  title?: string
}

export function ChatView({
  messages,
  isGenerating,
  isDemonstration,
  copiedMessageId,
  onSuggestion,
  onNewConversation,
  onCopy,
  onRegenerate,
  onEditLastMessage,
  onRate,
  onReport,
  onOpenListing,
  onSpeak,
  speakingMessageId,
  onSelectVersion,
  savedPrompts,
  onSavePrompt,
  title,
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
          <h1 id="welcome-title">Que cherchez-vous&#8239;?</h1>
          <p className="welcome-intro">Dites ce qu’il vous faut et votre budget : Gilli cherche dans la marketplace et compare pour vous.</p>
        </div>
        <div className="saved-prompt-row" aria-label="Exemples de recherches">
          {shoppingExamples.map((example) => (
            <button type="button" key={example} className="saved-prompt-chip" onClick={() => onSuggestion(example)}>
              <Search size={14} aria-hidden="true" />
              <span>{example}</span>
            </button>
          ))}
        </div>
        {savedPrompts.length > 0 && (
          <div className="saved-prompt-row" aria-label="Vos consignes">
            {savedPrompts.slice(0, 6).map((item) => (
              <button type="button" key={item.id} className="saved-prompt-chip" title={item.prompt} onClick={() => onSuggestion(item.prompt)}>
                <Bookmark size={14} aria-hidden="true" />
                <span>{item.title}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="conversation-view" aria-label="Conversation">
      <header className="print-header">
        <p>Gilli — conversation imprimée le {new Date().toLocaleDateString('fr', { dateStyle: 'long' })}</p>
        <h1>{title || 'Conversation'}</h1>
      </header>
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
            onOpenListing={onOpenListing}
            onSpeak={onSpeak}
            isSpeaking={speakingMessageId === message.id}
            onSelectVersion={message === lastMessage && !isGenerating ? onSelectVersion : undefined}
            onSavePrompt={onSavePrompt}
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
