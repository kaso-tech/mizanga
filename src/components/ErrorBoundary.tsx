import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Filet de sécurité : une erreur inattendue affiche un écran explicatif au lieu d’une page blanche.
 * Les conversations enregistrées sur l’appareil ne sont pas touchées.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[gilli] Erreur de l’interface :', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="crash-screen" role="alert">
        <img src="/brand/mark.png" width={56} height={56} alt="" className="brand-mark" />
        <h1>Un problème est survenu</h1>
        <p>Gilli a rencontré une erreur inattendue. Vos conversations enregistrées sur cet appareil sont conservées.</p>
        <div className="crash-actions">
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>Recharger la page</button>
          <button type="button" className="secondary-button" onClick={() => { window.location.href = '/' }}>Revenir à l’accueil</button>
        </div>
        <details>
          <summary>Détails techniques</summary>
          <pre>{this.state.error.message}</pre>
        </details>
      </main>
    )
  }
}
