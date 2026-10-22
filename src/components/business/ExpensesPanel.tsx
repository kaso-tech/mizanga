import { Plus, Receipt, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { localDay } from '../../app/businessPeriods'
import { formatAmount } from '../../app/businessFormat'
import type { BusinessApi, Business, Expense, Period } from '../../services/businessApi'
import { ConfirmDialog } from './ConfirmDialog'
import { ExpenseDialog } from './ExpenseDialog'
import { usePeriodData } from './usePeriodData'

/** Dépenses de la période (loyer, transport…) ; seul le propriétaire peut en supprimer. */
export function ExpensesPanel({ api, business, period, picker, onNotify }: {
  api: BusinessApi
  business: Business
  period: Period
  picker: React.ReactNode
  onNotify: (message: string, tone?: 'success' | 'info') => void
}) {
  const { data: expenses, error, reload } = usePeriodData((range) => api.listExpenses(business.id, range), period)
  const [dialog, setDialog] = useState<{ type: 'new' } | { type: 'delete'; expense: Expense } | null>(null)
  const currency = business.currency
  const total = (expenses ?? []).reduce((sum, expense) => sum + expense.amount, 0)

  const after = (message: string) => {
    setDialog(null)
    onNotify(message, 'success')
    reload()
  }

  return (
    <section aria-label="Dépenses" className="business-panel">
      <div className="business-toolbar">
        {picker}
        <button type="button" className="primary-button" onClick={() => setDialog({ type: 'new' })}><Plus size={16} aria-hidden="true" /> Nouvelle dépense</button>
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!expenses && !error && <div className="page-loading" aria-busy="true" />}
      {expenses && (
        <>
          <div className="admin-stats business-stats">
            <div className="admin-stat"><span className="admin-stat-value">{formatAmount(total, currency)}</span><span className="admin-stat-label">Total des dépenses</span></div>
          </div>
          {expenses.length === 0 ? (
            <div className="settings-section business-empty">
              <Receipt size={28} aria-hidden="true" />
              <p>Aucune dépense sur cette période.</p>
            </div>
          ) : (
            <ul className="product-list" aria-label="Liste des dépenses">
              {expenses.map((expense) => (
                <li key={expense.id} className="product-card">
                  <div className="product-main">
                    <span className="product-name">{formatAmount(expense.amount, currency)}</span>
                    <span className="stock-badge is-low">{expense.category}</span>
                    <span className="sale-time">{new Date(expense.spentAt).toLocaleDateString('fr', { timeZone: business.timezone, dateStyle: 'medium' })}</span>
                  </div>
                  {expense.description && <div className="product-figures"><span>{expense.description}</span></div>}
                  {business.role === 'owner' && (
                    <div className="product-actions">
                      <button type="button" className="icon-button" onClick={() => setDialog({ type: 'delete', expense })} aria-label={`Supprimer la dépense ${expense.category} de ${formatAmount(expense.amount, currency)}`} title="Supprimer"><Trash2 size={16} /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {dialog?.type === 'new' && (
        <ExpenseDialog today={localDay(business.timezone)} onClose={() => setDialog(null)} onSave={async (input) => { await api.recordExpense(business.id, input); after('Dépense enregistrée.') }} />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDialog
          title="Supprimer la dépense"
          description={`La dépense « ${dialog.expense.category} » de ${formatAmount(dialog.expense.amount, currency)} sera supprimée définitivement.`}
          confirmLabel="Supprimer"
          onClose={() => setDialog(null)}
          onConfirm={async () => { await api.deleteExpense(business.id, dialog.expense.id); after('Dépense supprimée.') }}
        />
      )}
    </section>
  )
}
