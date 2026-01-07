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
  /** ISO date string when the payee was created */
  createdAt: string
  /** ISO date string when the payee was last updated */
  updatedAt: string
}

/**
 * Create a new Payee with a unique ID.
 */
export function createPayee(params: { budgetId: string; name: string }): Payee {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    budgetId: params.budgetId,
    name: params.name,
    createdAt: now,
    updatedAt: now,
  }
}
