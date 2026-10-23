import { useCallback, useEffect, useRef, useState } from 'react'
import type { Period } from '../../services/businessApi'

/**
 * Données d’une période, rechargées quand la période change, après une modification (`reload`) ou quand
 * `refreshKey` change (modification faite ailleurs).
 */
export function usePeriodData<T>(load: (period: Period) => Promise<T>, period: Period, refreshKey = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let cancelled = false
    setError('')
    loadRef.current(period)
      .then((loaded) => { if (!cancelled) setData(loaded) })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Chargement impossible.') })
    return () => { cancelled = true }
  }, [period.start, period.end, version, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setVersion((value) => value + 1), [])
  return { data, error, reload }
}
