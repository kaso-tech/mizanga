import { describe, expect, it } from 'vitest'
import { authErrorMessage, isValidEmail } from './authService'

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
})
