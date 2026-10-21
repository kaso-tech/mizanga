// Erreurs communes aux fournisseurs d’IA.

/** Erreur dont le message peut être montré tel quel à l’utilisateur. */
export class UpstreamError extends Error {
  /**
   * @param {string} userMessage
   * @param {number} status
   * @param {Date} [retryAt] Moment où la limite d’utilisation sera réinitialisée, s’il est connu.
   */
  constructor(userMessage, status, retryAt) {
    super(userMessage)
    this.name = 'UpstreamError'
    this.status = status
    this.retryAt = retryAt
  }
}
