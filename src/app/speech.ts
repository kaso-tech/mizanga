// Lecture à voix haute avec la synthèse vocale du navigateur (aucun envoi sur le réseau).
// Aucune voix mooré n’existe encore dans les navigateurs : le réglage le signale à l’utilisateur.

export const speechRates = [0.75, 1, 1.25, 1.5]

export const isSpeechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

/**
 * Texte d’une réponse Markdown tel qu’il doit être lu : sans symboles de mise en forme,
 * les blocs de code et les formules étant annoncés plutôt que lus caractère par caractère.
 */
export function toSpeechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, '\n(bloc de code)\n')
    .replace(/\$\$[\s\S]*?\$\$/g, ' (formule) ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, '')
    .replace(/^[ \t]*\|[ \t]*|[ \t]*\|[ \t]*$/gm, '')
    .replace(/[ \t]*\|[ \t]*/g, ', ')
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ | $/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * Découpe le texte en morceaux courts, coupés aux fins de phrase : certains navigateurs
 * (Chrome) interrompent silencieusement une lecture trop longue.
 */
export function splitForSpeech(text: string, maxLength = 220): string[] {
  const sentences = text.match(/[^.!?…\n]+[.!?…]*\s*|\n/g) ?? []
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current && (current + sentence).length > maxLength) {
      chunks.push(current.trim())
      current = ''
    }
    if (sentence.length > maxLength) {
      for (let index = 0; index < sentence.length; index += maxLength) chunks.push(sentence.slice(index, index + maxLength).trim())
    } else {
      current += sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(Boolean)
}

/** Voix proposées : français et anglais d’abord, les autres langues ensuite. */
export function listVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return []
  const rank = (voice: SpeechSynthesisVoice) => (voice.lang.startsWith('fr') ? 0 : voice.lang.startsWith('en') ? 1 : 2)
  return [...window.speechSynthesis.getVoices()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/** Les voix arrivent parfois après le chargement de la page (événement « voiceschanged »). */
export function subscribeVoices(onChange: () => void) {
  if (!isSpeechSupported()) return () => undefined
  window.speechSynthesis.addEventListener('voiceschanged', onChange)
  return () => window.speechSynthesis.removeEventListener('voiceschanged', onChange)
}

function pickVoice(voiceName: string) {
  const voices = listVoices()
  return voices.find((voice) => voice.name === voiceName) ?? voices.find((voice) => voice.lang.startsWith('fr'))
}

let session = 0

/** Lit un texte Markdown ; `onEnd` est appelé à la fin, à l’arrêt ou en cas d’erreur. */
export function speak(markdown: string, { rate = 1, voiceName = '', onEnd }: { rate?: number; voiceName?: string; onEnd?: () => void } = {}) {
  if (!isSpeechSupported()) return
  stopSpeaking()
  const current = ++session
  const voice = pickVoice(voiceName)
  const chunks = splitForSpeech(toSpeechText(markdown))
  if (chunks.length === 0) {
    onEnd?.()
    return
  }
  chunks.forEach((chunk, index) => {
    const utterance = new SpeechSynthesisUtterance(chunk)
    utterance.rate = rate
    utterance.lang = voice?.lang ?? 'fr-FR'
    if (voice) utterance.voice = voice
    const finish = () => {
      if (session === current) {
        session++
        onEnd?.()
      }
    }
    if (index === chunks.length - 1) utterance.onend = finish
    utterance.onerror = finish
    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking() {
  if (!isSpeechSupported()) return
  session++
  window.speechSynthesis.cancel()
}
