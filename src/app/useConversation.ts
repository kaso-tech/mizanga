import { useEffect, useRef, useState } from 'react'
import { AiServiceError, type AiService } from '../domain/services'
import type { ChatMessage, Conversation, LinguisticPreferences, MessageRating } from '../domain/types'

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function createTitle(content: string) {
  const firstLine = content.trim().split(/\r?\n/)[0]
  return firstLine.length > 48 ? `${firstLine.slice(0, 47).trimEnd()}…` : firstLine
}

/**
 * Conversations de la session, alimentées par un AiService remplaçable.
 * Elles restent en mémoire : rien n’est enregistré après la fermeture de la page.
 */
export function useConversation(aiService: AiService, preferences: LinguisticPreferences) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string>()
  const [isGenerating, setIsGenerating] = useState(false)
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const preferencesRef = useRef(preferences)
  preferencesRef.current = preferences
  const controllerRef = useRef<AbortController>()

  useEffect(() => () => controllerRef.current?.abort(), [])

  const activeConversation = conversations.find((conversation) => conversation.id === activeId)

  const updateMessages = (conversationId: string, update: (messages: ChatMessage[]) => ChatMessage[]) => {
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? { ...conversation, messages: update(conversation.messages), updatedAt: new Date().toISOString() }
        : conversation
    )))
  }

  const updateMessage = (conversationId: string, messageId: string, update: (message: ChatMessage) => ChatMessage) => {
    updateMessages(conversationId, (messages) => messages.map((message) => (message.id === messageId ? update(message) : message)))
  }

  const run = async (conversationId: string, history: ChatMessage[]) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setIsGenerating(true)

    const replyId = createId('assistant')
    let hasReply = false
    try {
      for await (const chunk of aiService.generate({ messages: history, preferences: preferencesRef.current }, { signal: controller.signal })) {
        if (controller.signal.aborted) break
        if (!hasReply) {
          hasReply = true
          updateMessages(conversationId, (messages) => [...messages, {
            id: replyId,
            role: 'assistant',
            content: chunk.text,
            createdAt: new Date().toISOString(),
            language: chunk.language,
            status: 'streaming',
            isDemonstration: aiService.isDemonstration,
          }])
        } else {
          updateMessage(conversationId, replyId, (message) => ({ ...message, content: message.content + chunk.text }))
        }
      }
      if (hasReply) updateMessage(conversationId, replyId, (message) => ({ ...message, status: controller.signal.aborted ? 'stopped' : 'complete' }))
    } catch (error) {
      const errorMessage = error instanceof AiServiceError ? error.userMessage : undefined
      if (hasReply) {
        updateMessage(conversationId, replyId, (message) => (
          isAbortError(error) ? { ...message, status: 'stopped' } : { ...message, status: 'error', errorMessage }
        ))
      } else if (!isAbortError(error)) {
        updateMessages(conversationId, (messages) => [...messages, {
          id: replyId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          status: 'error',
          errorMessage,
          isDemonstration: aiService.isDemonstration,
        }])
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = undefined
        setIsGenerating(false)
      }
    }
  }

  const send = (content: string) => {
    const now = new Date().toISOString()
    const userMessage: ChatMessage = { id: createId('user'), role: 'user', content, createdAt: now }
    const existing = conversationsRef.current.find((conversation) => conversation.id === activeId)
    const conversationId = existing?.id ?? createId('conversation')
    const history = [...(existing?.messages ?? []), userMessage]

    if (existing) {
      updateMessages(conversationId, () => history)
    } else {
      setConversations((current) => [{ id: conversationId, title: createTitle(content), messages: history, createdAt: now, updatedAt: now }, ...current])
      setActiveId(conversationId)
    }
    void run(conversationId, history)
  }

  /** Relance la dernière demande en remplaçant la réponse qui la suit. */
  const regenerate = () => {
    if (!activeConversation) return
    const lastUserIndex = activeConversation.messages.findLastIndex((message) => message.role === 'user')
    if (lastUserIndex < 0) return
    const history = activeConversation.messages.slice(0, lastUserIndex + 1)
    updateMessages(activeConversation.id, () => history)
    void run(activeConversation.id, history)
  }

  const stop = () => {
    controllerRef.current?.abort()
  }

  const select = (conversationId: string) => {
    if (conversationId !== activeId) controllerRef.current?.abort()
    setActiveId(conversationId)
  }

  const startNew = () => {
    controllerRef.current?.abort()
    setActiveId(undefined)
  }

  const remove = (conversationId: string) => {
    if (conversationId === activeId) {
      controllerRef.current?.abort()
      setActiveId(undefined)
    }
    setConversations((current) => current.filter((conversation) => conversation.id !== conversationId))
  }

  const clearAll = () => {
    controllerRef.current?.abort()
    setActiveId(undefined)
    setConversations([])
  }

  const toggleFavorite = (conversationId: string) => {
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, favorite: !conversation.favorite } : conversation
    )))
  }

  /** Un second clic sur le même avis le retire. */
  const rate = (messageId: string, rating: MessageRating) => {
    if (!activeConversation) return
    updateMessage(activeConversation.id, messageId, (message) => ({ ...message, rating: message.rating === rating ? undefined : rating }))
  }

  const sortedConversations = [...conversations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    conversations: sortedConversations,
    activeConversation,
    messages: activeConversation?.messages ?? [],
    isGenerating,
    send,
    regenerate,
    stop,
    select,
    startNew,
    remove,
    clearAll,
    toggleFavorite,
    rate,
  }
}
