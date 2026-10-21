import { MessageSquare, Star } from 'lucide-react'
import type { Conversation } from '../domain/types'

interface CollectionViewProps {
  kind: 'history' | 'favorites'
  conversations: Conversation[]
  savesConversations: boolean
  onSelectConversation: (conversationId: string) => void
}

/** Historique et favoris de la session (aussi accessibles depuis la barre latérale). */
export function CollectionView({ kind, conversations, savesConversations, onSelectConversation }: CollectionViewProps) {
  const isHistory = kind === 'history'
  const items = isHistory ? conversations : conversations.filter((conversation) => conversation.favorite)
  const Icon = isHistory ? MessageSquare : Star

  return (
    <div className="page-view collection-view">
      <h1>{isHistory ? 'Historique' : 'Favoris'}</h1>
      {!savesConversations && <p className="page-intro">Non enregistré : disparaît à la fermeture.</p>}
      {items.length === 0 ? (
        <p className="conversation-empty">{isHistory ? 'Aucune conversation pour l’instant.' : 'Aucun favori.'}</p>
      ) : (
        <ul className="collection-list">
          {items.map((conversation) => (
            <li key={conversation.id}>
              <button type="button" onClick={() => onSelectConversation(conversation.id)}>
                <Icon size={16} aria-hidden="true" />
                <span>{conversation.title || 'Sans titre'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
