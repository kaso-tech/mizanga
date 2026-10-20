import { Check, CheckCheck, Copy, FileText, Flag, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatSize, isImage } from '../app/attachments'
import type { Attachment, ChatMessage as ChatMessageType, MessageRating } from '../domain/types'
import { BrandMark } from './Brand'

/** Bloc de code avec son langage et un bouton de copie. */
function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement | null>(null)
  const [copied, setCopied] = useState(false)
  const [language, setLanguage] = useState('')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preRef.current?.innerText ?? '')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span>{language}</span>
        <button type="button" onClick={copy} aria-label={copied ? 'Code copié' : 'Copier le code'}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre
        ref={(element) => {
          preRef.current = element
          const match = element?.querySelector('code')?.className.match(/language-([\w+#-]+)/)
          if (match && match[1] !== language) setLanguage(match[1])
        }}
      >
        {children}
      </pre>
    </div>
  )
}

// Le HTML brut reste désactivé (comportement par défaut de react-markdown) : seul le Markdown est interprété.
const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  table: ({ node: _node, ...props }) => <div className="table-scroll"><table {...props} /></div>,
  pre: ({ node: _node, children }) => <CodeBlock>{children}</CodeBlock>,
}

/** Fichiers joints à un message : aperçu des photos, sinon nom et taille. */
function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  return (
    <ul className="message-attachments" aria-label="Fichiers joints">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          {isImage(attachment) && attachment.data ? (
            <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt={attachment.name} />
          ) : (
            <span className="attachment-chip is-static" title={attachment.data ? undefined : 'Contenu non conservé sur cet appareil'}>
              <span className="attachment-icon"><FileText size={18} aria-hidden="true" /></span>
              <span className="attachment-text"><span className="attachment-name">{attachment.name}</span><span className="attachment-size">{attachment.data ? formatSize(attachment.size) : 'non conservé'}</span></span>
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Message de l’utilisateur, avec copie et — pour le dernier — modification puis relance. */
function UserMessage({ message, canEdit, onCopy, onEdit }: { message: ChatMessageType; canEdit: boolean; onCopy: (message: ChatMessageType) => void; onEdit: (content: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)

  if (draft !== null) {
    const submit = () => {
      if (!draft.trim()) return
      onEdit(draft)
      setDraft(null)
    }
    return (
      <article className="message-row is-user" aria-label="Modifier votre message">
        <div className="edit-box">
          <label className="visually-hidden" htmlFor={`edit-${message.id}`}>Modifier votre message</label>
          <textarea
            id={`edit-${message.id}`}
            autoFocus
            value={draft}
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setDraft(null)
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                submit()
              }
            }}
          />
          <div className="edit-actions">
            <button type="button" className="secondary-button" onClick={() => setDraft(null)}>Annuler</button>
            <button type="button" className="primary-button" disabled={!draft.trim()} onClick={submit}>Envoyer</button>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="message-row is-user fade-up" aria-label="Votre message">
      <div className="user-message">
        {message.attachments && message.attachments.length > 0 && <MessageAttachments attachments={message.attachments} />}
        {message.content && <div className="user-bubble">{message.content}</div>}
        <div className="message-actions user-actions">
          <button type="button" onClick={() => onCopy(message)} aria-label="Copier le message" title="Copier le message"><Copy size={15} /></button>
          {canEdit && (
            <button type="button" onClick={() => setDraft(message.content)} aria-label="Modifier le message" title="Modifier le message"><Pencil size={15} /></button>
          )}
        </div>
      </div>
    </article>
  )
}

interface ChatMessageProps {
  message: ChatMessageType
  copiedMessageId?: string
  canRegenerate: boolean
  canEdit: boolean
  onEdit: (content: string) => void
  onCopy: (message: ChatMessageType) => void
  onRegenerate: () => void
  onRate: (message: ChatMessageType, rating: MessageRating) => void
  onReport: (message: ChatMessageType, selectedPassage: string) => void
}

export function ChatMessage({ message, copiedMessageId, canRegenerate, canEdit, onEdit, onCopy, onRegenerate, onRate, onReport }: ChatMessageProps) {
  // Le passage sélectionné dans la réponse pré-remplit le formulaire de signalement.
  const [selectedPassage, setSelectedPassage] = useState('')

  if (message.role === 'user') {
    return <UserMessage message={message} canEdit={canEdit} onCopy={onCopy} onEdit={onEdit} />
  }

  const isDone = message.status !== 'streaming'
  const isCopied = copiedMessageId === message.id

  return (
    <article className="message-row is-assistant fade-up" aria-label="Réponse de Mizanga">
      <BrandMark />
      <div className="assistant-body">
        {message.isDemonstration && <span className="demo-badge">Démonstration — aucune IA réelle</span>}
        {message.content && (
          <div className="assistant-content" lang={message.language} aria-busy={!isDone || undefined} onMouseUp={() => setSelectedPassage(window.getSelection()?.toString() ?? '')}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{message.content}</ReactMarkdown>
          </div>
        )}
        {message.status === 'stopped' && <p className="message-status">Génération arrêtée.</p>}
        {message.status === 'error' && <p className="message-error" role="alert">{message.errorMessage ?? 'Une erreur est survenue lors de la génération. Réessayez.'}</p>}

        {isDone && !message.content && canRegenerate && (
          <div className="message-actions">
            <button type="button" className="has-label" onClick={onRegenerate}><RefreshCw size={16} aria-hidden="true" /> Réessayer</button>
          </div>
        )}
        {isDone && message.content && (
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
