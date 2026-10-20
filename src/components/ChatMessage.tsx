import { Check, Copy, PencilLine, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { messageLanguageLabels } from '../data/content'
import type { ChatMessage as ChatMessageType } from '../domain/types'
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
  onFeedback: (message: ChatMessageType, positive: boolean) => void
  onReport: (message: ChatMessageType) => void
}

export function ChatMessage({ message, copiedMessageId, canRegenerate, onCopy, onRegenerate, onFeedback, onReport }: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <article className="message-row is-user" aria-label="Votre message">
        <div className="user-bubble">{message.content}</div>
      </article>
    )
  }

  const isStreaming = message.status === 'streaming'
  const isError = message.status === 'error'
  const isCopied = copiedMessageId === message.id
  const languageLabel = message.language ? messageLanguageLabels[message.language] ?? message.language : undefined

  return (
    <article className="message-row is-assistant" aria-label="Réponse de Mizanga">
      <BrandMark size={28} />
      <div className="assistant-body">
        <div className={`assistant-content ${isError ? 'is-error' : ''}`} lang={message.language} aria-busy={isStreaming || undefined}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{message.content}</ReactMarkdown>
        </div>
        {message.status === 'stopped' && <p className="message-status">Réponse interrompue.</p>}

        {!isStreaming && (
          <div className="message-footer">
            {message.isDemonstration && <span className="meta-pill is-demo">Démonstration</span>}
            {languageLabel && <span className={`meta-pill ${message.language === 'mos' ? 'is-moore' : ''}`}>{languageLabel}</span>}
            {!isError && (
              <div className="message-actions" aria-label="Actions pour cette réponse">
                <button type="button" onClick={() => onCopy(message)} aria-label={isCopied ? 'Copié' : 'Copier'} title={isCopied ? 'Copié' : 'Copier'}>
                  {isCopied ? <Check size={16} /> : <Copy size={16} />}
                </button>
                {canRegenerate && (
                  <button type="button" onClick={onRegenerate} aria-label="Régénérer" title="Régénérer"><RefreshCw size={16} /></button>
                )}
                <button type="button" onClick={() => onFeedback(message, true)} aria-label="Bonne réponse" title="Bonne réponse"><ThumbsUp size={16} /></button>
                <button type="button" onClick={() => onFeedback(message, false)} aria-label="Mauvaise réponse" title="Mauvaise réponse"><ThumbsDown size={16} /></button>
                {message.language === 'mos' && (
                  <button type="button" className="has-label" onClick={() => onReport(message)}><PencilLine size={15} aria-hidden="true" /> Proposer une correction</button>
                )}
              </div>
            )}
            {isError && canRegenerate && (
              <div className="message-actions">
                <button type="button" className="has-label" onClick={onRegenerate}><RefreshCw size={15} aria-hidden="true" /> Réessayer</button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
