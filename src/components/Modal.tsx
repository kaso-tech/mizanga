import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useModalFocus } from '../app/useModalFocus'

/** Fenêtre modale accessible : titre, fermeture par Échap ou en dehors, focus gardé à l’intérieur. */
export function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useModalFocus(dialogRef, closeRef, onClose)
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <button ref={closeRef} className="icon-button dialog-close" type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  )
}
