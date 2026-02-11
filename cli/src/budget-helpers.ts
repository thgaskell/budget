import { getStore } from './store.ts'

/**
 * Get the single budget ID from the current file.
 * Throws if no budget exists in the file.
 */
export function requireBudgetId(): string {
  const store = getStore()
  const budgets = store.listBudgets()
  if (budgets.length === 0) {
    throw new Error('No budget found in this file. Use "budget create <file_path>" to create one.')
  }
  return budgets[0].id
}
