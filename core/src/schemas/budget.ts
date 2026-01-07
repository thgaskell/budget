/**
 * Budget entity - the root container for all financial planning.
 */
export interface Budget {
  /** Unique identifier (UUID) */
  id: string
  /** Budget name */
  name: string
  /** Currency code (USD, EUR, etc.) */
  currency: string
  /** ISO date string when the budget was created */
  createdAt: string
  /** ISO date string when the budget was last updated */
  updatedAt: string
}

/**
 * Create a new Budget with a unique ID.
 */
export function createBudget(params: { name: string; currency?: string }): Budget {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: params.name,
    currency: params.currency ?? 'USD',
    createdAt: now,
    updatedAt: now,
  }
}
