import { formatCurrency, type Transaction, type Category, type Payee } from '@budget/core'
import './TransactionList.css'

interface TransactionListProps {
  transactions: Transaction[]
  categories: Category[]
  payees: Payee[]
  onAddTransaction: () => void
  onEditTransaction: (transaction: Transaction) => void
  onDeleteTransaction: (transactionId: string) => void
}

/**
 * Displays a table of transactions sorted by date (newest first).
 */
export function TransactionList({
  transactions,
  categories,
  payees,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
}: TransactionListProps) {
  // Sort transactions by date, newest first
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  // Format date for display
  const formatDate = (isoDate: string): string => {
    const date = new Date(isoDate)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getPayeeName = (payeeId: string | null): string => {
    if (!payeeId) return '—'
    const payee = payees.find((p) => p.id === payeeId)
    return payee?.name ?? '—'
  }

  const getCategoryName = (categoryId: string | null): string => {
    if (!categoryId) return '—'
    const category = categories.find((c) => c.id === categoryId)
    return category?.name ?? '—'
  }

  return (
    <div className="transaction-list">
      <div className="transaction-list-header">
        <h2>Transactions</h2>
        <button className="add-transaction-btn" onClick={onAddTransaction}>
          + Add Transaction
        </button>
      </div>

      {sortedTransactions.length === 0 ? (
        <p className="empty-message">No transactions yet. Add your first transaction!</p>
      ) : (
        <table className="transaction-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Payee</th>
              <th>Category</th>
              <th className="amount-col">Amount</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedTransactions.map((txn) => (
              <tr key={txn.id}>
                <td>{formatDate(txn.date)}</td>
                <td>{getPayeeName(txn.payeeId)}</td>
                <td>{getCategoryName(txn.categoryId)}</td>
                <td className={`amount-col ${txn.amount >= 0 ? 'inflow' : 'outflow'}`}>
                  {formatCurrency(txn.amount)}
                </td>
                <td className="actions-col">
                  <button
                    className="action-btn edit-btn"
                    onClick={() => onEditTransaction(txn)}
                    title="Edit"
                    aria-label="Edit transaction"
                  >
                    Edit
                  </button>
                  <button
                    className="action-btn delete-btn"
                    onClick={() => onDeleteTransaction(txn.id)}
                    title="Delete"
                    aria-label="Delete transaction"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
