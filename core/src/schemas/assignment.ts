/**
 * Assignment entity - tracks money assigned to a category for a specific month.
 * This is the "Assigned" column in the budget view.
 */
export interface Assignment {
  /** Unique identifier (UUID) */
  id: string
  /** Category this assignment belongs to */
  categoryId: string
  /** Month in YYYY-MM format */
  month: string
  /** Amount assigned in cents */
  amount: number
}

/**
 * Create a new Assignment with a unique ID.
 */
export function createAssignment(params: {
  categoryId: string
  month: string
  amount: number
}): Assignment {
  return {
    id: crypto.randomUUID(),
    categoryId: params.categoryId,
    month: params.month,
    amount: params.amount,
  }
}

/**
 * Get month string from date in YYYY-MM format.
 */
export function getMonth(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}
