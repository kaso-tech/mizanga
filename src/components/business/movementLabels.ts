import type { MovementKind } from '../../services/businessApi'

export const movementLabels: Record<MovementKind, string> = {
  initial: 'Stock initial',
  purchase: 'Achat / entrée',
  return: 'Retour client',
  loss: 'Perte',
  adjustment: 'Correction d’inventaire',
  sale: 'Vente',
  sale_cancelled: 'Vente annulée',
}
