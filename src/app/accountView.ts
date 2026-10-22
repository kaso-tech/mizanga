import type { AccountStatus } from './useAccount'

/** Ce que l’interface affiche du compte (sans le client d’authentification). */
export interface AccountView {
  status: AccountStatus
  email: string | null
}

/** Initiale affichée dans la pastille du compte. */
export const accountInitial = (email: string | null) => (email?.trim()[0] ?? '?').toLocaleUpperCase('fr')
