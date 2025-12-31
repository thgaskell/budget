import { createAssignment } from '../schemas/assignment.ts'
import type { Assignment } from '../schemas/assignment.ts'
import type { Store } from '../stores/types.ts'

/**
 * Assign money to a category for a specific month.
 * If an assignment already exists, updates the amount.
 * Returns the assignment.
 */
export function assignToCategory(
  store: Store,
  categoryId: string,
  month: string,
  amount: number
): Assignment {
  const existing = store.getAssignment(categoryId, month)

  if (existing) {
    const updated = { ...existing, amount }
    store.saveAssignment(updated)
    return updated
  }

  const assignment = createAssignment({
    categoryId,
    month,
    amount,
  })

  store.saveAssignment(assignment)
  return assignment
}

/**
 * Move money between categories for a specific month.
 * Decreases source category assignment and increases target.
 */
export function moveBetweenCategories(
  store: Store,
  fromCategoryId: string,
  toCategoryId: string,
  month: string,
  amount: number
): { from: Assignment; to: Assignment } {
  const fromExisting = store.getAssignment(fromCategoryId, month)
  const toExisting = store.getAssignment(toCategoryId, month)

  const fromAmount = (fromExisting?.amount ?? 0) - amount
  const toAmount = (toExisting?.amount ?? 0) + amount

  const from = assignToCategory(store, fromCategoryId, month, fromAmount)
  const to = assignToCategory(store, toCategoryId, month, toAmount)

  return { from, to }
}

/**
 * Clear all assignments for a category.
 * Useful when deleting a category.
 */
export function clearCategoryAssignments(
  store: Store,
  categoryId: string,
  months: string[]
): void {
  for (const month of months) {
    store.deleteAssignment(categoryId, month)
  }
}
