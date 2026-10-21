import { useEffect, useRef, useState } from 'react'
import { AiServiceError, type AiService } from '../domain/services'
import { clearStoredConversations, loadConversations, mergeConversations, saveConversations } from './conversationStorage'
import type { Attachment, ChatMessage, Conversation, LinguisticPreferences, MessageRating, ReplyVersion } from '../domain/types'
import { showReplyVersion, snapshotReply, versionsBeforeRegeneration } from './replyVersions'

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
 * Conversations alimentées par un AiService remplaçable. Si `preferences.saveConversations` est vrai,
 * elles sont enregistrées sur cet appareil (stockage du navigateur) ; sinon elles restent en mémoire.
 */
export function useConversation(aiService: AiService, preferences: LinguisticPreferences, { onStorageError }: { onStorageError?: () => void } = {}) {
  const [conversations, setConversations] = useState<Conversation[]>(() => (preferences.saveConversations ? loadConversations() : []))
  const [activeId, setActiveId] = useState<string>()
  const [isGenerating, setIsGenerating] = useState(false)
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const preferencesRef = useRef(preferences)
  preferencesRef.current = preferences
  const controllerRef = useRef<AbortController>()

  useEffect(() => () => controllerRef.current?.abort(), [])

  // Enregistrement différé : une réponse en cours de diffusion ne déclenche pas une écriture par fragment.
  const onStorageErrorRef = useRef(onStorageError)
  onStorageErrorRef.current = onStorageError
  useEffect(() => {
    if (!preferences.saveConversations) {
      clearStoredConversations()
      return
    }
    const timer = window.setTimeout(() => {
      if (!saveConversations(conversations)) onStorageErrorRef.current?.()
    }, 400)
    return () => window.clearTimeout(timer)
  }, [conversations, preferences.saveConversations])

  // À la fermeture de la page, l’enregistrement différé n’aurait pas le temps de partir.
  const saveEnabledRef = useRef(preferences.saveConversations)
  saveEnabledRef.current = preferences.saveConversations
  useEffect(() => {
    const flush = () => {
      if (saveEnabledRef.current) saveConversations(conversationsRef.current)
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

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

  /** `previousVersions` : versions précédentes de la réponse, quand elle est régénérée. */
  const run = async (conversationId: string, history: ChatMessage[], previousVersions: ReplyVersion[] = [], overrides: Partial<LinguisticPreferences> = {}) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setIsGenerating(true)

    const replyId = createId('assistant')
    // La nouvelle réponse devient la dernière version ; sa copie dans `versions` est rafraîchie au changement de version.
    const withVersions = (reply: ChatMessage): ChatMessage => (
      previousVersions.length > 0 ? { ...reply, versions: [...previousVersions, snapshotReply(reply)], versionIndex: previousVersions.length } : reply
    )
    let hasReply = false
    let completed = false
    try {
      for await (const chunk of aiService.generate({ messages: history, preferences: { ...preferencesRef.current, ...overrides } }, { signal: controller.signal })) {
        if (controller.signal.aborted) break
        if (chunk.sources || chunk.searchSuggestionsHtml) {
          updateMessage(conversationId, replyId, (message) => ({ ...message, sources: chunk.sources, searchSuggestionsHtml: chunk.searchSuggestionsHtml }))
          if (!chunk.text) continue
        }
        if (!hasReply) {
          hasReply = true
          updateMessages(conversationId, (messages) => [...messages, withVersions({
            id: replyId,
            role: 'assistant',
            content: chunk.text,
            createdAt: new Date().toISOString(),
            language: chunk.language,
            status: 'streaming',
            isDemonstration: aiService.isDemonstration,
          })])
        } else {
          updateMessage(conversationId, replyId, (message) => ({ ...message, content: message.content + chunk.text }))
        }
      }
      if (hasReply) updateMessage(conversationId, replyId, (message) => ({ ...message, status: controller.signal.aborted ? 'stopped' : 'complete' }))
      completed = hasReply && !controller.signal.aborted
    } catch (error) {
      const errorMessage = error instanceof AiServiceError ? error.userMessage : undefined
      const errorCode = error instanceof AiServiceError ? error.code : undefined
      if (hasReply) {
        updateMessage(conversationId, replyId, (message) => (
          isAbortError(error) ? { ...message, status: 'stopped' } : { ...message, status: 'error', errorMessage, ...(errorCode ? { errorCode } : {}) }
        ))
      } else if (!isAbortError(error)) {
        updateMessages(conversationId, (messages) => [...messages, withVersions({
          id: replyId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          status: 'error',
          errorMessage,
          ...(errorCode ? { errorCode } : {}),
          isDemonstration: aiService.isDemonstration,
        })])
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = undefined
        setIsGenerating(false)
      }
    }

    // Premier échange réussi : le moteur peut proposer un titre plus parlant que la première ligne.
    if (completed && history.length === 1 && history[0].content.trim() && aiService.suggestTitle) {
      const title = await aiService.suggestTitle(history[0].content).catch(() => null)
      if (title) setConversations((current) => current.map((conversation) => (conversation.id === conversationId ? { ...conversation, title } : conversation)))
    }
  }

  const send = (content: string, attachments: Attachment[] = []) => {
    const now = new Date().toISOString()
    const userMessage: ChatMessage = {
      id: createId('user'),
      role: 'user',
      content,
      createdAt: now,
      ...(attachments.length > 0 ? { attachments } : {}),
    }
    const existing = conversationsRef.current.find((conversation) => conversation.id === activeId)
    const conversationId = existing?.id ?? createId('conversation')
    const history = [...(existing?.messages ?? []), userMessage]

    if (existing) {
      updateMessages(conversationId, () => history)
    } else {
      setConversations((current) => [{ id: conversationId, title: createTitle(content.trim() ? content : attachments[0]?.name.replace(/\.[a-z0-9]{2,5}$/i, '') ?? 'Sans titre'), messages: history, createdAt: now, updatedAt: now }, ...current])
      setActiveId(conversationId)
    }
    void run(conversationId, history)
  }

  /** Remplace le dernier message de l’utilisateur et relance la réponse à partir de lui. */
  const editLastUserMessage = (content: string) => {
    if (!activeConversation) return
    const lastUserIndex = activeConversation.messages.findLastIndex((message) => message.role === 'user')
    if (lastUserIndex < 0) return
    const edited = { ...activeConversation.messages[lastUserIndex], content }
    const history = [...activeConversation.messages.slice(0, lastUserIndex), edited]
    updateMessages(activeConversation.id, () => history)
    void run(activeConversation.id, history)
  }

  /**
   * Relance la dernière demande ; la réponse précédente reste consultable comme version antérieure.
   * `overrides` : préférences à appliquer tout de suite (ex. modèle économe), avant leur prochain rendu.
   */
  const regenerate = (overrides?: Partial<LinguisticPreferences>) => {
    if (!activeConversation) return
    const lastUserIndex = activeConversation.messages.findLastIndex((message) => message.role === 'user')
    if (lastUserIndex < 0) return
    const history = activeConversation.messages.slice(0, lastUserIndex + 1)
    const previousVersions = versionsBeforeRegeneration(activeConversation.messages[lastUserIndex + 1])
    updateMessages(activeConversation.id, () => history)
    void run(activeConversation.id, history, previousVersions, overrides)
  }

  const selectVersion = (messageId: string, index: number) => {
    if (!activeConversation || isGenerating) return
    updateMessage(activeConversation.id, messageId, (message) => showReplyVersion(message, index))
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

  /** Restaure une sauvegarde ; renvoie le nombre de conversations ajoutées et mises à jour. */
  const importConversations = (imported: Conversation[]) => {
    const result = mergeConversations(conversations, imported)
    setConversations(result.conversations)
    return { added: result.added, updated: result.updated }
  }

  const rename = (conversationId: string, title: string) => {
    const trimmed = title.trim().slice(0, 80)
    if (!trimmed) return
    setConversations((current) => current.map((conversation) => (conversation.id === conversationId ? { ...conversation, title: trimmed } : conversation)))
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
    editLastUserMessage,
    regenerate,
    selectVersion,
    stop,
    select,
    startNew,
    remove,
    clearAll,
    importConversations,
    rename,
    toggleFavorite,
    rate,
  }
}
