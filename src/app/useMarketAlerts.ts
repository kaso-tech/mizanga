import { useEffect } from 'react'
import { marketplaceApi } from '../services/marketplaceApi'
import { CHECK_INTERVAL_MS, checkAlerts, useAlerts } from './marketSaved'

/**
 * Vérifie les alertes de recherche à l’ouverture de Gilli, au retour sur l’onglet et toutes les
 * 15 minutes tant qu’il est affiché ; renvoie le nombre de nouvelles annonces (pastille de l’en-tête).
 */
export function useMarketAlerts() {
  const alerts = useAlerts()
  const hasAlerts = alerts.length > 0
  useEffect(() => {
    if (!hasAlerts) return
    const run = () => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) return
      void checkAlerts(async (filters) => (await marketplaceApi.search(filters)).total)
    }
    run()
    const timer = window.setInterval(run, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', run)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', run)
    }
  }, [hasAlerts])
  return alerts.reduce((sum, alert) => sum + alert.newCount, 0)
}
