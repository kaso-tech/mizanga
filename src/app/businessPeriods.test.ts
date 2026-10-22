import { describe, expect, it } from 'vitest'
import { describePeriod, localDay, periodFor } from './businessPeriods'

describe('périodes de l’espace Business', () => {
  it('prend le jour du commerce, pas celui du téléphone', () => {
    const lateEvening = new Date('2026-03-10T23:30:00Z')
    expect(localDay('Africa/Ouagadougou', lateEvening)).toBe('2026-03-10')
    expect(localDay('Africa/Lagos', lateEvening)).toBe('2026-03-11')
  })

  it('calcule les périodes proposées', () => {
    const now = new Date('2026-03-01T10:00:00Z')
    expect(periodFor('today', 'Africa/Ouagadougou', now)).toEqual({ start: '2026-03-01', end: '2026-03-01' })
    expect(periodFor('yesterday', 'Africa/Ouagadougou', now)).toEqual({ start: '2026-02-28', end: '2026-02-28' })
    expect(periodFor('last7', 'Africa/Ouagadougou', now)).toEqual({ start: '2026-02-23', end: '2026-03-01' })
    expect(periodFor('thisMonth', 'Africa/Ouagadougou', now)).toEqual({ start: '2026-03-01', end: '2026-03-01' })
    expect(periodFor('lastMonth', 'Africa/Ouagadougou', now)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('décrit une période en français', () => {
    expect(describePeriod({ start: '2026-10-22', end: '2026-10-22' })).toBe('22 octobre 2026')
    expect(describePeriod({ start: '2026-10-01', end: '2026-10-22' })).toBe('1 oct. – 22 oct. 2026')
  })
})
