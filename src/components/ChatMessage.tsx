import { Check, Copy, Flag, ThumbsDown, ThumbsUp } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from '../domain/types'

type ContentBlock =
  | { type: 'paragraph'; value: string }
  | { type: 'heading'; value: string }
  | { type: 'quote'; value: string }
  | { type: 'unordered-list' | 'ordered-list'; items: string[] }

function formatContent(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  let paragraph: string[] = []
  let list: { type: 'unordered-list' | 'ordered-list'; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', value: paragraph.join('\n') })
    paragraph = []
  }
  const flushList = () => {
    if (list) blocks.push(list)
    list = null
  }

  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^#{1,3}\s+(.+)$/)
    const quote = line.match(/^>\s?(.+)$/)
    const unorderedItem = line.match(/^[-*]\s+(.+)$/)
    const orderedItem = line.match(/^\d+\.\s+(.+)$/)

    if (!line.trim()) {
      flushParagraph()
      flushList()
    } else if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', value: heading[1] })
    } else if (quote) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'quote', value: quote[1] })
    } else if (unorderedItem || orderedItem) {
      flushParagraph()
      const type = unorderedItem ? 'unordered-list' : 'ordered-list'
      const item = (unorderedItem ?? orderedItem)![1]
      if (!list || list.type !== type) {
        flushList()
        list = { type, items: [] }
      }
      list.items.push(item)
    } else {
      flushList()
      paragraph.push(line)
    }
  }

  flushParagraph()
  flushList()
  return blocks
}

function MessageContent({ content }: { content: string }) {
  return (
    <>
      {formatContent(content).map((block, index) => {
        const key = `${block.type}-${index}`
        if (block.type === 'heading') return <h3 key={key}>{block.value}</h3>
        if (block.type === 'quote') return <blockquote key={key}>{block.value}</blockquote>
        if ('items' in block) {
          return block.type === 'unordered-list'
            ? <ul key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{item}</li>)}</ul>
            : <ol key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{item}</li>)}</ol>
        }
        return <p key={key}>{block.value}</p>
      })}
    </>
  )
}

interface ChatMessageProps {
  message: ChatMessageType
  copiedMessageId?: string
  onCopy: (message: ChatMessageType) => void
  onFeedback: (message: ChatMessageType, positive: boolean) => void
  onReport: (message: ChatMessageType) => void
}

export function ChatMessage({ message, copiedMessageId, onCopy, onFeedback, onReport }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <article className={`message-row ${isUser ? 'is-user' : 'is-assistant'}`}>
      {!isUser && <span className="assistant-avatar" aria-hidden="true">M</span>}
      <div className="message-block">
        <div className="message-meta">
          <strong>{isUser ? 'Vous' : 'Mizanga'}</strong>
          {!isUser && message.isDemonstration && <span className="demo-chip">Démonstration</span>}
        </div>
        <div className="message-bubble"><MessageContent content={message.content} /></div>

        {!isUser && (
          <>
            <section className="sources-empty" aria-label="Sources">
              <div><span className="sources-dot" aria-hidden="true" /><strong>Sources</strong></div>
              <p>Recherche externe non connectée — aucune source à afficher.</p>
            </section>
            <div className="message-actions" aria-label="Actions pour cette réponse">
              <button type="button" onClick={() => onCopy(message)} aria-label="Copier la réponse">
                {copiedMessageId === message.id ? <Check size={16} /> : <Copy size={16} />}
                {copiedMessageId === message.id ? 'Copié' : 'Copier'}
              </button>
              <span className="action-divider" />
              <button type="button" onClick={() => onFeedback(message, true)} aria-label="Cette réponse est correcte"><ThumbsUp size={16} /></button>
              <button type="button" onClick={() => onFeedback(message, false)} aria-label="Cette réponse n’est pas correcte"><ThumbsDown size={16} /></button>
              <button type="button" onClick={() => onReport(message)}><Flag size={16} /> Signaler une erreur en Mooré</button>
            </div>
          </>
        )}
      </div>
    </article>
  )
}
