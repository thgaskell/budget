import type { Store } from '../stores/types.ts'

/**
 * Calculate Ready to Assign (unassigned pool) for a budget.
 *
 * Ready to Assign = Sum of all inflows (income) - Sum of all category assigned amounts
 *
 * This represents money that hasn't been allocated to any category yet.
 * In zero-based budgeting, this should be zero.
 *
 * IMPORTANT: Categorized expenses do NOT affect Ready to Assign.
 * Expenses only reduce the Available amount in their assigned category.
 * RTA only decreases when money is assigned to categories.
 */
export function getReadyToAssign(store: Store, budgetId: string, throughMonth: string): number {
  // Get all on-budget accounts
  const accounts = store.listAccounts(budgetId).filter((a) => a.onBudget)

  // Sum all INFLOWS (positive transactions only) up through the month
  // Categorized expenses do NOT reduce Ready to Assign
  const monthEnd = getMonthEnd(throughMonth)
  let totalInflows = 0

  for (const account of accounts) {
    const transactions = store.listTransactions(account.id, { to: monthEnd })
    for (const txn of transactions) {
      // Only count inflows (positive amounts) - income
      if (txn.amount > 0) {
        totalInflows += txn.amount
      }
    }
  }

  // Sum all assigned amounts up through the month
  let totalAssigned = 0

  // Get all categories for this budget
  const categories = store.listCategories(budgetId)

  // Sum assignments for all months up to throughMonth
  const [year, monthNum] = throughMonth.split('-').map(Number)
  for (let y = year - 1; y <= year; y++) {
    const startMonth = y < year ? 1 : 1
    const endMonth = y < year ? 12 : monthNum
    for (let m = startMonth; m <= endMonth; m++) {
      const monthKey = `${y}-${String(m).padStart(2, '0')}`
      for (const category of categories) {
        const assignment = store.getAssignment(category.id, monthKey)
        if (assignment) {
          totalAssigned += assignment.amount
        }
      }
    }
  }

  return totalInflows - totalAssigned
}

/**
 * Get the last day of a month in YYYY-MM-DD format.
 */
function getMonthEnd(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNum, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}
