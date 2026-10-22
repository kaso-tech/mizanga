// Comptes Gilli (Supabase Auth). Le navigateur parle directement à Supabase avec la clé publique, faite
// pour être visible : la sécurité des données repose sur les règles RLS de la base. La bibliothèque
// Supabase n’est téléchargée qu’au besoin, pour ne pas ralentir l’ouverture de l’application.

export interface AuthConfig {
  supabaseUrl: string
  publishableKey: string
}

export interface AccountUser {
  id: string
  email: string | null
}

/** Erreur dont le message peut être montré tel quel à l’utilisateur. */
export class AuthError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage)
    this.name = 'AuthError'
  }
}

export interface AuthClient {
  getUser(): Promise<AccountUser | null>
  /** Prévient à chaque connexion ou déconnexion ; renvoie la fonction de désabonnement. */
  onChange(listener: (user: AccountUser | null) => void): () => void
  /** Envoie par e-mail un code de connexion (et un lien, selon le modèle d’e-mail de Supabase). */
  sendCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
  /** Jeton à présenter au serveur de Gilli (en-tête Authorization), ou null hors connexion. */
  accessToken(): Promise<string | null>
}

export type AuthClientFactory = (config: AuthConfig) => Promise<AuthClient>

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

/** Traduit une erreur de Supabase Auth en message clair. */
export function authErrorMessage(error: { status?: number; code?: string; message?: string } | null | undefined) {
  const code = error?.code ?? ''
  if (error?.status === 429 || code.includes('rate_limit')) return 'Trop de demandes de code en peu de temps. Patientez quelques minutes avant de réessayer.'
  if (code === 'otp_expired' || error?.status === 403) return 'Code incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.'
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'Cette adresse e-mail n’est pas valide.'
  if (code === 'signup_disabled' || code === 'otp_disabled') return 'Les inscriptions sont fermées pour le moment.'
  if (error?.status === 0 || error?.message?.includes('fetch')) return 'Connexion impossible : vérifiez votre réseau et réessayez.'
  return 'La connexion a échoué. Réessayez dans un instant.'
}

const toAccountUser = (user: { id: string; email?: string | null } | null | undefined): AccountUser | null => (
  user ? { id: user.id, email: user.email ?? null } : null
)

/** Client réel, adossé à @supabase/supabase-js (chargé à la demande). */
export const createSupabaseAuthClient: AuthClientFactory = async ({ supabaseUrl, publishableKey }) => {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      // PKCE : un lien de connexion reçu par e-mail ne fonctionne que dans le navigateur qui l’a demandé.
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'gilli.auth',
    },
  })

  return {
    async getUser() {
      const { data } = await supabase.auth.getSession()
      return toAccountUser(data.session?.user)
    },
    onChange(listener) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(toAccountUser(session?.user)))
      return () => data.subscription.unsubscribe()
    },
    async sendCode(email) {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/` },
      })
      if (error) throw new AuthError(authErrorMessage(error))
    },
    async verifyCode(email, code) {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
      if (error) throw new AuthError(authErrorMessage(error))
    },
    async signOut() {
      const { error } = await supabase.auth.signOut()
      if (error) throw new AuthError('La déconnexion a échoué. Réessayez.')
    },
    async accessToken() {
      const { data } = await supabase.auth.getSession()
      return data.session?.access_token ?? null
    },
  }
}
