// Appel au modèle Gemini (API REST, réponse en flux SSE). Exécuté uniquement côté serveur :
// la clé d’API ne doit jamais atteindre le navigateur.

const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** Erreur dont le message peut être montré tel quel à l’utilisateur. */
export class UpstreamError extends Error {
  /**
   * @param {string} userMessage
   * @param {number} status
   */
  constructor(userMessage, status) {
    super(userMessage)
    this.name = 'UpstreamError'
    this.status = status
  }
}

/** @type {Record<string, string>} */
const responseLanguageInstructions = {
  auto: 'Réponds dans la langue du dernier message de l’utilisateur (français, mooré, anglais…).',
  'moore-standard': 'Réponds en mooré, dans l’orthographe standardisée (lettres ɛ, ɩ, ʋ et voyelles nasales ã, ẽ, ĩ, õ, ũ).',
  'moore-informal': 'Réponds en mooré, dans l’écriture informelle courante sur Internet.',
  french: 'Réponds en français.',
  english: 'Réponds en anglais.',
}

/** @type {Record<string, string>} */
const writingModeInstructions = {
  standard: 'Quand l’utilisateur écrit en mooré, il utilise l’orthographe standardisée.',
  informal: 'Quand l’utilisateur écrit en mooré, il utilise une écriture informelle (sans les lettres spéciales, avec des variantes) : interprète-la sans la corriger.',
}

/**
 * @param {{ responseLanguage?: string, userWritingMode?: string }} preferences
 */
export function buildSystemInstruction(preferences) {
  return [
    'Tu es Mizanga, un assistant IA généraliste : tu aides à rédiger, résumer, expliquer, analyser, apprendre et s’organiser.',
    'Ta particularité : tu sais discuter en mooré, langue parlée notamment au Burkina Faso, en plus du français et d’autres langues.',
    responseLanguageInstructions[preferences.responseLanguage ?? 'auto'] ?? responseLanguageInstructions.auto,
    writingModeInstructions[preferences.userWritingMode ?? 'standard'] ?? writingModeInstructions.standard,
    'Honnêteté : ne prétends jamais maîtriser un mot, une expression ou une tournure en mooré dont tu n’es pas sûr. Signale-le brièvement et propose une formulation simple ou l’équivalent en français. N’invente ni sources, ni citations, ni proverbes.',
    'Mise en forme : Markdown sobre (titres courts, listes, tableaux et blocs de code quand c’est utile).',
  ].join('\n')
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

/** @param {number} status */
function errorForStatus(status) {
  if (status === 429) return new UpstreamError('La limite d’utilisation gratuite du moteur est atteinte pour le moment. Réessayez dans quelques minutes.', 429)
  if (status === 400) return new UpstreamError('Le moteur a refusé la demande (fichier illisible, format ou paramètres invalides).', 502)
  if (status === 404) return new UpstreamError('Le moteur a refusé la demande (modèle introuvable).', 502)
  if (status === 401 || status === 403) return new UpstreamError('Le moteur n’est pas correctement configuré (clé d’API refusée).', 502)
  if (status === 503) return new UpstreamError('Le moteur est momentanément indisponible. Réessayez plus tard.', 503)
  return new UpstreamError('Le moteur est momentanément indisponible. Réessayez plus tard.', 502)
}

/**
 * Diffuse la réponse de Gemini fragment par fragment.
 * @param {{
 *   apiKey: string,
 *   model: string,
 *   apiBase?: string,
 *   messages: RelayMessage[],
 *   preferences: { responseLanguage?: string, userWritingMode?: string },
 *   signal?: AbortSignal,
 * }} options
 * @returns {AsyncGenerator<string>}
 */
export async function* streamGeminiReply({ apiKey, model, apiBase = DEFAULT_API_BASE, messages, preferences, signal }) {
  const response = await fetch(`${apiBase}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemInstruction(preferences) }] },
      contents: toGeminiContents(messages),
    }),
    signal,
  })
  if (!response.ok || !response.body) throw errorForStatus(response.status)

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
      if (payload.promptFeedback?.blockReason) {
        throw new UpstreamError('Le moteur a refusé de répondre à cette demande.', 422)
      }
      for (const candidate of payload.candidates ?? []) {
        for (const part of candidate.content?.parts ?? []) {
          // Les « pensées » internes du modèle ne sont jamais montrées.
          if (typeof part.text === 'string' && part.text && !part.thought) yield part.text
        }
      }
    }
  }
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
  if (!response.ok) throw errorForStatus(response.status)
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
