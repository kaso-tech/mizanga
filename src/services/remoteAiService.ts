import { AiServiceError, type AiChunk, type AiService, type SourceReference } from '../domain/services'
import type { ChatMessage } from '../domain/types'
import type { AuthConfig } from './authService'
import { demoAiService } from './demoAiService'

/**
 * Heure de réinitialisation d’une limite, dans le fuseau de l’utilisateur, à la minute supérieure :
 * « à 14 h 32 », « demain à 9 h 00 » ou « le 22 octobre à 9 h 00 ».
 */
export function formatResetTime(retryAt: Date, now = new Date()) {
  const rounded = new Date(Math.ceil(retryAt.getTime() / 60_000) * 60_000)
  const time = `${rounded.getHours()} h ${String(rounded.getMinutes()).padStart(2, '0')}`
  const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (dayKey(rounded) === dayKey(now)) return `à ${time}`
  if (dayKey(rounded) === dayKey(tomorrow)) return `demain à ${time}`
  return `le ${rounded.toLocaleDateString('fr', { day: 'numeric', month: 'long' })} à ${time}`
}

/** Message d’erreur du serveur, complété par l’heure de réinitialisation quand une limite est atteinte. */
type ErrorBody = { error?: string; retryAt?: string; code?: string }

function errorFrom(body: ErrorBody | null, status?: number) {
  const retryAt = body?.retryAt ? new Date(body.retryAt) : undefined
  const message = body?.error ?? 'Le serveur de Gilli est injoignable. Vérifiez votre connexion et réessayez.'
  const code = body?.code === 'quota' ? 'quota' : undefined
  if (retryAt && !Number.isNaN(retryAt.getTime())) {
    return new AiServiceError(`${message} Elle sera réinitialisée ${formatResetTime(retryAt)}.`, retryAt, code)
  }
  return new AiServiceError(status === 429 ? `${message} Réessayez dans quelques minutes.` : message, undefined, code)
}

/** Plafonds alignés sur le serveur (server/chat-handler.mjs). */
export const MAX_MESSAGE_CHARS = 32_000
/** Longueur maximale des instructions personnelles (même limite côté serveur). */
export const MAX_CUSTOM_INSTRUCTIONS_CHARS = 1500
const MAX_HISTORY_MESSAGES = 40
const MAX_HISTORY_CHARS = 60_000
/** Contenu des fichiers renvoyé au moteur : ceux des échanges les plus récents, dans ce budget. */
const MAX_HISTORY_ATTACHMENT_BYTES = 8 * 1024 * 1024

/**
 * Garde les échanges les plus récents dans un budget de taille, pour préserver le quota gratuit
 * sur les longues conversations. L’historique envoyé commence toujours par un message de l’utilisateur.
 */
export function selectHistory(messages: ChatMessage[]) {
  const usable = messages.filter((message) => (message.content.trim() || message.attachments?.length) && message.status !== 'error')
  const selected: ChatMessage[] = []
  let total = 0
  for (let index = usable.length - 1; index >= 0; index--) {
    const message = usable[index]
    if (selected.length >= MAX_HISTORY_MESSAGES || (selected.length > 0 && total + message.content.length > MAX_HISTORY_CHARS)) break
    selected.unshift(message)
    total += message.content.length
  }
  while (selected.length > 1 && selected[0].role !== 'user') selected.shift()

  let attachmentBytes = 0
  const withFiles = selected.reverse().map(({ role, content, attachments = [] }) => {
    const sent = attachments.filter((attachment) => {
      if (!attachment.data || attachmentBytes + attachment.size > MAX_HISTORY_ATTACHMENT_BYTES) return false
      attachmentBytes += attachment.size
      return true
    })
    // Un fichier relu depuis l’historique n’a plus son contenu : le moteur en est informé par son nom.
    const missing = attachments.filter((attachment) => !sent.includes(attachment)).map((attachment) => `[Fichier joint non disponible : ${attachment.name}]`)
    return {
      role,
      content: [content, ...missing].filter(Boolean).join('\n'),
      ...(sent.length > 0 ? { attachments: sent.map(({ name, mimeType, data }) => ({ name, mimeType, data })) } : {}),
    }
  })
  return withFiles.reverse()
}

/**
 * Moteur distant : le serveur Gilli (/api/chat) relaie la demande vers le modèle configuré
 * (Gemini). La clé d’API reste sur le serveur ; le navigateur ne reçoit que le texte.
 * Réponse attendue : NDJSON, une ligne `{"text": …}` par fragment ou `{"error": …}`.
 */
export function createRemoteAiService({ label, offersLiteModel = false, endpoint = '/api/chat' }: { label: string; offersLiteModel?: boolean; endpoint?: string }): AiService {
  return {
    isDemonstration: false,
    label,
    offersLiteModel,
    async suggestTitle(firstMessage) {
      const response = await fetch('/api/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: firstMessage }),
      })
      if (!response.ok) return null
      const { title } = (await response.json()) as { title?: string | null }
      return typeof title === 'string' && title.trim() ? title.trim().slice(0, 60) : null
    },
    async *generate({ messages, preferences }, { signal }): AsyncGenerator<AiChunk> {
      let response: Response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: selectHistory(messages),
            modelTier: offersLiteModel ? preferences.modelTier : 'standard',
            preferences: { responseLanguage: preferences.responseLanguage, userWritingMode: preferences.userWritingMode, customInstructions: preferences.customInstructions },
          }),
          signal,
        })
      } catch (error) {
        if (signal.aborted) throw error
        // Réseau coupé ou serveur injoignable.
        throw new AiServiceError(navigator.onLine ? 'Le serveur de Gilli est injoignable. Réessayez dans un instant.' : 'Vous êtes hors connexion. Vérifiez votre réseau puis réessayez.')
      }
      if (!response.ok || !response.body) {
        throw errorFrom((await response.json().catch(() => null)) as ErrorBody | null, response.status)
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as ErrorBody & { text?: string; sources?: SourceReference[]; searchSuggestionsHtml?: string }
          if (event.error) throw errorFrom(event)
          // La langue réelle de la réponse n’est pas connue : elle n’est pas indiquée plutôt que devinée.
          if (event.text) yield { text: event.text }
          if (event.sources || event.searchSuggestionsHtml) yield { text: '', sources: event.sources ?? [], searchSuggestionsHtml: event.searchSuggestionsHtml }
        }
      }
    },
  }
}

/**
 * Choisit le moteur selon ce que le serveur annonce (/api/health). Sans serveur ou sans clé configurée
 * (site statique, test local), l’application reste en démonstration.
 */
const engineStorageKey = 'gilli.engine.v1'

type Health = { engine?: string; liteModel?: boolean; auth?: { supabaseUrl?: unknown; publishableKey?: unknown } }

const serviceFor = (health: Health) => (
  health.engine && health.engine !== 'demo'
    // Les noms techniques des modèles restent dans la console d’administration.
    ? createRemoteAiService({ label: health.engine === 'gemini' ? 'Gemini (Google)' : health.engine, offersLiteModel: health.liteModel === true })
    : demoAiService
)

/** Ce que le serveur annonce : le moteur d’IA et, si les comptes sont configurés, l’accès à Supabase Auth. */
export interface ServerSetup {
  aiService: AiService
  authConfig?: AuthConfig
}

const authConfigFrom = (health: Health): AuthConfig | undefined => {
  const auth = health.auth
  return auth && typeof auth.supabaseUrl === 'string' && /^https?:\/\//.test(auth.supabaseUrl) && typeof auth.publishableKey === 'string' && auth.publishableKey
    ? { supabaseUrl: auth.supabaseUrl, publishableKey: auth.publishableKey }
    : undefined
}

export async function detectServer({ timeoutMs = 2500 } = {}): Promise<ServerSetup> {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(timeoutMs) })
    const health = (await response.json()) as Health
    if (!response.ok) return { aiService: demoAiService }
    const authConfig = authConfigFrom(health)
    try {
      localStorage.setItem(engineStorageKey, JSON.stringify({ engine: health.engine, liteModel: health.liteModel === true, ...(authConfig ? { auth: authConfig } : {}) }))
    } catch {
      // Stockage indisponible : la détection se refera au prochain lancement.
    }
    return { aiService: serviceFor(health), authConfig }
  } catch {
    // Application installée lancée hors connexion : on garde le dernier moteur connu, l’interface
    // affichera « hors connexion » au lieu de basculer à tort en démonstration.
    if (!navigator.onLine) {
      try {
        const health = JSON.parse(localStorage.getItem(engineStorageKey) ?? '{}') as Health
        return { aiService: serviceFor(health), authConfig: authConfigFrom(health) }
      } catch {
        return { aiService: demoAiService }
      }
    }
    return { aiService: demoAiService }
  }
}

export async function detectAiService(options: { timeoutMs?: number } = {}): Promise<AiService> {
  return (await detectServer(options)).aiService
}
