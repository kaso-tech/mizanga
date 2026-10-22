import { Ban, Plus, ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { formatAmount, formatQuantity } from '../../app/businessFormat'
import type { BusinessApi, Business, Period, Product, Sale } from '../../services/businessApi'
import { ConfirmDialog } from './ConfirmDialog'
import { SaleDialog } from './SaleDialog'
import { usePeriodData } from './usePeriodData'

interface PanelProps {
  api: BusinessApi
  business: Business
  products: Product[]
  period: Period
  picker: React.ReactNode
  onNotify: (message: string, tone?: 'success' | 'info') => void
  onStockChanged: () => Promise<void>
}

/** Ventes de la période : enregistrement (le stock baisse) et annulation par le propriétaire (le stock revient). */
export function SalesPanel({ api, business, products, period, picker, onNotify, onStockChanged }: PanelProps) {
  const { data: sales, error, reload } = usePeriodData((range) => api.listSales(business.id, range), period)
  const [dialog, setDialog] = useState<{ type: 'new' } | { type: 'cancel'; sale: Sale } | null>(null)
  const currency = business.currency
  const completed = (sales ?? []).filter((sale) => sale.status === 'completed')
  const revenue = completed.reduce((sum, sale) => sum + sale.totalAmount, 0)

  const after = async (message: string) => {
    setDialog(null)
    onNotify(message, 'success')
    reload()
    await onStockChanged().catch(() => onNotify('Le stock n’a pas pu être actualisé. Rechargez la page.'))
  }

  return (
    <section aria-label="Ventes" className="business-panel">
      <div className="business-toolbar">
        {picker}
        <button type="button" className="primary-button" onClick={() => setDialog({ type: 'new' })}><Plus size={16} aria-hidden="true" /> Nouvelle vente</button>
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!sales && !error && <div className="page-loading" aria-busy="true" />}
      {sales && (
        <>
          <div className="admin-stats business-stats">
            <div className="admin-stat"><span className="admin-stat-value">{completed.length}</span><span className="admin-stat-label">Ventes</span></div>
            <div className="admin-stat"><span className="admin-stat-value">{formatAmount(revenue, currency)}</span><span className="admin-stat-label">Total des ventes</span></div>
          </div>
          {sales.length === 0 ? (
            <div className="settings-section business-empty">
              <ShoppingCart size={28} aria-hidden="true" />
              <p>Aucune vente sur cette période.</p>
            </div>
          ) : (
            <ul className="product-list" aria-label="Liste des ventes">
              {sales.map((sale) => (
                <li key={sale.id} className={`product-card sale-card ${sale.status === 'cancelled' ? 'is-cancelled' : ''}`}>
                  <div className="product-main">
                    <span className="product-name">{formatAmount(sale.totalAmount, currency)}</span>
                    {sale.status === 'cancelled' && <span className="stock-badge is-out">Annulée</span>}
                    <span className="sale-time">{new Date(sale.soldAt).toLocaleString('fr', { timeZone: business.timezone, dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                  <ul className="sale-items">
                    {(sale.items ?? []).map((item) => (
                      <li key={item.productId}>{formatQuantity(item.quantity)} {item.unit} · {item.productName} · {formatAmount(item.unitPrice, currency)}</li>
                    ))}
                  </ul>
                  <div className="product-figures">
                    {sale.customerName && <span>Client : {sale.customerName}</span>}
                    {sale.status === 'completed' && <span>Marge : {formatAmount(sale.totalAmount - sale.totalCost, currency)}</span>}
                    {sale.note && <span>{sale.note}</span>}
                  </div>
                  {business.role === 'owner' && sale.status === 'completed' && (
                    <div className="product-actions">
                      <button type="button" className="secondary-button" onClick={() => setDialog({ type: 'cancel', sale })} aria-label={`Annuler la vente de ${formatAmount(sale.totalAmount, currency)}`}><Ban size={14} aria-hidden="true" /> Annuler</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {dialog?.type === 'new' && (
        <SaleDialog products={products} currency={currency} onClose={() => setDialog(null)} onSave={async (input) => { await api.recordSale(business.id, input); await after('Vente enregistrée.') }} />
      )}
      {dialog?.type === 'cancel' && (
        <ConfirmDialog
          title="Annuler la vente"
          description={`La vente de ${formatAmount(dialog.sale.totalAmount, currency)} sera marquée annulée et les produits reviendront en stock. Elle reste visible dans l’historique.`}
          confirmLabel="Annuler la vente"
          reasonLabel="Motif (facultatif)"
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => { await api.cancelSale(business.id, dialog.sale.id, reason || undefined); await after('Vente annulée, stock rétabli.') }}
        />
      )}
    </section>
  )
}
