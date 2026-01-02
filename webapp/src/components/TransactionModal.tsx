import { useState, useEffect, useRef } from 'react'
import {
  dollarsToCents,
  centsToDollars,
  type Transaction,
  type Category,
  type Account,
  type Payee,
} from '@budget/core'
import './TransactionModal.css'

interface TransactionModalProps {
  transaction: Transaction | null // null = add mode, populated = edit mode
  categories: Category[]
  accounts: Account[]
  payees: Payee[]
  onSave: (transaction: Transaction) => void
  onDelete?: (transactionId: string) => void
  onClose: () => void
  onAddPayee: (name: string) => Payee
}

/**
 * Modal form for adding or editing a transaction.
 */
export function TransactionModal({
  transaction,
  categories,
  accounts,
  payees,
  onSave,
  onDelete,
  onClose,
  onAddPayee,
}: TransactionModalProps) {
  const isEditMode = transaction !== null

  // Ref for focusing the first input when modal opens
  const firstInputRef = useRef<HTMLInputElement>(null)

  const [date, setDate] = useState(() => {
    if (transaction) return transaction.date
    // Use local date, not UTC (toISOString gives UTC which can be "tomorrow" in some timezones)
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })

  const [payeeName, setPayeeName] = useState(() => {
    if (transaction?.payeeId) {
      const payee = payees.find((p) => p.id === transaction.payeeId)
      return payee?.name ?? ''
    }
    return ''
  })

  const [categoryId, setCategoryId] = useState(() => transaction?.categoryId ?? '')

  const [accountId, setAccountId] = useState(() => transaction?.accountId ?? accounts[0]?.id ?? '')

  const [amountStr, setAmountStr] = useState(() => {
    if (transaction) {
      return centsToDollars(Math.abs(transaction.amount)).toFixed(2)
    }
    return ''
  })

  const [isOutflow, setIsOutflow] = useState(() => {
    if (transaction) return transaction.amount < 0
    return true
  })

  const [memo, setMemo] = useState(() => transaction?.memo ?? '')

  // Validation state for amount
  const [amountError, setAmountError] = useState<string | null>(null)

  /**
   * Validate amount input and return error message or null.
   */
  const validateAmount = (value: string): string | null => {
    const trimmed = value.trim()
    if (trimmed === '') {
      return 'Amount is required'
    }
    const amount = parseFloat(trimmed)
    if (isNaN(amount)) {
      return 'Please enter a valid number'
    }
    if (amount <= 0) {
      return 'Amount must be greater than 0'
    }
    return null
  }

  /**
   * Handle amount change with validation.
   */
  const handleAmountChange = (value: string) => {
    setAmountStr(value)
    // Clear error when user starts typing, validate on blur/submit
    if (amountError) {
      const error = validateAmount(value)
      setAmountError(error)
    }
  }

  /**
   * Handle amount blur for validation.
   */
  const handleAmountBlur = () => {
    const error = validateAmount(amountStr)
    setAmountError(error)
  }

  // Focus first input when modal opens
  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])

  // Update form when transaction prop changes
  useEffect(() => {
    if (transaction) {
      setDate(transaction.date)
      setCategoryId(transaction.categoryId ?? '')
      setAccountId(transaction.accountId)
      setAmountStr(centsToDollars(Math.abs(transaction.amount)).toFixed(2))
      setIsOutflow(transaction.amount < 0)
      setMemo(transaction.memo ?? '')

      if (transaction.payeeId) {
        const payee = payees.find((p) => p.id === transaction.payeeId)
        setPayeeName(payee?.name ?? '')
      } else {
        setPayeeName('')
      }
    }
  }, [transaction, payees])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate amount before submission
    const error = validateAmount(amountStr)
    if (error) {
      setAmountError(error)
      return
    }

    // Parse amount (input is in dollars, store as cents)
    const amountDollars = parseFloat(amountStr)

    // Convert to cents and apply sign based on inflow/outflow
    let amountCents = dollarsToCents(amountDollars)
    if (isOutflow) {
      amountCents = -amountCents
    }

    // Find or create payee
    let payeeId: string | null = null
    if (payeeName.trim()) {
      const existingPayee = payees.find((p) => p.name.toLowerCase() === payeeName.trim().toLowerCase())
      if (existingPayee) {
        payeeId = existingPayee.id
      } else {
        // Create new payee
        const newPayee = onAddPayee(payeeName.trim())
        payeeId = newPayee.id
      }
    }

    const transactionData: Transaction = {
      id: transaction?.id ?? crypto.randomUUID(),
      accountId: accountId || accounts[0]?.id,
      categoryId: categoryId || null,
      payeeId: payeeId,
      date: date,
      amount: amountCents,
      cleared: transaction?.cleared ?? false,
      memo: memo.trim() || null,
      transferAccountId: transaction?.transferAccountId ?? null,
    }

    onSave(transactionData)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h3>{isEditMode ? 'Edit Transaction' : 'Add Transaction'}</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="date">Date</label>
            <input
              ref={firstInputRef}
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {accounts.length > 1 && (
            <div className="form-group">
              <label htmlFor="account">Account</label>
              <select id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="payee">Payee</label>
            <input
              type="text"
              id="payee"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              placeholder="Enter payee name"
              list="payee-suggestions"
            />
            <datalist id="payee-suggestions">
              {payees.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </div>

          <div className="form-group">
            <label htmlFor="category">Category</label>
            <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">-- Select Category --</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className={`form-group${amountError ? ' form-group--error' : ''}`}>
            <label htmlFor="amount">Amount</label>
            <div className="amount-input-group">
              <select
                className="flow-select"
                value={isOutflow ? 'outflow' : 'inflow'}
                onChange={(e) => setIsOutflow(e.target.value === 'outflow')}
                aria-label="Transaction type"
              >
                <option value="outflow">−</option>
                <option value="inflow">+</option>
              </select>
              <span className="currency-symbol">$</span>
              <input
                type="number"
                id="amount"
                className={amountError ? 'input--error' : ''}
                value={amountStr}
                onChange={(e) => handleAmountChange(e.target.value)}
                onBlur={handleAmountBlur}
                placeholder="0.00"
                step="0.01"
                min="0.01"
                required
                aria-invalid={!!amountError}
                aria-describedby={amountError ? 'amount-error' : undefined}
              />
            </div>
            {amountError && (
              <span id="amount-error" className="error-message" role="alert">
                {amountError}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="memo">Memo (optional)</label>
            <input
              type="text"
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Add a note..."
            />
          </div>

          <div className="form-actions">
            {isEditMode && onDelete && (
              <button
                type="button"
                className="delete-btn"
                onClick={() => {
                  onDelete(transaction!.id)
                  onClose()
                }}
              >
                Delete
              </button>
            )}
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="save-btn">
              {isEditMode ? 'Save Changes' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
