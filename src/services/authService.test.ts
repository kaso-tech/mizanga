import { describe, expect, it } from 'vitest'
import { authErrorMessage, cleanAuthRedirect, isValidEmail, readAuthRedirect } from './authService'

describe('authService', () => {
  it('reconnaît une adresse e-mail plausible', () => {
    expect(isValidEmail(' awa@example.bf ')).toBe(true)
    expect(isValidEmail('awa@example')).toBe(false)
    expect(isValidEmail('awa example.bf')).toBe(false)
  })

  it('traduit les erreurs de Supabase en messages clairs', () => {
    expect(authErrorMessage({ status: 429, code: 'over_email_send_rate_limit' })).toMatch(/Trop de demandes/)
    expect(authErrorMessage({ status: 403, code: 'otp_expired' })).toMatch(/Code incorrect ou expiré/)
    expect(authErrorMessage({ status: 400, code: 'email_address_invalid' })).toMatch(/adresse e-mail n’est pas valide/)
    expect(authErrorMessage({ status: 422, code: 'signup_disabled' })).toMatch(/inscriptions sont fermées/)
    expect(authErrorMessage({ message: 'Failed to fetch' })).toMatch(/vérifiez votre réseau/)
    expect(authErrorMessage(undefined)).toMatch(/La connexion a échoué/)
  })

  it('reconnaît le retour d’un lien de connexion, réussi ou en erreur', () => {
    expect(readAuthRedirect('https://gilli.example/?code=abc')).toEqual({ hasCode: true, hasError: false })
    expect(readAuthRedirect('https://gilli.example/#error=access_denied&error_code=otp_expired')).toEqual({ hasCode: false, hasError: true })
    expect(readAuthRedirect('https://gilli.example/parametres#compte')).toEqual({ hasCode: false, hasError: false })
  })

  it('nettoie l’adresse sans toucher aux autres paramètres ni à l’onglet', () => {
    window.history.replaceState({}, '', '/?code=abc&garder=1')
    cleanAuthRedirect()
    expect(window.location.pathname + window.location.search).toBe('/?garder=1')
    window.history.replaceState({}, '', '/parametres#compte')
    cleanAuthRedirect()
    expect(window.location.hash).toBe('#compte')
    window.history.replaceState({}, '', '/#error=access_denied&error_description=Lien+expir%C3%A9')
    cleanAuthRedirect()
    expect(window.location.hash).toBe('')
  })
})
