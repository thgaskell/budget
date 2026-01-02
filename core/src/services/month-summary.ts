import type { Store } from '../stores/types.ts'
import {
  createMonthSummary,
  getMonthStart,
  getMonthEnd,
  getPreviousMonth,
  getNextMonth,
  type MonthSummary,
} from '../schemas/month-summary.ts'
import type { Assignment } from '../schemas/assignment.ts'

/**
 * Calculate the month summary for a specific month.
 * This computes the closing RTA and category balances.
 *
 * @param store - The data store
 * @param budgetId - The budget ID
 * @param month - The month in YYYY-MM format
 * @param previousSummary - The previous month's summary (null for first month)
 */
export function calculateMonthSummary(
  store: Store,
  budgetId: string,
  month: string,
  previousSummary: MonthSummary | null
): MonthSummary {
  const monthStart = getMonthStart(month)
  const monthEnd = getMonthEnd(month)

  // Get all categories for this budget
  const categories = store.listCategories(budgetId)

  // Get all on-budget accounts
  const accounts = store.listAccounts(budgetId).filter((a) => a.onBudget)

  // Calculate inflows for this month only
  let monthInflows = 0
  for (const account of accounts) {
    const transactions = store.listTransactions(account.id, {
      from: monthStart,
      to: monthEnd,
    })
    for (const txn of transactions) {
      if (txn.amount > 0) {
        monthInflows += txn.amount
      }
    }
  }

  // Calculate assignments for this month only
  let monthAssignments = 0
  for (const category of categories) {
    const assignment = store.getAssignment(category.id, month)
    if (assignment) {
      monthAssignments += assignment.amount
    }
  }

  // Opening RTA = previous month's closing RTA (or 0 for first month)
  const openingRTA = previousSummary?.closingRTA ?? 0

  // Closing RTA = Opening RTA + Month Inflows - Month Assignments
  const closingRTA = openingRTA + monthInflows - monthAssignments

  // Calculate category balances
  // Get all transactions for this month
  const allTransactions = store.listAllTransactions(budgetId, {
    from: monthStart,
    to: monthEnd,
  })

  const categoryBalances: Record<string, number> = {}

  for (const category of categories) {
    // Opening balance = previous month's closing balance (or 0)
    const openingBalance = previousSummary?.categoryBalances[category.id] ?? 0

    // This month's assignment
    const assignment = store.getAssignment(category.id, month)
    const monthAssigned = assignment?.amount ?? 0

    // This month's activity (spending/income in this category)
    let monthActivity = 0
    for (const txn of allTransactions) {
      if (txn.categoryId === category.id) {
        monthActivity += txn.amount
      }
    }

    // Closing balance = opening + assigned + activity
    categoryBalances[category.id] = openingBalance + monthAssigned + monthActivity
  }

  return createMonthSummary({
    budgetId,
    month,
    closingRTA,
    categoryBalances,
  })
}

/**
 * Find the earliest month with any transaction or assignment data.
 */
function findEarliestDataMonth(store: Store, budgetId: string): string | null {
  // Get all transactions and find the earliest date
  const transactions = store.listAllTransactions(budgetId)
  let earliestMonth: string | null = null

  for (const txn of transactions) {
    const txnMonth = txn.date.substring(0, 7)
    if (!earliestMonth || txnMonth < earliestMonth) {
      earliestMonth = txnMonth
    }
  }

  // Also check month summaries for earliest stored data
  const summaries = store.listMonthSummaries(budgetId)
  for (const summary of summaries) {
    if (!earliestMonth || summary.month < earliestMonth) {
      earliestMonth = summary.month
    }
  }

  return earliestMonth
}

/**
 * Get or calculate the month summary for a specific month.
 * Uses cached summary if available, otherwise calculates from previous months.
 *
 * This function uses an iterative approach to avoid stack overflow when
 * calculating many months of history.
 */
export function getOrCalculateMonthSummary(
  store: Store,
  budgetId: string,
  month: string
): MonthSummary {
  // Check if we have a cached summary
  const cached = store.getMonthSummary(budgetId, month)
  if (cached) {
    return cached
  }

  // Find the earliest month with data - this is our base case
  const earliestDataMonth = findEarliestDataMonth(store, budgetId)

  // If there's no data at all, or the requested month is before the earliest data,
  // create a zero-based summary
  if (!earliestDataMonth || month < earliestDataMonth) {
    const summary = calculateMonthSummary(store, budgetId, month, null)
    store.saveMonthSummary(summary)
    return summary
  }

  // Find the starting point: either a cached summary or the earliest data month
  let startMonth = earliestDataMonth
  let startSummary: MonthSummary | null = null

  // Check for cached summaries working backward from the requested month
  let checkMonth = month
  while (checkMonth >= earliestDataMonth) {
    const cachedCheck = store.getMonthSummary(budgetId, checkMonth)
    if (cachedCheck) {
      // Found a cached summary - we can start from the next month
      startMonth = getNextMonth(checkMonth)
      startSummary = cachedCheck
      break
    }
    checkMonth = getPreviousMonth(checkMonth)
  }

  // If we need to calculate, iterate forward from startMonth
  if (startMonth <= month) {
    let previousSummary = startSummary
    let currentMonth = startMonth

    while (currentMonth <= month) {
      // Check cache again (in case it was just calculated)
      const cached = store.getMonthSummary(budgetId, currentMonth)
      if (cached) {
        previousSummary = cached
      } else {
        const newSummary = calculateMonthSummary(store, budgetId, currentMonth, previousSummary)
        store.saveMonthSummary(newSummary)
        previousSummary = newSummary
      }
      currentMonth = getNextMonth(currentMonth)
    }

    return previousSummary!
  }

  // Shouldn't reach here, but just in case
  return calculateMonthSummary(store, budgetId, month, startSummary)
}

/**
 * Recalculate month summaries starting from a specific month.
 * This should be called when a month is modified (assignment changed, transaction added, etc.)
 *
 * @param store - The data store
 * @param budgetId - The budget ID
 * @param startMonth - The month to start recalculating from
 */
export function recalculateFromMonth(
  store: Store,
  budgetId: string,
  startMonth: string
): void {
  // Get all existing summaries to find the last month
  const allSummaries = store.listMonthSummaries(budgetId)
  const existingMonths = allSummaries.map((s) => s.month).sort()

  // Find the last month we need to update
  // This could be the current month or any future month with data
  const lastMonth = existingMonths.length > 0
    ? existingMonths[existingMonths.length - 1]
    : startMonth

  // Get the previous month's summary as the base
  const prevMonth = getPreviousMonth(startMonth)
  let previousSummary: MonthSummary | null = store.getMonthSummary(budgetId, prevMonth)

  // If no previous summary and it's not the first month, calculate it
  if (!previousSummary && prevMonth !== getPreviousMonth(prevMonth)) {
    // Check if there's any data before this month
    const earlierSummaries = allSummaries.filter((s) => s.month < startMonth)
    if (earlierSummaries.length > 0) {
      previousSummary = getOrCalculateMonthSummary(store, budgetId, prevMonth)
    }
  }

  // Recalculate from startMonth through lastMonth
  let currentMonth = startMonth
  while (currentMonth <= lastMonth) {
    const newSummary = calculateMonthSummary(store, budgetId, currentMonth, previousSummary)
    store.saveMonthSummary(newSummary)
    previousSummary = newSummary
    currentMonth = getNextMonth(currentMonth)
  }
}

/**
 * Get the Ready to Assign for a specific month using cached summaries.
 * This is more efficient than recalculating from scratch.
 */
export function getMonthReadyToAssign(
  store: Store,
  budgetId: string,
  month: string
): number {
  const summary = getOrCalculateMonthSummary(store, budgetId, month)
  return summary.closingRTA
}

/**
 * Get the available balance for a category in a specific month.
 * This uses the cached month summary for efficiency.
 */
export function getCategoryAvailableForMonth(
  store: Store,
  budgetId: string,
  categoryId: string,
  month: string
): number {
  const summary = getOrCalculateMonthSummary(store, budgetId, month)
  return summary.categoryBalances[categoryId] ?? 0
}

/**
 * Get the month data for displaying in the UI.
 * Returns opening values, this month's activity, and closing values.
 */
export interface MonthData {
  month: string
  openingRTA: number
  closingRTA: number
  categoryData: Record<
    string,
    {
      openingBalance: number
      assigned: number
      activity: number
      closingBalance: number
    }
  >
}

export function getMonthData(
  store: Store,
  budgetId: string,
  month: string
): MonthData {
  const prevMonth = getPreviousMonth(month)
  // Use getOrCalculateMonthSummary to ensure carryover is properly calculated
  const previousSummary = getOrCalculateMonthSummary(store, budgetId, prevMonth)

  const monthStart = getMonthStart(month)
  const monthEnd = getMonthEnd(month)

  const categories = store.listCategories(budgetId)
  const allTransactions = store.listAllTransactions(budgetId, {
    from: monthStart,
    to: monthEnd,
  })

  const openingRTA = previousSummary?.closingRTA ?? 0

  // Calculate inflows and assignments for this month
  const accounts = store.listAccounts(budgetId).filter((a) => a.onBudget)
  let monthInflows = 0
  for (const account of accounts) {
    const transactions = store.listTransactions(account.id, {
      from: monthStart,
      to: monthEnd,
    })
    for (const txn of transactions) {
      if (txn.amount > 0) {
        monthInflows += txn.amount
      }
    }
  }

  let monthAssignments = 0
  const categoryData: MonthData['categoryData'] = {}

  for (const category of categories) {
    const openingBalance = previousSummary?.categoryBalances[category.id] ?? 0
    const assignment = store.getAssignment(category.id, month)
    const assigned = assignment?.amount ?? 0
    monthAssignments += assigned

    let activity = 0
    for (const txn of allTransactions) {
      if (txn.categoryId === category.id) {
        activity += txn.amount
      }
    }

    categoryData[category.id] = {
      openingBalance,
      assigned,
      activity,
      closingBalance: openingBalance + assigned + activity,
    }
  }

  const closingRTA = openingRTA + monthInflows - monthAssignments

  return {
    month,
    openingRTA,
    closingRTA,
    categoryData,
  }
}

/**
 * Get the most recent assignment for each category before a given month.
 * This is useful for showing "inherited" or "placeholder" values when
 * a category doesn't have an explicit assignment for the current month.
 *
 * @param store - The data store
 * @param budgetId - The budget ID
 * @param beforeMonth - The month to look before (exclusive)
 * @returns Map of categoryId to the most recent assignment before the given month
 */
export function getLastAssignmentsBeforeMonth(
  store: Store,
  budgetId: string,
  beforeMonth: string
): Map<string, Assignment> {
  const allAssignments = store.listAllAssignmentsForBudget(budgetId)

  // Group assignments by category and find the most recent one before the given month
  const lastAssignments = new Map<string, Assignment>()

  for (const assignment of allAssignments) {
    // Only consider assignments before the given month
    if (assignment.month >= beforeMonth) continue

    const existing = lastAssignments.get(assignment.categoryId)
    // Keep the more recent assignment
    if (!existing || assignment.month > existing.month) {
      lastAssignments.set(assignment.categoryId, assignment)
    }
  }

  return lastAssignments
}
