/**
 * Payee entity - entity money is sent to or received from.
 */
export interface Payee {
  /** Unique identifier (UUID) */
  id: string
  /** Parent budget ID */
  budgetId: string
  /** Payee name */
  name: string
}

/**
 * Create a new Payee with a unique ID.
 */
export function createPayee(params: { budgetId: string; name: string }): Payee {
  return {
    id: crypto.randomUUID(),
    budgetId: params.budgetId,
    name: params.name,
  }
}
