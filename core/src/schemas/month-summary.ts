/**
 * MonthSummary entity - stores closing balances for a month to enable efficient
 * multi-month navigation without recalculating from scratch.
 *
 * When viewing a month, the opening values come from the previous month's closing values.
 * This allows O(1) lookups instead of O(n) iteration through all historical data.
 */
export interface MonthSummary {
  /** Unique identifier (UUID) */
  id: string
  /** Budget this summary belongs to */
  budgetId: string
  /** Month in YYYY-MM format */
  month: string
  /** Ready to Assign at end of month (closing balance) */
  closingRTA: number
  /** Available balance per category at end of month */
  categoryBalances: Record<string, number>
  /** Last updated timestamp */
  updatedAt: string
}

/**
 * Create a new MonthSummary with a unique ID.
 */
export function createMonthSummary(params: {
  budgetId: string
  month: string
  closingRTA: number
  categoryBalances: Record<string, number>
}): MonthSummary {
  return {
    id: crypto.randomUUID(),
    budgetId: params.budgetId,
    month: params.month,
    closingRTA: params.closingRTA,
    categoryBalances: params.categoryBalances,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Get the first day of a month in YYYY-MM-DD format.
 */
export function getMonthStart(month: string): string {
  return `${month}-01`
}

/**
 * Get the last day of a month in YYYY-MM-DD format.
 */
export function getMonthEnd(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNum, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

/**
 * Get the previous month in YYYY-MM format.
 */
export function getPreviousMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  if (monthNum === 1) {
    return `${year - 1}-12`
  }
  return `${year}-${String(monthNum - 1).padStart(2, '0')}`
}

/**
 * Get the next month in YYYY-MM format.
 */
export function getNextMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  if (monthNum === 12) {
    return `${year + 1}-01`
  }
  return `${year}-${String(monthNum + 1).padStart(2, '0')}`
}

/**
 * Compare two months. Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareMonths(a: string, b: string): number {
  return a.localeCompare(b)
}

/**
 * Check if month a is before month b.
 */
export function isMonthBefore(a: string, b: string): boolean {
  return compareMonths(a, b) < 0
}

/**
 * Check if month a is after month b.
 */
export function isMonthAfter(a: string, b: string): boolean {
  return compareMonths(a, b) > 0
}

/**
 * Get all months from start to end (inclusive).
 */
export function getMonthRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = []
  let current = startMonth

  while (compareMonths(current, endMonth) <= 0) {
    months.push(current)
    current = getNextMonth(current)
  }

  return months
}
