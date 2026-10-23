import { useState } from 'react'
import { farmTotals, formatArea, formatKg, seasonLabels } from '../../app/agriculture'
import { formatAmount } from '../../app/businessFormat'
import type { Business, Period } from '../../services/businessApi'
import type { AgricultureApi } from '../../services/agricultureApi'
import { usePeriodData } from '../business/usePeriodData'

/**
 * Résultats d’une campagne (année), calculés par la base (et non par l’IA), culture par culture. Ils restent
 * séparés de ceux du Commerce et de l’Élevage. Estimation, pas un résultat comptable ou fiscal certifié.
 */
export function FarmResults({ api, business, today, version }: { api: AgricultureApi; business: Business; today: string; version: number }) {
  const thisYear = Number(today.slice(0, 4))
  const [year, setYear] = useState(thisYear)
  // La période sert de clé de rechargement : une campagne = une année.
  const period: Period = { start: `${year}-01-01`, end: `${year}-12-31` }
  const { data: crops, error } = usePeriodData(() => api.results(business.id, year), period, version)
  const amount = (value: number) => formatAmount(value, business.currency)
  const totals = crops ? farmTotals(crops) : null

  return (
    <section aria-label="Résultats de l’exploitation" className="business-panel">
      <div className="business-toolbar">
        <label className="field">
          <span className="visually-hidden">Campagne</span>
          <select aria-label="Campagne" value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((value) => <option key={value} value={value}>Campagne {value}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!crops && !error && <div className="page-loading" aria-busy="true" />}
      {crops && totals && (
        <>
          <dl className="results-grid">
            <div className="admin-stat"><dt className="admin-stat-label">Récolté</dt><dd className="admin-stat-value">{formatKg(totals.harvestedKg)}</dd></div>
            <div className="admin-stat"><dt className="admin-stat-label">Encore en stock</dt><dd className="admin-stat-value">{formatKg(totals.stockKg)}</dd></div>
            <div className="admin-stat"><dt className="admin-stat-label">Coûts</dt><dd className="admin-stat-value">{amount(totals.totalCost)}</dd></div>
            <div className="admin-stat"><dt className="admin-stat-label">Ventes de récolte</dt><dd className="admin-stat-value">{amount(totals.salesRevenue)}</dd></div>
            <div className={`admin-stat result-final ${totals.estimatedMargin < 0 ? 'is-negative' : ''}`}><dt className="admin-stat-label">Marge estimée</dt><dd className="admin-stat-value">{amount(totals.estimatedMargin)}</dd></div>
          </dl>
          <p className="field-hint">
            Rendement = kg récoltés ÷ hectares cultivés. Coûts = intrants + main-d’œuvre + location + autres frais. Marge estimée = ventes de récolte − coûts ; la récolte encore en stock n’y est pas comptée en francs. Ces résultats sont séparés de ceux du Commerce et de l’Élevage.
          </p>
          <p className="settings-callout results-disclaimer">Estimation à partir des données saisies ; ce n’est pas un résultat comptable ou fiscal certifié.</p>
          {crops.length === 0 ? (
            <p className="conversation-empty">Aucune culture pour la campagne {year}.</p>
          ) : (
            <div className="settings-section">
              <h2>Par culture</h2>
              <div className="table-scroll">
                <table className="results-table" aria-label="Résultats par culture">
                  <thead>
                    <tr>
                      <th scope="col">Culture</th><th scope="col">Surface</th><th scope="col">Récolté</th><th scope="col">Rendement</th><th scope="col">Vendu</th><th scope="col">Consommé</th><th scope="col">Pertes</th><th scope="col">En stock</th>
                      <th scope="col">Intrants</th><th scope="col">Main-d’œuvre</th><th scope="col">Coûts</th><th scope="col">Ventes</th><th scope="col">Marge estimée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crops.map((row) => (
                      <tr key={row.cropId}>
                        <th scope="row">{row.cropLabel} — {row.plotName}<span className="table-sub">{seasonLabels[row.season]}</span></th>
                        <td>{formatArea(row.areaM2)}</td>
                        <td>{formatKg(row.harvestedKg)}</td>
                        <td>{row.yieldKgPerHa.toLocaleString('fr')} kg/ha</td>
                        <td>{formatKg(row.soldKg)}</td>
                        <td>{formatKg(row.consumedKg)}</td>
                        <td>{formatKg(row.lostKg)}</td>
                        <td>{formatKg(row.stockKg)}</td>
                        <td>{amount(row.inputCost)}</td>
                        <td>{amount(row.labourCost)}</td>
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
