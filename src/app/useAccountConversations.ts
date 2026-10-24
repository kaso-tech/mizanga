import { useCallback, useEffect, useRef, useState } from 'react'
import type { Conversation, ConversationSummary } from '../domain/types'
import type { ConversationsApi, StoredConversation } from '../services/conversationsApi'
import { parseConversations, withoutFileContents } from './conversationStorage'

/** Conversation du compte relue avec les mêmes contrôles qu’un enregistrement de l’appareil. */
function readStored(stored: StoredConversation): Conversation | null {
  return parseConversations([{ ...stored, title: stored.title ?? undefined }])[0] ?? null
}

const toUpload = (conversation: Conversation) => ({
  id: conversation.id,
  kind: 'general' as const,
  businessId: null,
  title: conversation.title ?? null,
  favorite: Boolean(conversation.favorite),
  messages: withoutFileContents([conversation])[0].messages,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
})

type ApplyAccountSync = (change: { accountId?: string; pulled?: Conversation[]; markIds?: string[]; dropIds?: string[] }) => void

/**
 * Conversations enregistrées sur le compte. Celles du chatbot généraliste restent sur l’appareil et sont
 * copiées sur le compte une fois connecté (si l’enregistrement des conversations est activé) : à la
 * connexion, les deux côtés sont réunis (la version la plus récente l’emporte), puis chaque modification
 * est envoyée. À la déconnexion, les conversations du compte quittent l’appareil (elles restent sur le
 * compte). Les conversations des assistants Business sont seulement sur le compte : elles sont listées ici.
 */
export function useAccountConversations({ api, userId, isSignedOut, saveEnabled, conversations, isGenerating, applyAccountSync }: {
  api: ConversationsApi | null
  userId: string | null
  isSignedOut: boolean
  saveEnabled: boolean
  conversations: Conversation[]
  isGenerating: boolean
  applyAccountSync: ApplyAccountSync
}) {
  const [businessConversations, setBusinessConversations] = useState<ConversationSummary[]>([])
  const [readyFor, setReadyFor] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  /** Date de modification de chaque conversation telle qu’elle est sur le compte. */
  const syncedRef = useRef(new Map<string, string>())
  const pendingDeletesRef = useRef(new Set<string>())
  const busyRef = useRef(false)
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const applyRef = useRef(applyAccountSync)
  applyRef.current = applyAccountSync

  // Déconnecté : les conversations du compte ne restent pas sur l’appareil.
  useEffect(() => {
    if (!isSignedOut) return
    setBusinessConversations([])
    setReadyFor(null)
    syncedRef.current = new Map()
    pendingDeletesRef.current = new Set()
    const dropIds = conversationsRef.current.filter((conversation) => conversation.accountId).map((conversation) => conversation.id)
    if (dropIds.length > 0) applyRef.current({ dropIds })
  }, [isSignedOut])

  // Hors connexion au moment de la connexion : nouvel essai au retour du réseau.
  useEffect(() => {
    const onOnline = () => setRetry((value) => value + 1)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  // Connexion : réunit les conversations de l’appareil et celles du compte.
  useEffect(() => {
    if (!api || !userId) return
    let cancelled = false
    void (async () => {
      const remote = await api.list()
      if (cancelled) return
      // Seules les conversations des assistants encore proposés sont listées (les anciens onglets Élevage et Agriculture ont été retirés).
      setBusinessConversations(remote.filter((summary) => summary.kind === 'commerce'))
      if (!saveEnabled) return
      const remoteGeneral = new Map(remote.filter((summary) => summary.kind === 'general').map((summary) => [summary.id, summary]))
      const local = new Map(conversationsRef.current.map((conversation) => [conversation.id, conversation]))
      // Conversation d’un autre compte, ou supprimée du compte depuis un autre appareil.
      const dropIds = [...local.values()].filter((conversation) => conversation.accountId && (conversation.accountId !== userId || !remoteGeneral.has(conversation.id))).map((conversation) => conversation.id)
      const synced = new Map<string, string>()
      const pulled: Conversation[] = []
      const markIds: string[] = []
      for (const summary of remoteGeneral.values()) {
        const existing = local.get(summary.id)
        if (existing && existing.updatedAt === summary.updatedAt) {
          markIds.push(summary.id)
          synced.set(summary.id, summary.updatedAt)
        } else if (!existing || summary.updatedAt > existing.updatedAt) {
          const conversation = readStored(await api.get(summary.id))
          if (cancelled) return
          if (conversation) {
            pulled.push(conversation)
            synced.set(summary.id, conversation.updatedAt)
          }
        }
      }
      syncedRef.current = synced
      applyRef.current({ accountId: userId, pulled, markIds, dropIds })
      setReadyFor(userId)
    })().catch(() => undefined)
    return () => { cancelled = true }
  }, [api, userId, saveEnabled, retry])

  // Ensuite, chaque modification (réponse terminée, renommage, suppression) est envoyée au compte.
  useEffect(() => {
    if (!api || !userId || readyFor !== userId || !saveEnabled || isGenerating) return
    const timer = window.setTimeout(() => {
      if (busyRef.current) return
      busyRef.current = true
      void (async () => {
        const current = conversationsRef.current
        const synced = syncedRef.current
        const ids = new Set(current.map((conversation) => conversation.id))
        for (const id of synced.keys()) {
          if (!ids.has(id)) {
            synced.delete(id)
            pendingDeletesRef.current.add(id)
          }
        }
        for (const id of [...pendingDeletesRef.current]) {
          await api.remove(id)
          pendingDeletesRef.current.delete(id)
        }
        const markIds: string[] = []
        const pulled: Conversation[] = []
        for (const conversation of current) {
          if (synced.get(conversation.id) === conversation.updatedAt || conversation.messages.length === 0) continue
          if (conversation.accountId && conversation.accountId !== userId) continue
          const result = await api.save(toUpload(conversation))
          if ('newer' in result) {
            const newer = readStored(result.newer)
            if (newer) pulled.push(newer)
            synced.set(conversation.id, result.newer.updatedAt)
          } else {
            synced.set(conversation.id, conversation.updatedAt)
            markIds.push(conversation.id)
          }
        }
        if (markIds.length > 0 || pulled.length > 0) applyRef.current({ accountId: userId, markIds, pulled })
      })()
        // Réseau ou serveur indisponible : la prochaine modification relancera l’envoi.
        .catch(() => undefined)
        .finally(() => { busyRef.current = false })
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [api, userId, readyFor, saveEnabled, isGenerating, conversations])

  /** Conversation d’assistant enregistrée ou mise à jour depuis l’Espace Business. */
  const upsertBusinessConversation = useCallback((summary: ConversationSummary) => {
    setBusinessConversations((current) => [summary, ...current.filter((item) => item.id !== summary.id)])
  }, [])

  const updateBusinessConversation = async (id: string, changes: { title?: string; favorite?: boolean }) => {
    if (!api) return
    setBusinessConversations((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
    try {
      upsertBusinessConversation(await api.update(id, changes))
    } catch (error) {
      setBusinessConversations(await api.list().then((all) => all.filter((summary) => summary.kind === 'commerce')).catch(() => businessConversations))
      throw error
    }
  }

  const removeBusinessConversation = async (id: string) => {
    if (!api) return
    await api.remove(id)
    setBusinessConversations((current) => current.filter((item) => item.id !== id))
  }

  return { businessConversations, upsertBusinessConversation, updateBusinessConversation, removeBusinessConversation }
}
