import { describe, expect, it } from 'vitest'
import { migrateLegacyStorage } from './legacyStorage'

describe('reprise des données de Mizanga', () => {
  it('reprend les anciennes clés sous le nom Gilli et les retire', () => {
    localStorage.setItem('mizanga.conversations.v1', '[{"id":"c1"}]')
    localStorage.setItem('mizanga.preferences.v1', '{"theme":"dark"}')
    migrateLegacyStorage()
    expect(localStorage.getItem('gilli.conversations.v1')).toBe('[{"id":"c1"}]')
    expect(localStorage.getItem('gilli.preferences.v1')).toBe('{"theme":"dark"}')
    expect(localStorage.getItem('mizanga.conversations.v1')).toBeNull()
  })

  it('n’écrase jamais une donnée déjà enregistrée sous le nouveau nom', () => {
    localStorage.setItem('gilli.prompts.v1', '[{"id":"nouveau"}]')
    localStorage.setItem('mizanga.prompts.v1', '[{"id":"ancien"}]')
    migrateLegacyStorage()
    expect(localStorage.getItem('gilli.prompts.v1')).toBe('[{"id":"nouveau"}]')
    expect(localStorage.getItem('mizanga.prompts.v1')).toBeNull()
  })

  it('ignore une clé inconnue et un stockage indisponible', () => {
    localStorage.setItem('mizanga.autre', 'x')
    migrateLegacyStorage()
    expect(localStorage.getItem('mizanga.autre')).toBe('x')
    expect(() => migrateLegacyStorage(undefined)).not.toThrow()
  })
})
