import { formatAmount, formatQuantity, marginRate } from '../../app/businessFormat'
import type { BusinessApi, Business, Period } from '../../services/businessApi'
import { usePeriodData } from './usePeriodData'

/**
 * Résultats de la période, calculés par la base (et non par l’IA) : chiffre d’affaires des ventes non
 * annulées, coût d’achat des produits vendus (figé au moment de la vente), marge brute, dépenses et
 * résultat estimé. Ce n’est pas un résultat comptable ou fiscal.
 */
export function ResultsPanel({ api, business, period, picker }: { api: BusinessApi; business: Business; period: Period; picker: React.ReactNode }) {
  const { data, error } = usePeriodData((range) => api.summary(business.id, range), period)
  const currency = business.currency
  const amount = (value: number) => formatAmount(value, currency)
  const summary = data?.summary
  const rate = summary ? marginRate(summary.grossMargin, summary.revenue) : null

  return (
    <section aria-label="Résultats" className="business-panel">
      <div className="business-toolbar">{picker}</div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!data && !error && <div className="page-loading" aria-busy="true" />}
      {data && summary && (
        <>
          <dl className="results-grid">
            <div className="admin-stat"><dt className="admin-stat-label">Chiffre d’affaires</dt><dd className="admin-stat-value">{amount(summary.revenue)}</dd></div>
            <div className="admin-stat"><dt className="admin-stat-label">Coût des produits vendus</dt><dd className="admin-stat-value">{amount(summary.costOfGoodsSold)}</dd></div>
            <div className="admin-stat"><dt className="admin-stat-label">Marge brute{rate && ` (${rate})`}</dt><dd className="admin-stat-value">{amount(summary.grossMargin)}</dd></div>
            <div className="admin-stat"><dt className="admin-stat-label">Dépenses</dt><dd className="admin-stat-value">{amount(summary.expenses)}</dd></div>
            <div className={`admin-stat result-final ${summary.estimatedResult < 0 ? 'is-negative' : ''}`}><dt className="admin-stat-label">Résultat estimé</dt><dd className="admin-stat-value">{amount(summary.estimatedResult)}</dd></div>
          </dl>
          <p className="field-hint">
            {summary.salesCount} vente{summary.salesCount > 1 ? 's' : ''}
            {summary.cancelledSalesCount > 0 && `, ${summary.cancelledSalesCount} annulée${summary.cancelledSalesCount > 1 ? 's' : ''} (non comptée${summary.cancelledSalesCount > 1 ? 's' : ''})`}.
            {' '}Marge brute = chiffre d’affaires − coût d’achat des produits vendus. Résultat estimé = marge brute − dépenses.
          </p>
          <p className="settings-callout results-disclaimer">Estimation à partir des données saisies ; ce n’est pas un résultat comptable ou fiscal certifié.</p>

          {data.products.length > 0 && (
            <div className="settings-section">
              <h2>Ventes par produit</h2>
              <div className="table-scroll">
                <table className="results-table">
                  <thead><tr><th scope="col">Produit</th><th scope="col">Quantité</th><th scope="col">Chiffre d’affaires</th><th scope="col">Marge brute</th></tr></thead>
                  <tbody>
                    {data.products.map((row) => (
                      <tr key={row.productId}>
                        <th scope="row">{row.productName}</th>
                        <td>{formatQuantity(row.quantity)} {row.unit}</td>
                        <td>{amount(row.revenue)}</td>
                        <td className={row.grossMargin < 0 ? 'is-negative' : ''}>{amount(row.grossMargin)}</td>
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
