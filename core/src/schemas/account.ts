/**
 * Account types.
 * - Budget accounts (onBudget: true): checking, savings, credit, cash
 * - Tracking accounts (onBudget: false): tracking (investments, property, etc.)
 */
export type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'tracking'

/**
 * Account entity - a financial container holding actual money.
 */
export interface Account {
  /** Unique identifier (UUID) */
  id: string
  /** Parent budget ID */
  budgetId: string
  /** Account name */
  name: string
  /** Account type */
  type: AccountType
  /** Whether dollars contribute to assignable pool */
  onBudget: boolean
}

/**
 * Create a new Account with a unique ID.
 * onBudget defaults to true for non-tracking accounts.
 */
export function createAccount(params: {
  budgetId: string
  name: string
  type: AccountType
  onBudget?: boolean
}): Account {
  return {
    id: crypto.randomUUID(),
    budgetId: params.budgetId,
    name: params.name,
    type: params.type,
    onBudget: params.onBudget ?? params.type !== 'tracking',
  }
}
