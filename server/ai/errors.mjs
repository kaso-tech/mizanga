// Erreurs communes aux fournisseurs d’IA.

/**
 * Détail d’un refus du fournisseur (jamais montré aux utilisateurs) : modèle, limites dépassées telles que
 * le fournisseur les nomme (ex. « GenerateRequestsPerDayPerProjectPerModel-FreeTier ») et son message.
 * @typedef {{ model: string, httpStatus: number, quotas: string[], message: string }} EngineDiagnostic
 */

/** Erreur dont le message peut être montré tel quel à l’utilisateur. */
export class UpstreamError extends Error {
  /**
   * @param {string} userMessage
   * @param {number} status
   * @param {Date} [retryAt] Moment où la limite d’utilisation sera réinitialisée, s’il est connu.
   * @param {EngineDiagnostic} [diagnostic] Détail technique du fournisseur, pour la console d’administration.
   */
  constructor(userMessage, status, retryAt, diagnostic) {
    super(userMessage)
    this.name = 'UpstreamError'
    this.status = status
    this.retryAt = retryAt
    this.diagnostic = diagnostic
  }
}
