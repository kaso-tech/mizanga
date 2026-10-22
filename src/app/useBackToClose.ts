import { useEffect, useId, useRef } from 'react'

/**
 * Bouton « retour » d’Android (ou du navigateur) : il ferme la fenêtre ouverte au lieu de quitter
 * la page et de perdre la saisie. À l’ouverture, une entrée est ajoutée à l’historique ; « retour »
 * la retire et ferme la fenêtre. Fermée autrement (bouton, Échap), la fenêtre retire elle-même son entrée.
 */
export function useBackToClose(onClose: () => void) {
  const id = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    let mounted = true
    const state = window.history.state as { gilliModal?: string } | null
    if (state?.gilliModal !== id) window.history.pushState({ ...(state ?? {}), gilliModal: id }, '')
    const onPopState = (event: PopStateEvent) => {
      if ((event.state as { gilliModal?: string } | null)?.gilliModal !== id) onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      mounted = false
      window.removeEventListener('popstate', onPopState)
      // Différé : en mode strict, React démonte puis remonte aussitôt ; l’entrée est alors conservée.
      window.setTimeout(() => {
        if (!mounted && (window.history.state as { gilliModal?: string } | null)?.gilliModal === id) window.history.back()
      }, 0)
    }
  }, [id])
}
