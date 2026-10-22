import type { Period } from '../services/businessApi'

// Périodes proposées dans l’espace Business, calculées dans le fuseau horaire du commerce
// (un « aujourd’hui » à Ouagadougou n’est pas forcément celui du téléphone).

export type PeriodPreset = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth'

export const periodLabels: Record<PeriodPreset, string> = {
  today: 'Aujourd’hui',
  yesterday: 'Hier',
  last7: '7 derniers jours',
  thisMonth: 'Ce mois-ci',
  lastMonth: 'Mois dernier',
}

/** Jour du calendrier (AAAA-MM-JJ) d’un instant dans un fuseau horaire. */
export function localDay(timeZone: string, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

export function periodFor(preset: PeriodPreset, timeZone: string, now = new Date()): Period {
  const today = localDay(timeZone, now)
  const monthStart = `${today.slice(0, 7)}-01`
  switch (preset) {
    case 'today': return { start: today, end: today }
    case 'yesterday': return { start: shift(today, -1), end: shift(today, -1) }
    case 'last7': return { start: shift(today, -6), end: today }
    case 'thisMonth': return { start: monthStart, end: today }
    case 'lastMonth': {
      const lastMonthEnd = shift(monthStart, -1)
      return { start: `${lastMonthEnd.slice(0, 7)}-01`, end: lastMonthEnd }
    }
  }
}

/** « 22 oct. » ou « 1 – 22 oct. 2026 » pour rappeler la période affichée. */
export function describePeriod({ start, end }: Period) {
  const format = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString('fr', { timeZone: 'UTC', ...options })
  if (start === end) return format(start, { day: 'numeric', month: 'long', year: 'numeric' })
  return `${format(start, { day: 'numeric', month: 'short' })} – ${format(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
}
