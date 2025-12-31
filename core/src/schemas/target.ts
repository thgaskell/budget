/**
 * Target types for category goals.
 * - spending_limit: Maximum amount to spend in a period
 * - savings_balance: Target balance to accumulate
 * - monthly_contribution: Fixed amount to assign each month
 */
export type TargetType = 'spending_limit' | 'savings_balance' | 'monthly_contribution'

/**
 * Target entity - goal amount for a category.
 */
export interface Target {
  /** Unique identifier (UUID) */
  id: string
  /** Parent category ID */
  categoryId: string
  /** Target type */
  type: TargetType
  /** Target amount in cents */
  amount: number
  /** Optional deadline (ISO date string) */
  targetDate: string | null
}

/**
 * Create a new Target with a unique ID.
 */
export function createTarget(params: {
  categoryId: string
  type: TargetType
  amount: number
  targetDate?: string | null
}): Target {
  return {
    id: crypto.randomUUID(),
    categoryId: params.categoryId,
    type: params.type,
    amount: params.amount,
    targetDate: params.targetDate ?? null,
  }
}
