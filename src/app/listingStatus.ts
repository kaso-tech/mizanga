/** États d’une annonce, tels que le vendeur les voit. */
export const listingStatusLabels: Record<string, string> = {
  pending: 'En attente de vérification',
  published: 'En ligne',
  review: 'En vérification',
  rejected: 'Refusée',
  hidden: 'Masquée par Gilli',
  withdrawn: 'Retirée',
}
