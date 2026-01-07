/**
 * Transaction entity - an individual money movement.
 * Amounts are stored as integers (cents) to avoid floating-point issues.
 * Positive amounts = inflow, negative amounts = outflow.
 */
export interface Transaction {
  /** Unique identifier (UUID) */
  id: string
  /** Parent account ID */
  accountId: string
  /** Assigned category ID (null for transfers between budget accounts) */
  categoryId: string | null
  /** Payee reference ID */
  payeeId: string | null
  /** Transaction date (ISO string) */
  date: string
  /** Signed amount in cents (negative = outflow, positive = inflow) */
  amount: number
  /** Whether transaction is bank-confirmed */
  cleared: boolean
  /** Optional notes */
  memo: string | null
  /** For transfers: the linked account ID */
  transferAccountId: string | null
  /** ISO date string when the transaction was created */
  createdAt: string
  /** ISO date string when the transaction was last updated */
  updatedAt: string
}

/**
 * Create a new Transaction with a unique ID.
 */
export function createTransaction(params: {
  accountId: string
  categoryId?: string | null
  payeeId?: string | null
  date: string
  amount: number
  cleared?: boolean
  memo?: string | null
  transferAccountId?: string | null
}): Transaction {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    accountId: params.accountId,
    categoryId: params.categoryId ?? null,
    payeeId: params.payeeId ?? null,
    date: params.date,
    amount: params.amount,
    cleared: params.cleared ?? false,
    memo: params.memo ?? null,
    transferAccountId: params.transferAccountId ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Convert dollars to cents for storage.
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/**
 * Convert cents to dollars for display.
 */
export function centsToDollars(cents: number): number {
  return cents / 100
}

/**
 * Format cents as currency string.
 */
export function formatCurrency(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(centsToDollars(cents))
}
