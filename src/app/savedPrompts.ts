// Consignes enregistrées par l’utilisateur pour les réutiliser (accueil, « / » dans la zone de saisie).
// Elles restent sur cet appareil, à part des préférences : les réinitialiser ne les efface pas.

export interface SavedPrompt {
  id: string
  title: string
  prompt: string
}

const storageKey = 'mizanga.prompts.v1'
export const MAX_SAVED_PROMPTS = 30
export const MAX_PROMPT_TITLE_CHARS = 60

/** Titre par défaut : la première ligne de la consigne, raccourcie. */
export function promptTitle(prompt: string) {
  const firstLine = prompt.trim().split(/\r?\n/)[0]
  return firstLine.length > MAX_PROMPT_TITLE_CHARS ? `${firstLine.slice(0, MAX_PROMPT_TITLE_CHARS - 1).trimEnd()}…` : firstLine
}

export function loadSavedPrompts(): SavedPrompt[] {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown
    if (!Array.isArray(stored)) return []
    return stored
      .filter((item): item is SavedPrompt => typeof item?.id === 'string' && typeof item.title === 'string' && typeof item.prompt === 'string' && item.prompt.trim() !== '')
      .slice(0, MAX_SAVED_PROMPTS)
      .map(({ id, title, prompt }) => ({ id, title, prompt }))
  } catch {
    return []
  }
}

export function storeSavedPrompts(prompts: SavedPrompt[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(prompts))
  } catch {
    // Stockage indisponible : les consignes restent disponibles pendant la session.
  }
}

/**
 * Ajoute une consigne en tête de liste. Renvoie la liste inchangée et une raison si elle est vide,
 * déjà enregistrée ou si la limite est atteinte.
 */
export function addSavedPrompt(prompts: SavedPrompt[], prompt: string, title = ''): { prompts: SavedPrompt[]; problem?: 'empty' | 'duplicate' | 'full' } {
  const text = prompt.trim()
  if (!text) return { prompts, problem: 'empty' }
  if (prompts.some((item) => item.prompt.trim() === text)) return { prompts, problem: 'duplicate' }
  if (prompts.length >= MAX_SAVED_PROMPTS) return { prompts, problem: 'full' }
  const id = `prompt-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
  return { prompts: [{ id, title: title.trim().slice(0, MAX_PROMPT_TITLE_CHARS) || promptTitle(text), prompt: text }, ...prompts] }
}

/** Consignes dont le titre ou le texte contient la recherche (sans tenir compte des accents ni de la casse). */
export function filterSavedPrompts(prompts: SavedPrompt[], query: string) {
  const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr')
  const needle = fold(query.trim())
  return needle ? prompts.filter((item) => fold(`${item.title}\n${item.prompt}`).includes(needle)) : prompts
}
