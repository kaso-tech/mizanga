import { useEffect, useState } from 'react'
import { createSupabaseAuthClient, type AccountUser, type AuthClient, type AuthClientFactory, type AuthConfig } from '../services/authService'

/**
 * unavailable : les comptes ne sont pas configurés sur le serveur ; loading : session en cours de lecture ;
 * signedOut / signedIn : état connu.
 */
export type AccountStatus = 'unavailable' | 'loading' | 'signedOut' | 'signedIn'

export interface Account {
  status: AccountStatus
  user: AccountUser | null
  client: AuthClient | null
}

/** Compte de l’utilisateur : le client d’authentification est créé après l’affichage de l’application. */
export function useAccount(config: AuthConfig | undefined, createClient: AuthClientFactory = createSupabaseAuthClient): Account {
  const [state, setState] = useState<Account>(() => ({ status: config ? 'loading' : 'unavailable', user: null, client: null }))

  useEffect(() => {
    if (!config) return
    let cancelled = false
    let unsubscribe = () => {}
    void createClient(config)
      .then(async (client) => {
        if (cancelled) return
        unsubscribe = client.onChange((user) => setState({ status: user ? 'signedIn' : 'signedOut', user, client }))
        const user = await client.getUser()
        if (!cancelled) setState({ status: user ? 'signedIn' : 'signedOut', user, client })
      })
      .catch(() => {
        // Bibliothèque non chargée (hors connexion…) : l’application reste utilisable sans compte.
        if (!cancelled) setState({ status: 'unavailable', user: null, client: null })
      })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [config, createClient])

  return state
}
