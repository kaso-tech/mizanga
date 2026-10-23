import { formatAmount } from '../../app/businessFormat'
import { formatRate, speciesLabels, totalsOf } from '../../app/livestock'
import type { Business, Period } from '../../services/businessApi'
import type { LivestockApi } from '../../services/livestockApi'
import { usePeriodData } from '../business/usePeriodData'

/**
 * Résultats de l’élevage sur la période, calculés par la base (et non par l’IA), lot par lot. Ils restent
 * séparés des résultats du Commerce. Estimation, pas un résultat comptable ou fiscal certifié.
 */
export function LivestockResults({ api, business, period, picker, version }: { api: LivestockApi; business: Business; period: Period; picker: React.ReactNode; version: number }) {
  const { data: herds, error } = usePeriodData((range) => api.summary(business.id, range), period, version)
  const amount = (value: number) => formatAmount(value, business.currency)
  const totals = herds ? totalsOf(herds) : null

  return (
    <section aria-label="Résultats de l’élevage" className="business-panel">
      <div className="business-toolbar">{picker}</div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!herds && !error && <div className="page-loading" aria-busy="true" />}
      {herds && totals && (
        <>
          <dl className="results-grid">
            <div className="admin-stat"><dt className="admin-stat-label">Animaux en fin de période</dt><dd className="admin-stat-value">{totals.closingHeadcount.toLocaleString('fr')}</dd></div>
            <div className="admin-stat"><dt className="admin-stat-label">Mortalité ({totals.deaths} mort{totals.deaths > 1 ? 's' : ''})</dt><dd className="admin-stat-value">{formatRate(totals.mortalityRate)}</dd></div>
            <div className="admin-stat"><dt className="admin-stat-label">Coûts</dt><dd className="admin-stat-value">{amount(totals.totalCost)}</dd></div>
            <div className="admin-stat"><dt className="admin-stat-label">Ventes d’animaux</dt><dd className="admin-stat-value">{amount(totals.salesRevenue)}</dd></div>
            <div className={`admin-stat result-final ${totals.estimatedMargin < 0 ? 'is-negative' : ''}`}><dt className="admin-stat-label">Marge estimée</dt><dd className="admin-stat-value">{amount(totals.estimatedMargin)}</dd></div>
          </dl>
          <p className="field-hint">
            Mortalité = morts ÷ (effectif au début + naissances + achats). Coûts = achats d’animaux + alimentation + santé + autres frais. Marge estimée = ventes d’animaux − coûts. Ces résultats sont séparés de ceux du Commerce.
          </p>
          <p className="settings-callout results-disclaimer">Estimation à partir des données saisies ; ce n’est pas un résultat comptable ou fiscal certifié.</p>
          {herds.length > 0 && (
            <div className="settings-section">
              <h2>Par lot</h2>
              <div className="table-scroll">
                <table className="results-table" aria-label="Résultats par lot">
                  <thead>
                    <tr>
                      <th scope="col">Lot</th><th scope="col">Début</th><th scope="col">Naissances</th><th scope="col">Achats</th><th scope="col">Ventes</th><th scope="col">Morts</th><th scope="col">Fin</th>
                      <th scope="col">Mortalité</th><th scope="col">Alimentation</th><th scope="col">Santé</th><th scope="col">Coûts</th><th scope="col">Ventes (F)</th><th scope="col">Marge estimée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {herds.map((row) => (
                      <tr key={row.herdId}>
                        <th scope="row">{row.herdName}<span className="table-sub">{speciesLabels[row.species]}</span></th>
                        <td>{row.openingHeadcount}</td>
                        <td>{row.births}</td>
                        <td>{row.purchases}</td>
                        <td>{row.sales}</td>
                        <td>{row.deaths}</td>
                        <td>{row.closingHeadcount}</td>
                        <td>{formatRate(row.mortalityRate)}</td>
                        <td>{amount(row.feedCost)}</td>
                        <td>{amount(row.healthCost)}</td>
                        <td>{amount(row.totalCost)}</td>
                        <td>{amount(row.salesRevenue)}</td>
                        <td className={row.estimatedMargin < 0 ? 'is-negative' : ''}>{amount(row.estimatedMargin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
