import { Check, CheckCheck, Copy, Flag, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage as ChatMessageType, MessageRating } from '../domain/types'
import { BrandMark } from './Brand'

// Le HTML brut reste désactivé (comportement par défaut de react-markdown) : seul le Markdown est interprété.
const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  table: ({ node: _node, ...props }) => <div className="table-scroll"><table {...props} /></div>,
}

interface ChatMessageProps {
  message: ChatMessageType
  copiedMessageId?: string
  canRegenerate: boolean
  onCopy: (message: ChatMessageType) => void
  onRegenerate: () => void
  onRate: (message: ChatMessageType, rating: MessageRating) => void
  onReport: (message: ChatMessageType, selectedPassage: string) => void
}

export function ChatMessage({ message, copiedMessageId, canRegenerate, onCopy, onRegenerate, onRate, onReport }: ChatMessageProps) {
  // Le passage sélectionné dans la réponse pré-remplit le formulaire de signalement.
  const [selectedPassage, setSelectedPassage] = useState('')

  if (message.role === 'user') {
    return (
      <article className="message-row is-user fade-up" aria-label="Votre message">
        <div className="user-bubble">{message.content}</div>
      </article>
    )
  }

  const isDone = message.status !== 'streaming'
  const isCopied = copiedMessageId === message.id

  return (
    <article className="message-row is-assistant fade-up" aria-label="Réponse de Mizanga">
      <BrandMark />
      <div className="assistant-body">
        {message.isDemonstration && <span className="demo-badge">Démonstration — aucune IA réelle</span>}
        <div className="assistant-content" lang={message.language} aria-busy={!isDone || undefined} onMouseUp={() => setSelectedPassage(window.getSelection()?.toString() ?? '')}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{message.content}</ReactMarkdown>
        </div>
        {message.status === 'stopped' && <p className="message-status">Génération arrêtée.</p>}
        {message.status === 'error' && <p className="message-error">Une erreur est survenue lors de la génération. Réessayez.</p>}

        {isDone && (
          <div className="message-actions" aria-label="Actions pour cette réponse">
            <button type="button" onClick={() => onCopy(message)} aria-label={isCopied ? 'Copié' : 'Copier'} title={isCopied ? 'Copié' : 'Copier'}>
              {isCopied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            {canRegenerate && (
              <button type="button" onClick={onRegenerate} aria-label="Régénérer" title="Régénérer"><RefreshCw size={16} /></button>
            )}
            <button type="button" className={message.rating === 'positive' ? 'is-positive' : ''} aria-pressed={message.rating === 'positive'} onClick={() => onRate(message, 'positive')} aria-label="Avis positif" title="Avis positif">
              <ThumbsUp size={16} fill={message.rating === 'positive' ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className={message.rating === 'negative' ? 'is-negative' : ''} aria-pressed={message.rating === 'negative'} onClick={() => onRate(message, 'negative')} aria-label="Avis négatif" title="Avis négatif">
              <ThumbsDown size={16} fill={message.rating === 'negative' ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className={`has-label ${message.rating === 'correct' ? 'is-positive' : ''}`} aria-pressed={message.rating === 'correct'} onClick={() => onRate(message, 'correct')}>
              <CheckCheck size={16} aria-hidden="true" />
              <span className="label-long">Cette réponse est correcte</span><span className="label-short">Correct</span>
            </button>
            <button type="button" className="has-label" onClick={() => onReport(message, selectedPassage)}>
              <Flag size={16} aria-hidden="true" />
              <span className="label-long">Signaler une erreur en mooré</span><span className="label-short">Signaler</span>
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
