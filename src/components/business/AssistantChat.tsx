import { RotateCcw, Sparkles } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { isImage, prepareAttachments } from '../../app/attachments'
import { parseMessages } from '../../app/conversationStorage'
import type { Attachment, ChatMessage as ChatMessageType, ConversationKind, ConversationSummary } from '../../domain/types'
import { BusinessApiError, type AiQuota, type AssistantMessage, type AssistantStreamEvent, type Business } from '../../services/businessApi'
import type { ConversationsApi, StoredConversation } from '../../services/conversationsApi'
import { BrandMark } from '../Brand'
import { ChatMessage } from '../ChatMessage'
import { Composer } from '../Composer'
import type { ProposalStatus } from './ProposalCard'

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp'

interface ProposalState<Proposal> {
  proposal: Proposal
  status: ProposalStatus
  result?: string
}

/**
 * Ce qui distingue un assistant de l’Espace Business (Commerce…) : ses adresses, ses textes,
 * ses fiches et l’affichage des chiffres qu’il a reçus.
 */
export interface AssistantAdapter<Context, Proposal extends { id: string }> {
  quota: () => Promise<AiQuota>
  ask: (messages: AssistantMessage[], onEvent: (event: AssistantStreamEvent<Context, Proposal>) => void, signal: AbortSignal) => Promise<void>
  suggestions: string[]
  heading: string
  intro: string
  placeholder: string
  /** Qui confirme les fiches (« le commerçant », « l’éleveur »). */
  confirmer: string
  /** Nom court d’une fiche, pour la suite de la conversation. */
  describe: (proposal: Proposal) => string
  renderProposal: (props: { proposal: Proposal; status: ProposalStatus; result?: string; onDismiss: () => void; onConfirm: (save: () => Promise<string>) => Promise<void> }) => ReactNode
  renderContext: (context: Context) => ReactNode
}

/** Résumé d’une fiche pour la suite de la conversation (le modèle sait ce qui a été confirmé). */
function describeProposal<Proposal>({ proposal, status }: ProposalState<Proposal>, describe: (proposal: Proposal) => string, confirmer: string) {
  const outcome = status === 'done' ? `confirmée et enregistrée par ${confirmer}` : status === 'dismissed' ? `ignorée par ${confirmer}` : 'pas encore confirmée'
  return `[Fiche ${describe(proposal)} : ${outcome}]`
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)

const proposalStatuses: ProposalStatus[] = ['pending', 'done', 'dismissed']

/** Demande d’ouverture venue du menu latéral : une conversation enregistrée, ou une nouvelle (id null). */
export interface OpenRequest {
  id: string | null
  nonce: number
}

/** Titre d’une conversation d’assistant : sa première question. */
function titleOf(messages: ChatMessageType[]) {
  const first = messages.find((message) => message.role === 'user')
  const line = first?.content.trim().split(/\r?\n/)[0] ?? ''
  if (!line) return first?.attachments?.length ? 'Photo de produit' : 'Conversation'
  return line.length > 48 ? `${line.slice(0, 47).trimEnd()}…` : line
}

/**
 * Messages enregistrés sur le compte : ceux du chat, avec leurs fiches (une fiche en cours
 * d’enregistrement redevient « à vérifier ») et les chiffres transmis à l’assistant.
 */
function toStoredMessages<Context, Proposal>(messages: ChatMessageType[], proposals: Record<string, ProposalState<Proposal>[]>, contexts: Record<string, Context>) {
  return messages.map((message) => ({
    ...message,
    ...(message.attachments ? { attachments: message.attachments.map(({ data: _data, ...meta }) => meta) } : {}),
    ...(proposals[message.id] ? { proposals: proposals[message.id].map((state) => ({ ...state, status: state.status === 'saving' ? 'pending' : state.status })) } : {}),
    ...(contexts[message.id] ? { context: contexts[message.id] } : {}),
  }))
}

function fromStored<Context, Proposal>(stored: StoredConversation) {
  const messages = parseMessages(stored.messages)
  const proposals: Record<string, ProposalState<Proposal>[]> = {}
  const contexts: Record<string, Context> = {}
  for (const raw of stored.messages as Array<{ id?: unknown; proposals?: unknown; context?: unknown }>) {
    if (typeof raw?.id !== 'string') continue
    if (Array.isArray(raw.proposals)) {
      proposals[raw.id] = raw.proposals.filter((state: Partial<ProposalState<{ id?: unknown; action?: unknown; values?: unknown }>> | null) => (
        typeof state?.proposal?.id === 'string' && typeof state.proposal.action === 'string' && typeof state.proposal.values === 'object' && proposalStatuses.includes(state.status as ProposalStatus)
      )) as ProposalState<Proposal>[]
    }
    if (raw.context && typeof raw.context === 'object') contexts[raw.id] = raw.context as Context
  }
  return { messages, proposals, contexts }
}

/**
 * Assistant de l’Espace Business, présenté comme le chatbot de Gilli (mêmes messages, même zone de saisie,
 * mêmes actions) mais répondant à partir des chiffres de l’entreprise. Avec `conversations`, la
 * conversation est enregistrée sur le compte (avec ses fiches) et retrouvée depuis le menu latéral ;
 * chaque question compte dans la limite du jour.
 */
export function AssistantChat<Context, Proposal extends { id: string }>({ adapter, business, onDataChanged, onNotify, conversations = null, kind = 'commerce', openRequest, onConversationSaved, onConversationOpened }: {
  adapter: AssistantAdapter<Context, Proposal>
  business: Business
  /** Appelé après un enregistrement confirmé (les données de l’entreprise ont changé). */
  onDataChanged: () => Promise<void>
  onNotify: (message: string, tone?: 'success' | 'info') => void
  conversations?: ConversationsApi | null
  kind?: Exclude<ConversationKind, 'general'>
  openRequest?: OpenRequest
  onConversationSaved?: (summary: ConversationSummary) => void
  /** Conversation affichée (null : nouvelle conversation pas encore enregistrée). */
  onConversationOpened?: (id: string | null) => void
}) {
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [contexts, setContexts] = useState<Record<string, Context>>({})
  const [proposals, setProposals] = useState<Record<string, ProposalState<Proposal>[]>>({})
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter
  const [draft, setDraft] = useState('')
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([])
  const [isPreparingFiles, setIsPreparingFiles] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const [quota, setQuota] = useState<AiQuota | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string>()
  const controllerRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  // Conversation enregistrée : identifiant, date de création, titre déjà envoyé, dernier contenu enregistré.
  const savedRef = useRef<{ id: string | null; createdAt: string; titleSent: boolean; snapshot: string }>({ id: null, createdAt: '', titleSent: false, snapshot: '' })
  const callbacksRef = useRef({ onConversationSaved, onConversationOpened, onNotify })
  callbacksRef.current = { onConversationSaved, onConversationOpened, onNotify }

  /** Change à chaque conversation affichée : une réponse en retard n’atterrit pas dans une autre. */
  const displayRef = useRef(0)
  const show = useCallback((next: { messages: ChatMessageType[]; proposals: Record<string, ProposalState<Proposal>[]>; contexts: Record<string, Context> }) => {
    displayRef.current += 1
    setMessages(next.messages)
    setProposals(next.proposals)
    setContexts(next.contexts)
  }, [])

  // Ouverture depuis le menu latéral.
  const openNonce = openRequest?.nonce
  const openId = openRequest?.id
  useEffect(() => {
    if (openNonce === undefined) return
    controllerRef.current?.abort()
    if (!openId || !conversations) {
      savedRef.current = { id: null, createdAt: '', titleSent: false, snapshot: '' }
      show({ messages: [], proposals: {}, contexts: {} })
      return
    }
    if (openId === savedRef.current.id) return
    let cancelled = false
    setIsLoading(true)
    conversations.get(openId)
      .then((stored) => {
        if (cancelled) return
        const loaded = fromStored<Context, Proposal>(stored)
        savedRef.current = { id: stored.id, createdAt: stored.createdAt, titleSent: true, snapshot: JSON.stringify(toStoredMessages(loaded.messages, loaded.proposals, loaded.contexts)) }
        show(loaded)
        callbacksRef.current.onConversationOpened?.(stored.id)
      })
      .catch((caught: unknown) => { if (!cancelled) callbacksRef.current.onNotify(caught instanceof BusinessApiError ? caught.userMessage : 'La conversation n’a pas pu être ouverte.') })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [openNonce, openId, conversations, show])

  // Enregistrement sur le compte, une fois la réponse terminée (et à chaque fiche confirmée ou ignorée).
  useEffect(() => {
    if (!conversations || isGenerating || isLoading || messages.length === 0) return
    const stored = toStoredMessages(messages, proposals, contexts)
    const snapshot = JSON.stringify(stored)
    if (snapshot === savedRef.current.snapshot) return
    const timer = window.setTimeout(() => {
      const saved = savedRef.current
      if (!saved.id) savedRef.current = { ...saved, id: `${kind}-${newId()}`, createdAt: new Date().toISOString() }
      const { id, createdAt, titleSent } = savedRef.current
      if (!id) return
      conversations.save({ id, kind, businessId: business.id, ...(titleSent ? {} : { title: titleOf(messages) }), messages: stored, createdAt, updatedAt: new Date().toISOString() })
        .then((result) => {
          if (savedRef.current.id !== id) return
          if ('newer' in result) {
            // Modifiée entre-temps sur un autre appareil : la version la plus récente est affichée.
            const loaded = fromStored<Context, Proposal>(result.newer)
            savedRef.current = { ...savedRef.current, titleSent: true, snapshot: JSON.stringify(toStoredMessages(loaded.messages, loaded.proposals, loaded.contexts)) }
            show(loaded)
            return
          }
          savedRef.current = { ...savedRef.current, titleSent: true, snapshot }
          callbacksRef.current.onConversationSaved?.(result.saved)
          callbacksRef.current.onConversationOpened?.(id)
        })
        .catch(() => undefined)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [conversations, kind, business.id, messages, proposals, contexts, isGenerating, isLoading, show])

  useEffect(() => {
    adapterRef.current.quota().then(setQuota).catch(() => setQuota(null))
    return () => controllerRef.current?.abort()
  }, [business.id])

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [messages])

  const remaining = quota ? Math.max(quota.limit - quota.used, 0) : null
  const lastMessage = messages.at(-1)
  const lastUserMessage = messages.findLast((message) => message.role === 'user')

  /** Envoie la conversation `history` (terminée par une question) et diffuse la réponse. */
  const run = async (history: ChatMessageType[]) => {
    setMessages(history)
    setIsGenerating(true)
    const controller = new AbortController()
    controllerRef.current = controller
    const answerId = newId()
    const display = displayRef.current
    let context: Context | undefined
    let hasProposals = false
    /** Crée la réponse au premier fragment, puis la met à jour. */
    const updateAnswer = (change: (answer: ChatMessageType) => ChatMessageType) => displayRef.current === display && setMessages((current) => {
      const existing = current.find((message) => message.id === answerId)
      const base: ChatMessageType = existing ?? { id: answerId, role: 'assistant', content: '', createdAt: new Date().toISOString(), status: 'streaming' }
      const updated = change(base)
      return existing ? current.map((message) => (message.id === answerId ? updated : message)) : [...current, updated]
    })
    try {
      const sent = history.slice(-20).map((message, index, all): AssistantMessage => ({
        role: message.role,
        content: [message.content, ...(proposals[message.id] ?? []).map((state) => describeProposal(state, adapter.describe, adapter.confirmer))].filter(Boolean).join('\n\n'),
        // Seules les photos de la question posée partent au serveur.
        ...(index === all.length - 1 && message.attachments?.length ? { attachments: message.attachments.map(({ name, mimeType, data }) => ({ name, mimeType, data: data ?? '' })) } : {}),
      }))
      await adapter.ask(sent, (event) => {
        if ('context' in event) {
          context = event.context
          setQuota(event.quota)
        } else if ('text' in event) {
          updateAnswer((answer) => ({ ...answer, content: answer.content + event.text }))
        } else if ('proposals' in event) {
          hasProposals = true
          updateAnswer((answer) => answer)
          if (displayRef.current === display) setProposals((current) => ({ ...current, [answerId]: event.proposals.map((proposal) => ({ proposal, status: 'pending' })) }))
        } else {
          setQuota(event.quota)
        }
      }, controller.signal)
      // Fiches sans texte : une phrase d’accompagnement plutôt qu’une réponse vide.
      updateAnswer((answer) => ({ ...answer, status: 'complete', content: answer.content || (hasProposals ? 'Voici la fiche à vérifier avant l’enregistrement.' : '') }))
      if (context !== undefined && displayRef.current === display) setContexts((current) => ({ ...current, [answerId]: context as Context }))
    } catch (caught) {
      if (controller.signal.aborted) {
        updateAnswer((answer) => ({ ...answer, status: 'stopped' }))
      } else {
        const errorMessage = caught instanceof BusinessApiError ? caught.userMessage : 'L’assistant n’a pas pu répondre. Réessayez.'
        updateAnswer((answer) => ({ ...answer, status: 'error', errorMessage }))
      }
      adapter.quota().then(setQuota).catch(() => undefined)
    } finally {
      setIsGenerating(false)
      controllerRef.current = null
    }
  }

  const ask = (text: string) => {
    const content = text.trim()
    if ((!content && draftAttachments.length === 0) || isGenerating) return
    const attachments = draftAttachments
    setDraft('')
    setDraftAttachments([])
    void run([...messages, { id: newId(), role: 'user', content, createdAt: new Date().toISOString(), ...(attachments.length ? { attachments } : {}) }])
  }

  const addFiles = async (files: File[]) => {
    const photos = files.filter((file) => PHOTO_TYPES.split(',').includes(file.type === 'image/jpg' ? 'image/jpeg' : file.type))
    if (photos.length < files.length) onNotify('L’assistant Business lit seulement les photos (JPEG, PNG, WebP).')
    if (photos.length === 0) return
    setIsPreparingFiles(true)
    try {
      const { attachments, problems } = await prepareAttachments(photos, draftAttachments)
      setDraftAttachments((current) => [...current, ...attachments.filter(isImage)].slice(0, 3))
      if (problems.length > 0) onNotify(problems.join(' '))
    } catch {
      onNotify('La photo n’a pas pu être lue. Essayez une autre image.')
    } finally {
      setIsPreparingFiles(false)
    }
  }

  /** Met à jour une fiche ; une erreur d’enregistrement la remet « à vérifier » (message dans la fiche). */
  const setProposalState = (answerId: string, proposalId: string, change: Partial<ProposalState<Proposal>>) => setProposals((current) => ({
    ...current,
    [answerId]: (current[answerId] ?? []).map((state) => (state.proposal.id === proposalId ? { ...state, ...change } : state)),
  }))
  const confirm = async (answerId: string, proposalId: string, save: () => Promise<string>) => {
    setProposalState(answerId, proposalId, { status: 'saving' })
    try {
      const result = await save()
      setProposalState(answerId, proposalId, { status: 'done', result })
      onNotify(result, 'success')
      await onDataChanged().catch(() => onNotify('La liste des produits n’a pas pu être actualisée. Rechargez la page.'))
    } catch (error) {
      setProposalState(answerId, proposalId, { status: 'pending' })
      throw error
    }
  }

  /** Repose la dernière question (la réponse précédente est remplacée). */
  const regenerate = () => {
    const index = messages.findLastIndex((message) => message.role === 'user')
    if (index >= 0 && !isGenerating) void run(messages.slice(0, index + 1))
  }

  const editLastMessage = (content: string) => {
    const index = messages.findLastIndex((message) => message.role === 'user')
    if (index < 0 || isGenerating || !content.trim()) return
    void run([...messages.slice(0, index), { ...messages[index], content: content.trim() }])
  }

  const copy = async (message: ChatMessageType) => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
      window.setTimeout(() => setCopiedMessageId(undefined), 2000)
    } catch {
      // Copie refusée par le navigateur : rien à faire.
    }
  }

  const reset = () => {
    savedRef.current = { id: null, createdAt: '', titleSent: false, snapshot: '' }
    show({ messages: [], proposals: {}, contexts: {} })
    onConversationOpened?.(null)
    setFocusToken((token) => token + 1)
  }

  const isWaiting = isGenerating && lastMessage?.role === 'user'

  return (
    <section aria-label="Assistant" className="assistant-panel">
      {isLoading ? (
        <div className="page-loading" aria-busy="true" />
      ) : messages.length === 0 ? (
        <div className="welcome assistant-welcome">
          <div className="welcome-head fade-up">
            <div className="weave-band welcome-band" aria-hidden="true" />
            <h2>{adapter.heading}</h2>
            <p className="assistant-intro">{adapter.intro}</p>
          </div>
          <div className="saved-prompt-row" aria-label="Exemples de questions">
            {adapter.suggestions.map((suggestion) => (
              <button key={suggestion} type="button" className="saved-prompt-chip" onClick={() => ask(suggestion)} disabled={isGenerating || remaining === 0}>
                <Sparkles size={14} aria-hidden="true" />
                <span>{suggestion}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="messages-list" aria-label="Conversation avec l’assistant">
          {messages.map((message) => (
            <div key={message.id} className="assistant-message">
              <ChatMessage
                message={message}
                copiedMessageId={copiedMessageId}
                canRegenerate={message === lastMessage && !isGenerating}
                canEdit={message === lastUserMessage && !isGenerating}
                onEdit={editLastMessage}
                onCopy={(copied) => void copy(copied)}
                onRegenerate={regenerate}
              />
              {(proposals[message.id] ?? []).map((state) => (
                <Fragment key={state.proposal.id}>
                  {adapter.renderProposal({
                    proposal: state.proposal,
                    status: state.status,
                    result: state.result,
                    onDismiss: () => setProposalState(message.id, state.proposal.id, { status: 'dismissed' }),
                    onConfirm: (save) => confirm(message.id, state.proposal.id, save),
                  })}
                </Fragment>
              ))}
              {contexts[message.id] !== undefined && adapter.renderContext(contexts[message.id])}
            </div>
          ))}
          {isWaiting && (
            <div className="message-row is-assistant fade-up" aria-live="polite">
              <BrandMark />
              <span className="typing-dots" aria-hidden="true"><span /><span /><span /></span>
              <span className="visually-hidden">L’assistant rédige sa réponse…</span>
            </div>
          )}
          {!isGenerating && (
            <div className="restart-row">
              <button type="button" className="restart-button" onClick={reset}>
                <RotateCcw size={14} aria-hidden="true" /> Nouvelle conversation
              </button>
            </div>
          )}
        </div>
      )}
      <div ref={endRef} aria-hidden="true" />

      <div className="assistant-composer-zone">
        {remaining !== null && quota && (
          <p className="assistant-quota">{remaining} question{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''} aujourd’hui (sur {quota.limit}) · {conversations ? 'conversation enregistrée sur votre compte' : 'conversation non enregistrée'}</p>
        )}
        <Composer
          value={draft}
          isGenerating={isGenerating}
          isDemonstration={false}
          stopLabel="Arrêter la réponse"
          focusToken={focusToken}
          attachments={draftAttachments}
          isPreparingFiles={isPreparingFiles}
          onAddFiles={(files) => void addFiles(files)}
          onRemoveAttachment={(id) => setDraftAttachments((current) => current.filter((attachment) => attachment.id !== id))}
          onValueChange={setDraft}
          onSend={ask}
          onStop={() => controllerRef.current?.abort()}
          onNotify={onNotify}
          allowVoice={false}
          accept={PHOTO_TYPES}
          attachLabel="Joindre une photo de produit"
          placeholder={remaining === 0 ? 'Limite du jour atteinte : revenez demain.' : adapter.placeholder}
          label="Votre question"
        />
      </div>
    </section>
  )
}
