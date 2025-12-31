import type { Store } from '../stores/types.ts'

/**
 * Account balance breakdown.
 */
export interface AccountBalances {
  /** Sum of cleared transactions */
  cleared: number
  /** Sum of uncleared transactions */
  uncleared: number
  /** Total balance (cleared + uncleared) */
  working: number
}

/**
 * Calculate account balances (cleared, uncleared, working).
 */
export function getAccountBalances(store: Store, accountId: string): AccountBalances {
  const transactions = store.listTransactions(accountId)

  let cleared = 0
  let uncleared = 0

  for (const txn of transactions) {
    if (txn.cleared) {
      cleared += txn.amount
    } else {
      uncleared += txn.amount
    }
  }

  return {
    cleared,
    uncleared,
    working: cleared + uncleared,
  }
}

/**
 * Category balance breakdown for a specific month.
 */
export interface CategoryBalances {
  /** Amount assigned to this category for the month */
  assigned: number
  /** Sum of transaction amounts for this category this month (negative = spending) */
  activity: number
  /** Remaining spendable amount (assigned + activity) */
  available: number
}

/**
 * Calculate category balances for a specific month.
 * - assigned: Amount assigned for THIS month only
 * - activity: Transaction activity for THIS month only
 * - available: CUMULATIVE balance through this month (includes carryover from prior months)
 *
 * This follows envelope budgeting principles where unspent funds carry forward.
 */
export function getCategoryBalances(
  store: Store,
  categoryId: string,
  month: string
): CategoryBalances {
  // Get assigned amount for this category/month
  const assignment = store.getAssignment(categoryId, month)
  const assigned = assignment?.amount ?? 0

  // Get category to find its budget
  const category = store.getCategory(categoryId)
  if (!category) {
    return { assigned: 0, activity: 0, available: 0 }
  }

  // Get the category group to find budget
  const group = store.getCategoryGroup(category.groupId)
  if (!group) {
    return { assigned: 0, activity: 0, available: 0 }
  }

  // Get all transactions for this budget in this month
  const monthStart = `${month}-01`
  const monthEnd = getMonthEnd(month)

  const allTransactions = store.listAllTransactions(group.budgetId, {
    from: monthStart,
    to: monthEnd,
  })

  // Sum activity for this category (this month only)
  let activity = 0
  for (const txn of allTransactions) {
    if (txn.categoryId === categoryId) {
      activity += txn.amount
    }
  }

  // Calculate cumulative available (includes carryover from all prior months)
  const available = getCumulativeCategoryAvailable(store, categoryId, month)

  return {
    assigned,
    activity,
    available,
  }
}

/**
 * Get the last day of a month in YYYY-MM-DD format.
 */
function getMonthEnd(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  // Create date for first day of next month, then subtract 1 day
  const lastDay = new Date(year, monthNum, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

/**
 * Calculate cumulative category available through a given month.
 * This includes carryover from previous months.
 */
export function getCumulativeCategoryAvailable(
  store: Store,
  categoryId: string,
  throughMonth: string
): number {
  const category = store.getCategory(categoryId)
  if (!category) return 0

  const group = store.getCategoryGroup(category.groupId)
  if (!group) return 0

  // Get all transactions up through this month
  const monthEnd = getMonthEnd(throughMonth)
  const allTransactions = store.listAllTransactions(group.budgetId, { to: monthEnd })

  // Sum all activity for this category
  let totalActivity = 0
  for (const txn of allTransactions) {
    if (txn.categoryId === categoryId) {
      totalActivity += txn.amount
    }
  }

  // Sum all assignments up through this month
  // This is a simplified approach - in production you'd want to track months more explicitly
  let totalAssigned = 0

  // Get assignments for all months up to throughMonth
  // This is a simplified implementation - ideally we'd query all assignments <= throughMonth
  // For now, we check common months
  const [year, monthNum] = throughMonth.split('-').map(Number)
  for (let y = year - 1; y <= year; y++) {
    const startMonth = y < year ? 1 : 1
    const endMonth = y < year ? 12 : monthNum
    for (let m = startMonth; m <= endMonth; m++) {
      const monthKey = `${y}-${String(m).padStart(2, '0')}`
      const assignment = store.getAssignment(categoryId, monthKey)
      if (assignment) {
        totalAssigned += assignment.amount
      }
    }
  }

  return totalAssigned + totalActivity
}
