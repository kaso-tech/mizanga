import { useEffect, useRef, useState } from 'react'
import { formatAmount, formatQuantity } from '../../app/businessFormat'
import type { Product, StockMovement } from '../../services/businessApi'
import { movementLabels } from './movementLabels'
import { Modal } from '../Modal'

/** Journal des mouvements d’un produit, du plus récent au plus ancien. */
export function HistoryDialog({ product, currency, load, onClose }: { product: Product; currency: string; load: () => Promise<StockMovement[]>; onClose: () => void }) {
  const [movements, setMovements] = useState<StockMovement[] | null>(null)
  const [error, setError] = useState('')

  // Chargé une fois à l’ouverture (la fonction peut changer à chaque affichage du parent).
  const loadRef = useRef(load)
  useEffect(() => {
    let cancelled = false
    loadRef.current().then((loaded) => { if (!cancelled) setMovements(loaded) }).catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Historique indisponible.') })
    return () => { cancelled = true }
  }, [])

  return (
    <Modal title={`Historique : ${product.name}`} onClose={onClose} className="business-dialog">
      {error && <p className="message-error" role="alert">{error}</p>}
      {!movements && !error && <div className="page-loading" aria-busy="true" />}
      {movements && movements.length === 0 && <p className="dialog-description">Aucun mouvement pour ce produit.</p>}
      {movements && movements.length > 0 && (
        <ol className="movement-list">
          {movements.map((movement) => (
            <li key={movement.id}>
              <span className="movement-main">
                <strong>{movementLabels[movement.kind]}</strong>
                <span className={movement.quantityDelta < 0 ? 'is-negative' : 'is-positive'}>
                  {movement.quantityDelta > 0 ? '+' : '−'}{formatQuantity(Math.abs(movement.quantityDelta))} {product.unit}
                </span>
              </span>
              <span className="movement-meta">
                {new Date(movement.createdAt).toLocaleString('fr', { dateStyle: 'medium', timeStyle: 'short' })}
                {movement.unitCost !== null && ` · ${formatAmount(movement.unitCost, currency)} l’unité`}
                {movement.note && ` · ${movement.note}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
