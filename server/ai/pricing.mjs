// Coût estimé d’une demande au moteur d’IA, pour le suivi par utilisateur (table ai_usage).
// Les prix ne sont pas devinés : ils viennent de la configuration du serveur (AI_PRICE_USD_PER_MILLION,
// « entrée,sortie » en dollars US par million de jetons, d’après la grille publique du fournisseur).
// Sans configuration, le coût est 0 : c’est le cas de l’offre gratuite de Gemini utilisée aujourd’hui.

/**
 * @typedef {{ inputUsdPerMillion: number, outputUsdPerMillion: number }} AiPricing
 */

/** @param {string | undefined} value @returns {AiPricing} */
export function readPricing(value) {
  if (!value?.trim()) return { inputUsdPerMillion: 0, outputUsdPerMillion: 0 }
  const [input, output] = value.split(',').map((part) => Number(part.trim()))
  if (![input, output].every((price) => Number.isFinite(price) && price >= 0)) {
    throw new Error('AI_PRICE_USD_PER_MILLION doit être de la forme « entrée,sortie », par exemple « 0.30,2.50 ».')
  }
  return { inputUsdPerMillion: input, outputUsdPerMillion: output }
}

/**
 * Coût en millionièmes de dollar : jetons × dollars par million de jetons, arrondi.
 * @param {{ inputTokens: number, outputTokens: number }} usage @param {AiPricing} pricing
 */
export const estimateCostMicroUsd = (usage, pricing) => Math.round(usage.inputTokens * pricing.inputUsdPerMillion + usage.outputTokens * pricing.outputUsdPerMillion)
