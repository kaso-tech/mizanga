import { useEffect, useRef, useState } from 'react'
import type { AiService } from '../domain/services'
import type { ChatMessage, LinguisticPreferences } from '../domain/types'

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** État local d’une conversation, alimenté par un AiService remplaçable. Rien n’est persisté. */
export function useConversation(aiService: AiService, preferences: LinguisticPreferences) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const preferencesRef = useRef(preferences)
  preferencesRef.current = preferences
  const controllerRef = useRef<AbortController>()

  useEffect(() => () => controllerRef.current?.abort(), [])

  const updateMessage = (id: string, update: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) => current.map((message) => (message.id === id ? update(message) : message)))
  }

  const run = async (history: ChatMessage[], controller: AbortController) => {
    const replyId = createId('assistant')
    let hasReply = false
    try {
      for await (const chunk of aiService.generate({ messages: history, preferences: preferencesRef.current }, { signal: controller.signal })) {
        if (controller.signal.aborted) break
        if (!hasReply) {
          hasReply = true
          setMessages((current) => [...current, {
            id: replyId,
            role: 'assistant',
            content: chunk.text,
            createdAt: new Date().toISOString(),
            language: chunk.language,
            status: 'streaming',
            isDemonstration: aiService.isDemonstration,
          }])
        } else {
          updateMessage(replyId, (message) => ({ ...message, content: message.content + chunk.text }))
        }
      }
      if (hasReply) updateMessage(replyId, (message) => ({ ...message, status: controller.signal.aborted ? 'stopped' : 'complete' }))
    } catch (error) {
      if (hasReply) {
        updateMessage(replyId, (message) => ({ ...message, status: isAbortError(error) ? 'stopped' : 'error' }))
      } else if (!isAbortError(error)) {
        setMessages((current) => [...current, {
          id: replyId,
          role: 'assistant',
          content: 'La réponse n’a pas pu être produite. Vous pouvez réessayer.',
          createdAt: new Date().toISOString(),
          language: 'fr',
          status: 'error',
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
    controllerRef.current?.abort()
    const userMessage: ChatMessage = {
      id: createId('user'),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    const history = [...messagesRef.current, userMessage]
    setMessages(history)
    setIsGenerating(true)
    const controller = new AbortController()
    controllerRef.current = controller
    void run(history, controller)
  }

  const stop = () => {
    controllerRef.current?.abort()
  }

  const reset = () => {
    controllerRef.current?.abort()
    setMessages([])
  }

  return { messages, isGenerating, send, stop, reset }
}
