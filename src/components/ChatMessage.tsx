import { BookmarkPlus, Check, Zap, CheckCheck, ChevronLeft, ChevronRight, Copy, FileText, Flag, Globe, Library, Pencil, RefreshCw, Share2, Square, ThumbsDown, ThumbsUp, Volume2 } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { formatSize, isAudio, isImage } from '../app/attachments'
import type { Attachment, ChatMessage as ChatMessageType, MessageRating } from '../domain/types'
import { BrandMark } from './Brand'

// Le moteur Markdown n’est chargé qu’à l’affichage de la première réponse.
const MarkdownContent = lazy(() => import('./MarkdownContent').then((module) => ({ default: module.MarkdownContent })))

/** Fichiers joints à un message : aperçu des photos, sinon nom et taille. */
function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  return (
    <ul className="message-attachments" aria-label="Fichiers joints">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          {isImage(attachment) && attachment.data ? (
            <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt={attachment.name} />
          ) : isAudio(attachment) && attachment.data ? (
            <span className="audio-attachment">
              <audio controls preload="metadata" src={`data:${attachment.mimeType};base64,${attachment.data}`} aria-label={attachment.name} />
            </span>
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

/** Partage natif (WhatsApp, SMS, e-mail…) quand le navigateur le propose, surtout sur mobile. */
const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

async function shareReply(message: ChatMessageType) {
  const sources = message.sources?.length ? `\n\nSources :\n${message.sources.map((source) => `- ${source.title} : ${source.url}`).join('\n')}` : ''
  try {
    await navigator.share({ title: 'Réponse de Gilli', text: `${message.content}${sources}` })
  } catch {
    // Partage annulé par l’utilisateur : rien à signaler.
  }
}

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Sources web d’une réponse et suggestions de recherche Google. Les conditions de Google imposent
 * d’afficher ces suggestions sans les modifier : elles sont isolées dans un cadre sans scripts.
 */
function WebSources({ sources = [], searchSuggestionsHtml }: { sources?: Array<{ title: string; url: string }>; searchSuggestionsHtml?: string }) {
  return (
    <section className="web-sources" aria-label="Sources web">
      <p className="web-sources-title"><Library size={14} aria-hidden="true" /> Sources</p>
      {sources.length > 0 ? (
        <ol>
          {sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
              <span>{hostname(source.url)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="web-sources-empty">Le moteur n’a cité aucune source pour cette réponse.</p>
      )}
      {searchSuggestionsHtml && (
        <iframe
          className="search-suggestions"
          title="Suggestions de recherche Google"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0}</style></head><body>${searchSuggestionsHtml}</body></html>`}
        />
      )}
    </section>
  )
}

/** Choix entre les versions d’une réponse régénérée. */
function VersionNav({ message, onSelect }: { message: ChatMessageType; onSelect: (index: number) => void }) {
  const count = message.versions?.length ?? 0
  const index = message.versionIndex ?? count - 1
  if (count < 2) return null
  return (
    <span className="version-nav" role="group" aria-label="Versions de la réponse">
      <button type="button" disabled={index === 0} onClick={() => onSelect(index - 1)} aria-label="Version précédente" title="Version précédente"><ChevronLeft size={16} /></button>
      <span aria-live="polite">{index + 1} / {count}</span>
      <button type="button" disabled={index === count - 1} onClick={() => onSelect(index + 1)} aria-label="Version suivante" title="Version suivante"><ChevronRight size={16} /></button>
    </span>
  )
}

/** Message de l’utilisateur, avec copie et — pour le dernier — modification puis relance. */
function UserMessage({ message, canEdit, onCopy, onEdit, onSavePrompt }: { message: ChatMessageType; canEdit: boolean; onCopy: (message: ChatMessageType) => void; onEdit: (content: string) => void; onSavePrompt?: (prompt: string) => void }) {
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
        {message.webSearch && <span className="web-search-tag"><Globe size={12} aria-hidden="true" /> Recherche web</span>}
        <div className="message-actions user-actions">
          <button type="button" onClick={() => onCopy(message)} aria-label="Copier le message" title="Copier le message"><Copy size={15} /></button>
          {canEdit && (
            <button type="button" onClick={() => setDraft(message.content)} aria-label="Modifier le message" title="Modifier le message"><Pencil size={15} /></button>
          )}
          {onSavePrompt && message.content.trim() && (
            <button type="button" onClick={() => onSavePrompt(message.content)} aria-label="Enregistrer comme consigne" title="Enregistrer comme consigne réutilisable"><BookmarkPlus size={15} /></button>
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
  /** Avis et signalement : absents, leurs boutons ne sont pas proposés (assistant Business). */
  onRate?: (message: ChatMessageType, rating: MessageRating) => void
  onReport?: (message: ChatMessageType, selectedPassage: string) => void
  onSpeak?: (message: ChatMessageType) => void
  isSpeaking?: boolean
  /** Changer de version ; seulement pour la dernière réponse, que la suite de la conversation ne contredit pas. */
  onSelectVersion?: (message: ChatMessageType, index: number) => void
  onSavePrompt?: (prompt: string) => void
  onUseLiteModel?: () => void
}

export function ChatMessage({ message, copiedMessageId, canRegenerate, canEdit, onEdit, onCopy, onRegenerate, onRate, onReport, onSpeak, isSpeaking = false, onSelectVersion, onSavePrompt, onUseLiteModel }: ChatMessageProps) {
  // Le passage sélectionné dans la réponse pré-remplit le formulaire de signalement.
  const [selectedPassage, setSelectedPassage] = useState('')

  if (message.role === 'user') {
    return <UserMessage message={message} canEdit={canEdit} onCopy={onCopy} onEdit={onEdit} onSavePrompt={onSavePrompt} />
  }

  const isDone = message.status !== 'streaming'
  const isCopied = copiedMessageId === message.id

  return (
    <article className="message-row is-assistant fade-up" aria-label="Réponse de Gilli">
      <BrandMark />
      <div className="assistant-body">
        {message.isDemonstration && <span className="demo-badge">Démonstration — aucune IA réelle</span>}
        {message.content && (
          <div className="assistant-content" lang={message.language} aria-busy={!isDone || undefined} onMouseUp={() => setSelectedPassage(window.getSelection()?.toString() ?? '')}>
            <Suspense fallback={<p className="markdown-fallback">{message.content}</p>}>
              <MarkdownContent content={message.content} />
            </Suspense>
          </div>
        )}
        {isDone && (message.sources || message.searchSuggestionsHtml) && <WebSources sources={message.sources} searchSuggestionsHtml={message.searchSuggestionsHtml} />}
        {message.status === 'stopped' && <p className="message-status">Génération arrêtée.</p>}
        {message.status === 'error' && <p className="message-error" role="alert">{message.errorMessage ?? 'Une erreur est survenue lors de la génération. Réessayez.'}</p>}

        {isDone && !message.content && canRegenerate && (
          <div className="message-actions">
            {onSelectVersion && <VersionNav message={message} onSelect={(index) => onSelectVersion(message, index)} />}
            <button type="button" className="has-label" onClick={onRegenerate}><RefreshCw size={16} aria-hidden="true" /> Réessayer</button>
            {message.errorCode === 'quota' && onUseLiteModel && (
              <button type="button" className="has-label is-highlighted" onClick={onUseLiteModel}><Zap size={16} aria-hidden="true" /> Réessayer avec le modèle économe</button>
            )}
          </div>
        )}
        {isDone && message.content && (
          <div className="message-actions" aria-label="Actions pour cette réponse">
            {onSelectVersion && <VersionNav message={message} onSelect={(index) => onSelectVersion(message, index)} />}
            <button type="button" onClick={() => onCopy(message)} aria-label={isCopied ? 'Copié' : 'Copier'} title={isCopied ? 'Copié' : 'Copier'}>
              {isCopied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            {onSpeak && (
              <button type="button" className={isSpeaking ? 'is-active' : ''} aria-pressed={isSpeaking} onClick={() => onSpeak(message)} aria-label={isSpeaking ? 'Arrêter la lecture' : 'Écouter la réponse'} title={isSpeaking ? 'Arrêter la lecture' : 'Écouter'}>
                {isSpeaking ? <Square size={14} fill="currentColor" /> : <Volume2 size={16} />}
              </button>
            )}
            {canShare() && (
              <button type="button" onClick={() => void shareReply(message)} aria-label="Partager la réponse" title="Partager (WhatsApp, SMS…)"><Share2 size={16} /></button>
            )}
            {canRegenerate && (
              <button type="button" onClick={onRegenerate} aria-label="Régénérer" title="Régénérer"><RefreshCw size={16} /></button>
            )}
            {onRate && (
              <>
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
              </>
            )}
            {onReport && (
              <button type="button" className="has-label" onClick={() => onReport(message, selectedPassage)}>
                <Flag size={16} aria-hidden="true" />
                <span className="label-long">Signaler une erreur en mooré</span><span className="label-short">Signaler</span>
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
