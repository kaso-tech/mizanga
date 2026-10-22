import { useEffect, useRef, type RefObject } from 'react'

const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'

/**
 * Fenêtre modale accessible : focus initial, Échap pour fermer, Tab qui reste dans la fenêtre,
 * puis retour du focus à l’élément d’origine à la fermeture.
 */
export function useModalFocus(dialogRef: RefObject<HTMLElement>, initialFocusRef: RefObject<HTMLElement>, onClose: () => void, isOpen = true) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    initialFocusRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (returnFocusTo?.isConnected) returnFocusTo.focus()
    }
  }, [isOpen, dialogRef, initialFocusRef])
}
