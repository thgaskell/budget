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
}

/**
 * Create a new Budget with a unique ID.
 */
export function createBudget(params: { name: string; currency?: string }): Budget {
  return {
    id: crypto.randomUUID(),
    name: params.name,
    currency: params.currency ?? 'USD',
  }
}
