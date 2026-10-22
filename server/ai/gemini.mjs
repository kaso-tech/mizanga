// Fournisseur Gemini (API REST, réponse en flux SSE). Exécuté uniquement côté serveur :
// la clé d’API ne doit jamais atteindre le navigateur.

import { UpstreamError } from './errors.mjs'
import { buildSystemInstruction } from './system-instruction.mjs'

const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** Les quotas journaliers de l’API Gemini sont remis à zéro à minuit, heure du Pacifique. */
const QUOTA_TIME_ZONE = 'America/Los_Angeles'

/**
 * Écart (ms) entre l’heure murale d’un fuseau et l’UTC, à un instant donné.
 * @param {Date} date @param {string} timeZone
 */
function timeZoneOffset(date, timeZone) {
  /** @type {Record<string, number>} */
  const parts = {}
  for (const { type, value } of new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(date)) {
    if (type !== 'literal') parts[type] = Number(value)
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(date.getTime() / 1000) * 1000
}

/**
 * Prochain minuit dans un fuseau horaire, en tenant compte du changement d’heure.
 * @param {Date} now @param {string} [timeZone]
 */
export function nextMidnight(now, timeZone = QUOTA_TIME_ZONE) {
  const local = new Date(now.getTime() + timeZoneOffset(now, timeZone))
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1)
  const guess = new Date(midnightAsUtc - timeZoneOffset(now, timeZone))
  return new Date(midnightAsUtc - timeZoneOffset(guess, timeZone))
}

/**
 * Lit, dans une erreur 429 de Gemini, quand la limite sera réinitialisée : minuit (heure du Pacifique)
 * pour un quota journalier, sinon le délai indiqué (RetryInfo ou en-tête Retry-After).
 * @param {unknown} body @param {string | null} retryAfterHeader @param {Date} [now]
 * @returns {Date | undefined}
 */
export function quotaResetTime(body, retryAfterHeader, now = new Date()) {
  /** @type {Array<{ '@type'?: string, retryDelay?: string, violations?: Array<{ quotaId?: string, quotaMetric?: string }> }>} */
  const details = /** @type {any} */ (body)?.error?.details ?? []
  const isDaily = details.some((detail) => detail.violations?.some((violation) => /PerDay/i.test(`${violation.quotaId ?? ''} ${violation.quotaMetric ?? ''}`)))
  if (isDaily) return nextMidnight(now)
  const delay = details.find((detail) => typeof detail.retryDelay === 'string')?.retryDelay
  const seconds = delay ? Number.parseFloat(delay) : Number.parseFloat(retryAfterHeader ?? '')
  if (Number.isFinite(seconds) && seconds >= 0) return new Date(now.getTime() + Math.ceil(seconds) * 1000)
  return undefined
}

/**
 * @typedef {{ name: string, mimeType: string, data: string }} ChatAttachment
 * @typedef {{ role: 'user' | 'assistant', content: string, attachments?: ChatAttachment[] }} RelayMessage
 */

/**
 * Transforme l’historique en contenus Gemini (« model » pour les réponses de l’assistant).
 * Les fichiers joints deviennent des parties `inlineData`, placées avant le texte du message.
 * @param {RelayMessage[]} messages
 */
export function toGeminiContents(messages) {
  return messages
    .filter((message) => message.content.trim().length > 0 || (message.attachments?.length ?? 0) > 0)
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [
        ...(message.attachments ?? []).map((attachment) => ({ inlineData: { mimeType: attachment.mimeType, data: attachment.data } })),
        ...(message.content.trim() ? [{ text: message.content }] : []),
      ],
    }))
}

/**
 * Détail technique d’un refus de Gemini : limites dépassées (quotaId ou quotaMetric) et message de Google.
 * @param {unknown} body @param {string} model @param {number} httpStatus
 * @returns {import('./errors.mjs').EngineDiagnostic}
 */
export function readDiagnostic(body, model, httpStatus) {
  /** @type {Array<{ violations?: Array<{ quotaId?: string, quotaMetric?: string, quotaValue?: string }> }>} */
  const details = /** @type {any} */ (body)?.error?.details ?? []
  const quotas = details.flatMap((detail) => detail.violations ?? []).map((violation) => [violation.quotaId ?? violation.quotaMetric ?? '', violation.quotaValue ? `(limite ${violation.quotaValue})` : ''].join(' ').trim()).filter(Boolean)
  const message = String(/** @type {any} */ (body)?.error?.message ?? '').slice(0, 500)
  return { model, httpStatus, quotas: [...new Set(quotas)], message }
}

/** @param {Response} response @param {string} model */
async function errorForResponse(response, model) {
  const body = await response.json().catch(() => null)
  const diagnostic = readDiagnostic(body, model, response.status)
  if (response.status !== 429) {
    const error = errorForStatus(response.status)
    error.diagnostic = diagnostic
    return error
  }
  return new UpstreamError('La limite d’utilisation gratuite du moteur est atteinte.', 429, quotaResetTime(body, response.headers.get('retry-after')), diagnostic)
}

/** @param {number} status */
function errorForStatus(status) {
  if (status === 429) return new UpstreamError('La limite d’utilisation gratuite du moteur est atteinte.', 429)
  if (status === 400) return new UpstreamError('Le moteur a refusé la demande (fichier illisible, format ou paramètres invalides).', 502)
  if (status === 404) return new UpstreamError('Le moteur a refusé la demande (modèle introuvable).', 502)
  if (status === 401 || status === 403) return new UpstreamError('Le moteur n’est pas correctement configuré (clé d’API refusée).', 502)
  if (status === 503) return new UpstreamError('Le moteur est momentanément indisponible. Réessayez plus tard.', 503)
  return new UpstreamError('Le moteur est momentanément indisponible. Réessayez plus tard.', 502)
}

/**
 * @typedef {{ title: string, url: string }} WebSource
 * @typedef {{ inputTokens: number, outputTokens: number }} TokenUsage
 * @typedef {{ name: string, args: Record<string, unknown> }} FunctionCall
 * @typedef {{ name: string, description: string, parameters: Record<string, unknown> }} FunctionDeclaration
 * @typedef {{ text: string } | { sources: WebSource[], searchSuggestionsHtml?: string } | { usage: TokenUsage } | { functionCall: FunctionCall }} ReplyEvent
 */

/**
 * Sources web d’une réponse ancrée dans la recherche Google (titres et liens), sans doublons.
 * @param {any} metadata
 * @returns {WebSource[]}
 */
export function readGroundingSources(metadata) {
  /** @type {WebSource[]} */
  const sources = []
  for (const chunk of metadata?.groundingChunks ?? []) {
    const url = chunk?.web?.uri
    if (typeof url !== 'string' || !/^https?:\/\//.test(url) || sources.some((source) => source.url === url)) continue
    sources.push({ title: typeof chunk.web.title === 'string' && chunk.web.title ? chunk.web.title : new URL(url).hostname, url })
  }
  return sources
}

/**
 * Jetons consommés d’après les métadonnées de Gemini (les « pensées » du modèle sont facturées en sortie).
 * @param {any} metadata
 * @returns {TokenUsage}
 */
export const readUsage = (metadata) => ({
  inputTokens: Number(metadata?.promptTokenCount) || 0,
  outputTokens: (Number(metadata?.candidatesTokenCount) || 0) + (Number(metadata?.thoughtsTokenCount) || 0),
})

/**
 * Diffuse la réponse de Gemini fragment par fragment, puis, si la recherche web a servi,
 * ses sources et les suggestions de recherche Google (à afficher telles quelles, conditions de Google),
 * et enfin les jetons consommés (`usage`, pour le suivi des coûts ; jamais montré tel quel).
 * `instructions` remplace les consignes générales de Gilli (assistant Business) ; `webSearch: false`
 * retire la recherche Google ; `functions` propose au modèle des actions, qu’il demande par un
 * événement `functionCall` (le modèle n’exécute rien lui-même : c’est à l’application de décider).
 * @param {{
 *   apiKey: string,
 *   model: string,
 *   apiBase?: string,
 *   messages: RelayMessage[],
 *   preferences: { responseLanguage?: string, userWritingMode?: string },
 *   reference?: string,
 *   instructions?: string,
 *   webSearch?: boolean,
 *   functions?: FunctionDeclaration[],
 *   signal?: AbortSignal,
 * }} options
 * @returns {AsyncGenerator<ReplyEvent>}
 */
export async function* streamGeminiReply({ apiKey, model, apiBase = DEFAULT_API_BASE, messages, preferences, reference = '', instructions, webSearch = true, functions, signal }) {
  const response = await fetch(`${apiBase}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions ?? buildSystemInstruction(preferences, reference) }] },
      contents: toGeminiContents(messages),
      // Recherche Google proposée au chatbot : le modèle décide seul de l’utiliser selon la demande.
      ...(webSearch ? { tools: [{ google_search: {} }] } : functions?.length ? { tools: [{ functionDeclarations: functions }] } : {}),
    }),
    signal,
  })
  if (!response.ok || !response.body) throw await errorForResponse(response, model)

  /** @type {WebSource[]} */
  let sources = []
  /** @type {string | undefined} */
  let searchSuggestionsHtml
  /** @type {TokenUsage | null} */
  let usage = null

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    // Les événements SSE sont séparés par une ligne vide ; seule la ligne « data: » nous intéresse.
    let boundary
    while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const event = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '')
      const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('')
      if (!data) continue
      const payload = JSON.parse(data)
      // Chaque fragment répète le total cumulé : le dernier reçu fait foi.
      if (payload.usageMetadata) usage = readUsage(payload.usageMetadata)
      if (payload.promptFeedback?.blockReason) {
        throw new UpstreamError('Le moteur a refusé de répondre à cette demande.', 422)
      }
      for (const candidate of payload.candidates ?? []) {
        for (const part of candidate.content?.parts ?? []) {
          // Les « pensées » internes du modèle ne sont jamais montrées.
          if (typeof part.text === 'string' && part.text && !part.thought) yield { text: part.text }
          if (part.functionCall && typeof part.functionCall.name === 'string') yield { functionCall: { name: part.functionCall.name, args: part.functionCall.args ?? {} } }
        }
        if (candidate.groundingMetadata) {
          const found = readGroundingSources(candidate.groundingMetadata)
          if (found.length > 0) sources = found
          const html = candidate.groundingMetadata.searchEntryPoint?.renderedContent
          if (typeof html === 'string' && html) searchSuggestionsHtml = html
        }
      }
    }
  }
  if (sources.length > 0 || searchSuggestionsHtml) yield { sources, ...(searchSuggestionsHtml ? { searchSuggestionsHtml } : {}) }
  if (usage) yield { usage }
}

/**
 * Propose un titre court (6 mots au plus) pour une conversation, dans la langue du message.
 * @param {{ apiKey: string, model: string, apiBase?: string, text: string, signal?: AbortSignal }} options
 * @returns {Promise<string | null>}
 */
export async function generateGeminiTitle({ apiKey, model, apiBase = DEFAULT_API_BASE, text, signal }) {
  const response = await fetch(`${apiBase}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Tu donnes un titre très court (6 mots au plus) à une conversation, dans la langue de son premier message. Réponds uniquement par le titre, sans guillemets, sans ponctuation finale, sans Markdown.' }] },
      contents: [{ role: 'user', parts: [{ text: text.slice(0, 2000) }] }],
    }),
    signal,
  })
  if (!response.ok) throw await errorForResponse(response, model)
  const payload = /** @type {{ candidates?: Array<{ content?: { parts?: Array<{ text?: string, thought?: boolean }> } }> }} */ (await response.json())
  const parts = payload.candidates?.[0]?.content?.parts ?? []
  const raw = parts.filter((part) => typeof part.text === 'string' && !part.thought).map((part) => part.text).join('')
  return sanitizeTitle(raw)
}

/** @param {string} raw */
export function sanitizeTitle(raw) {
  const title = raw.trim().split(/\r?\n/)[0].replace(/^[#*\s"'«»“”]+|[\s"'«»“”.!?:;…*]+$/g, '').trim()
  if (!title) return null
  return title.length > 60 ? `${title.slice(0, 59).trimEnd()}…` : title
}

/**
 * Fournisseur Gemini conforme au contrat commun (server/ai/provider.mjs).
 * @param {{ apiKey?: string, model?: string, liteModel?: string, apiBase?: string }} config
 * @returns {import('./provider.mjs').AiProvider}
 */
export function createGeminiProvider({ apiKey, model = 'gemini-flash-latest', liteModel = 'gemini-flash-lite-latest', apiBase } = {}) {
  return {
    name: 'gemini',
    configured: Boolean(apiKey),
    models: { standard: model, lite: liteModel },
    streamReply: ({ tier, ...request }) => streamGeminiReply({ apiKey: apiKey ?? '', model: tier === 'lite' ? liteModel : model, apiBase, ...request }),
    // Les titres passent par le modèle économe pour préserver le quota du modèle principal.
    generateTitle: ({ text, signal }) => generateGeminiTitle({ apiKey: apiKey ?? '', model: liteModel, apiBase, text, signal }),
  }
}
