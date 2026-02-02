#!/usr/bin/env bun
/**
 * Cash Flow Forecast Script
 *
 * An experimental mini-budgeting script that predicts future cash flow based on
 * historical transaction data. This script analyzes spending patterns by category
 * and projects future balances.
 *
 * Usage:
 *   bun run scripts/cash-flow-forecast.ts [--budget <budget-id>] [--months <n>] [--db <path>]
 *
 * Options:
 *   --budget <id>   Specify budget ID (uses first budget if not specified)
 *   --months <n>    Number of months to forecast (default: 6)
 *   --db <path>     Path to database file (default: ./data/budget.db)
 *
 * Example:
 *   bun run scripts/cash-flow-forecast.ts --months 3
 *
 * LIMITATIONS & API IMPROVEMENT SUGGESTIONS:
 * ============================================
 *
 * 1. NO RECURRING TRANSACTION SUPPORT
 *    The core API doesn't have a concept of recurring transactions.
 *    - Current workaround: Infer recurring patterns from historical data
 *    - Suggested API addition: `RecurringTransaction` entity with fields:
 *      - frequency: 'weekly' | 'biweekly' | 'monthly' | 'yearly'
 *      - nextDate: string
 *      - amount: number
 *      - categoryId: string
 *      - payeeId: string
 *
 * 2. NO SCHEDULED TRANSACTIONS
 *    Cannot differentiate between one-time and scheduled future transactions.
 *    - Suggested API: `ScheduledTransaction` with `scheduledDate` field
 *
 * 3. LIMITED TRANSACTION METADATA
 *    Transactions don't have tags or custom fields for pattern recognition.
 *    - Suggested API: Add optional `tags: string[]` to Transaction
 *
 * 4. NO INCOME vs EXPENSE CATEGORY TYPES
 *    Categories don't distinguish between income and expense types.
 *    - Current workaround: Infer from transaction amounts (positive = income)
 *    - Suggested API: Add `type: 'income' | 'expense' | 'transfer'` to Category
 *
 * 5. NO PAYEE-CATEGORY DEFAULTS
 *    Would help with pattern recognition if we could see typical category for payee.
 *    - Suggested API: Add `defaultCategoryId` to Payee entity
 *
 * 6. MISSING BUDGET METADATA
 *    No way to set forecast preferences per budget (confidence levels, etc.)
 *    - Suggested API: Add `settings: Record<string, unknown>` to Budget
 */

import { readFileSync, existsSync } from 'node:fs'
import { parseArgs } from 'node:util'

// Core API imports
import {
  SqliteStore,
  type Store,
  type Transaction,
  type Category,
  type CategoryGroup,
  formatCurrency,
  getMonth,
  getMonthRange,
  getNextMonth,
  getPreviousMonth,
  getMonthData,
  type MonthData,
} from '../core/src/index.ts'

// =============================================================================
// Types
// =============================================================================

interface CategoryForecast {
  categoryId: string
  categoryName: string
  groupName: string
  averageMonthlySpending: number
  averageMonthlyIncome: number
  variance: number // Standard deviation - indicates predictability
  confidence: 'high' | 'medium' | 'low'
  // Detected patterns
  isRecurring: boolean
  recurringAmount: number | null
  recurringDay: number | null // Day of month if recurring
}

interface MonthForecast {
  month: string
  projectedIncome: number
  projectedExpenses: number
  projectedNetCashFlow: number
  projectedBalance: number
  warnings: string[]
  categoryBreakdown: Record<string, {
    projected: number
    confidence: 'high' | 'medium' | 'low'
  }>
}

interface ForecastReport {
  generatedAt: string
  budgetId: string
  budgetName: string
  historicalMonthsAnalyzed: number
  forecastMonths: number
  currentBalance: number
  categoryForecasts: CategoryForecast[]
  monthlyForecasts: MonthForecast[]
  summary: {
    averageMonthlyIncome: number
    averageMonthlyExpenses: number
    averageNetCashFlow: number
    lowestProjectedBalance: number
    lowestProjectedMonth: string
    warnings: string[]
  }
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Calculate the standard deviation of an array of numbers.
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2))
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(avgSquaredDiff)
}

/**
 * Detect if transactions follow a recurring pattern.
 * Returns the most common amount and day of month if detected.
 */
function detectRecurringPattern(transactions: Transaction[]): {
  isRecurring: boolean
  amount: number | null
  dayOfMonth: number | null
} {
  if (transactions.length < 3) {
    return { isRecurring: false, amount: null, dayOfMonth: null }
  }

  // Group by approximate amount (within 5% tolerance)
  const amountGroups = new Map<number, Transaction[]>()

  for (const txn of transactions) {
    const amount = Math.abs(txn.amount)
    let foundGroup = false

    for (const [groupAmount, group] of amountGroups) {
      const tolerance = groupAmount * 0.05
      if (Math.abs(amount - groupAmount) <= tolerance) {
        group.push(txn)
        foundGroup = true
        break
      }
    }

    if (!foundGroup) {
      amountGroups.set(amount, [txn])
    }
  }

  // Find the largest group
  let largestGroup: Transaction[] = []
  let commonAmount = 0

  for (const [amount, group] of amountGroups) {
    if (group.length > largestGroup.length) {
      largestGroup = group
      commonAmount = amount
    }
  }

  // Check if the largest group represents a significant portion (> 50%)
  const isRecurring = largestGroup.length >= 3 && largestGroup.length / transactions.length > 0.5

  if (!isRecurring) {
    return { isRecurring: false, amount: null, dayOfMonth: null }
  }

  // Find the most common day of month
  const dayCount = new Map<number, number>()
  for (const txn of largestGroup) {
    const day = new Date(txn.date).getDate()
    dayCount.set(day, (dayCount.get(day) || 0) + 1)
  }

  let mostCommonDay = null
  let maxCount = 0
  for (const [day, count] of dayCount) {
    if (count > maxCount) {
      maxCount = count
      mostCommonDay = day
    }
  }

  // Only consider it a recurring day if it appears in > 50% of recurring transactions
  const dayOfMonth = maxCount / largestGroup.length > 0.5 ? mostCommonDay : null

  return {
    isRecurring: true,
    amount: commonAmount,
    dayOfMonth,
  }
}

/**
 * Analyze historical data for a category and create a forecast.
 */
function analyzeCategoryHistory(
  store: Store,
  budgetId: string,
  category: Category,
  group: CategoryGroup,
  historicalMonths: string[]
): CategoryForecast {
  const monthlyTotals: number[] = []
  const allTransactions: Transaction[] = []

  for (const month of historicalMonths) {
    const monthData = getMonthData(store, budgetId, month)
    const activity = monthData.categoryData[category.id]?.activity || 0
    monthlyTotals.push(activity)

    // Collect transactions for pattern detection
    const transactions = store.listAllTransactions(budgetId, {
      from: `${month}-01`,
      to: `${month}-31`,
    })
    for (const txn of transactions) {
      if (txn.categoryId === category.id) {
        allTransactions.push(txn)
      }
    }
  }

  // Calculate averages (separate income and expenses)
  const income = monthlyTotals.filter((t) => t > 0)
  const expenses = monthlyTotals.filter((t) => t < 0).map((t) => Math.abs(t))

  const averageMonthlyIncome = income.length > 0
    ? income.reduce((a, b) => a + b, 0) / income.length
    : 0

  const averageMonthlySpending = expenses.length > 0
    ? expenses.reduce((a, b) => a + b, 0) / expenses.length
    : 0

  // Calculate variance to determine confidence
  const variance = standardDeviation(monthlyTotals.map(Math.abs))
  const avgTotal = (averageMonthlyIncome + averageMonthlySpending) / 2 || 1

  // Confidence based on coefficient of variation
  const coeffOfVariation = variance / avgTotal
  let confidence: 'high' | 'medium' | 'low'
  if (coeffOfVariation < 0.2) {
    confidence = 'high'
  } else if (coeffOfVariation < 0.5) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  // Detect recurring patterns
  const recurringPattern = detectRecurringPattern(allTransactions)

  return {
    categoryId: category.id,
    categoryName: category.name,
    groupName: group.name,
    averageMonthlySpending,
    averageMonthlyIncome,
    variance,
    confidence,
    isRecurring: recurringPattern.isRecurring,
    recurringAmount: recurringPattern.amount,
    recurringDay: recurringPattern.dayOfMonth,
  }
}

/**
 * Project a single future month based on category forecasts.
 */
function projectMonth(
  month: string,
  previousBalance: number,
  categoryForecasts: CategoryForecast[]
): MonthForecast {
  const warnings: string[] = []
  const categoryBreakdown: Record<string, { projected: number; confidence: 'high' | 'medium' | 'low' }> = {}

  let projectedIncome = 0
  let projectedExpenses = 0

  for (const forecast of categoryForecasts) {
    const netCategoryFlow = forecast.averageMonthlyIncome - forecast.averageMonthlySpending

    // Use recurring amount if detected with high confidence
    let projectedAmount: number
    if (forecast.isRecurring && forecast.recurringAmount !== null && forecast.confidence === 'high') {
      projectedAmount = forecast.recurringAmount * (forecast.averageMonthlyIncome > 0 ? 1 : -1)
    } else {
      projectedAmount = netCategoryFlow
    }

    categoryBreakdown[forecast.categoryId] = {
      projected: projectedAmount,
      confidence: forecast.confidence,
    }

    if (projectedAmount > 0) {
      projectedIncome += projectedAmount
    } else {
      projectedExpenses += Math.abs(projectedAmount)
    }
  }

  const projectedNetCashFlow = projectedIncome - projectedExpenses
  const projectedBalance = previousBalance + projectedNetCashFlow

  // Generate warnings
  if (projectedBalance < 0) {
    warnings.push(`CRITICAL: Projected negative balance of ${formatCurrency(projectedBalance)}`)
  } else if (projectedBalance < 50000) { // Less than $500
    warnings.push(`WARNING: Low projected balance of ${formatCurrency(projectedBalance)}`)
  }

  // Warning about low confidence projections
  const lowConfidenceCategories = categoryForecasts.filter((f) => f.confidence === 'low')
  if (lowConfidenceCategories.length > 3) {
    warnings.push(`NOTE: ${lowConfidenceCategories.length} categories have low forecast confidence`)
  }

  return {
    month,
    projectedIncome,
    projectedExpenses,
    projectedNetCashFlow,
    projectedBalance,
    warnings,
    categoryBreakdown,
  }
}

/**
 * Calculate current total balance across all accounts.
 */
function getCurrentBalance(store: Store, budgetId: string): number {
  const accounts = store.listAccounts(budgetId).filter((a) => a.onBudget)
  let total = 0

  for (const account of accounts) {
    const transactions = store.listTransactions(account.id)
    for (const txn of transactions) {
      total += txn.amount
    }
  }

  return total
}

/**
 * Generate a complete cash flow forecast.
 */
function generateForecast(
  store: Store,
  budgetId: string,
  forecastMonths: number,
  historicalMonthsToAnalyze: number = 12
): ForecastReport {
  const budget = store.getBudget(budgetId)
  if (!budget) {
    throw new Error(`Budget not found: ${budgetId}`)
  }

  // Determine current month and historical range
  const currentMonth = getMonth(new Date())
  const historicalMonths: string[] = []
  let month = getPreviousMonth(currentMonth)

  for (let i = 0; i < historicalMonthsToAnalyze; i++) {
    historicalMonths.unshift(month)
    month = getPreviousMonth(month)
  }

  // Get categories and groups
  const categories = store.listCategories(budgetId)
  const groups = store.listCategoryGroups(budgetId)
  const groupMap = new Map(groups.map((g) => [g.id, g]))

  // Analyze each category
  const categoryForecasts: CategoryForecast[] = []
  for (const category of categories) {
    const group = groupMap.get(category.groupId)
    if (!group) continue

    const forecast = analyzeCategoryHistory(
      store,
      budgetId,
      category,
      group,
      historicalMonths
    )
    categoryForecasts.push(forecast)
  }

  // Get current balance
  const currentBalance = getCurrentBalance(store, budgetId)

  // Project future months
  const monthlyForecasts: MonthForecast[] = []
  let projectedBalance = currentBalance
  let forecastMonth = currentMonth

  for (let i = 0; i < forecastMonths; i++) {
    forecastMonth = i === 0 ? currentMonth : getNextMonth(forecastMonth)
    const monthForecast = projectMonth(forecastMonth, projectedBalance, categoryForecasts)
    monthlyForecasts.push(monthForecast)
    projectedBalance = monthForecast.projectedBalance
  }

  // Calculate summary statistics
  const totalIncome = categoryForecasts.reduce((sum, f) => sum + f.averageMonthlyIncome, 0)
  const totalExpenses = categoryForecasts.reduce((sum, f) => sum + f.averageMonthlySpending, 0)

  // Find lowest projected balance
  let lowestBalance = currentBalance
  let lowestMonth = currentMonth
  for (const forecast of monthlyForecasts) {
    if (forecast.projectedBalance < lowestBalance) {
      lowestBalance = forecast.projectedBalance
      lowestMonth = forecast.month
    }
  }

  // Collect all warnings
  const allWarnings: string[] = []
  for (const forecast of monthlyForecasts) {
    allWarnings.push(...forecast.warnings)
  }

  // Add overall warnings
  if (lowestBalance < 0) {
    allWarnings.unshift(`Budget projected to go negative in ${lowestMonth}`)
  }

  const lowConfidenceCount = categoryForecasts.filter((f) => f.confidence === 'low').length
  if (lowConfidenceCount / categoryForecasts.length > 0.5) {
    allWarnings.push('Over 50% of categories have low forecast confidence - consider more data')
  }

  return {
    generatedAt: new Date().toISOString(),
    budgetId,
    budgetName: budget.name,
    historicalMonthsAnalyzed: historicalMonths.length,
    forecastMonths,
    currentBalance,
    categoryForecasts,
    monthlyForecasts,
    summary: {
      averageMonthlyIncome: totalIncome,
      averageMonthlyExpenses: totalExpenses,
      averageNetCashFlow: totalIncome - totalExpenses,
      lowestProjectedBalance: lowestBalance,
      lowestProjectedMonth: lowestMonth,
      warnings: [...new Set(allWarnings)], // Deduplicate
    },
  }
}

// =============================================================================
// Report Formatting
// =============================================================================

function formatMonth(month: string): string {
  const [year, monthNum] = month.split('-')
  const date = new Date(parseInt(year), parseInt(monthNum) - 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function printReport(report: ForecastReport): void {
  const line = '='.repeat(70)
  const thinLine = '-'.repeat(70)

  console.log('')
  console.log(line)
  console.log('                     CASH FLOW FORECAST REPORT')
  console.log(line)
  console.log('')
  console.log(`Budget:          ${report.budgetName}`)
  console.log(`Generated:       ${new Date(report.generatedAt).toLocaleString()}`)
  console.log(`Historical Data: ${report.historicalMonthsAnalyzed} months analyzed`)
  console.log(`Forecast Period: ${report.forecastMonths} months`)
  console.log('')

  // Summary
  console.log(thinLine)
  console.log('SUMMARY')
  console.log(thinLine)
  console.log(`Current Balance:       ${formatCurrency(report.currentBalance)}`)
  console.log(`Avg Monthly Income:    ${formatCurrency(report.summary.averageMonthlyIncome)}`)
  console.log(`Avg Monthly Expenses:  ${formatCurrency(report.summary.averageMonthlyExpenses)}`)
  console.log(`Avg Net Cash Flow:     ${formatCurrency(report.summary.averageNetCashFlow)}`)
  console.log(`Lowest Projected:      ${formatCurrency(report.summary.lowestProjectedBalance)} (${formatMonth(report.summary.lowestProjectedMonth)})`)
  console.log('')

  // Warnings
  if (report.summary.warnings.length > 0) {
    console.log(thinLine)
    console.log('WARNINGS')
    console.log(thinLine)
    for (const warning of report.summary.warnings) {
      console.log(`  ! ${warning}`)
    }
    console.log('')
  }

  // Monthly Forecast Table
  console.log(thinLine)
  console.log('MONTHLY FORECAST')
  console.log(thinLine)
  console.log(
    'Month'.padEnd(12) +
    'Income'.padStart(14) +
    'Expenses'.padStart(14) +
    'Net'.padStart(14) +
    'Balance'.padStart(14)
  )
  console.log('-'.repeat(68))

  for (const month of report.monthlyForecasts) {
    const indicator = month.projectedBalance < 0 ? ' !' : '  '
    console.log(
      formatMonth(month.month).padEnd(12) +
      formatCurrency(month.projectedIncome).padStart(14) +
      formatCurrency(month.projectedExpenses).padStart(14) +
      formatCurrency(month.projectedNetCashFlow).padStart(14) +
      formatCurrency(month.projectedBalance).padStart(14) +
      indicator
    )
  }
  console.log('')

  // Top Expense Categories
  console.log(thinLine)
  console.log('TOP EXPENSE CATEGORIES (by average monthly spending)')
  console.log(thinLine)

  const topExpenses = [...report.categoryForecasts]
    .filter((f) => f.averageMonthlySpending > 0)
    .sort((a, b) => b.averageMonthlySpending - a.averageMonthlySpending)
    .slice(0, 10)

  console.log(
    'Category'.padEnd(25) +
    'Group'.padEnd(15) +
    'Avg/Mo'.padStart(12) +
    'Confidence'.padStart(12) +
    'Recurring'.padStart(10)
  )
  console.log('-'.repeat(74))

  for (const cat of topExpenses) {
    console.log(
      cat.categoryName.slice(0, 24).padEnd(25) +
      cat.groupName.slice(0, 14).padEnd(15) +
      formatCurrency(cat.averageMonthlySpending).padStart(12) +
      cat.confidence.padStart(12) +
      (cat.isRecurring ? 'Yes' : 'No').padStart(10)
    )
  }
  console.log('')

  // Income Sources
  const incomeSources = report.categoryForecasts.filter((f) => f.averageMonthlyIncome > 0)
  if (incomeSources.length > 0) {
    console.log(thinLine)
    console.log('INCOME SOURCES')
    console.log(thinLine)

    console.log(
      'Category'.padEnd(25) +
      'Group'.padEnd(15) +
      'Avg/Mo'.padStart(12) +
      'Confidence'.padStart(12) +
      'Recurring'.padStart(10)
    )
    console.log('-'.repeat(74))

    for (const cat of incomeSources.sort((a, b) => b.averageMonthlyIncome - a.averageMonthlyIncome)) {
      console.log(
        cat.categoryName.slice(0, 24).padEnd(25) +
        cat.groupName.slice(0, 14).padEnd(15) +
        formatCurrency(cat.averageMonthlyIncome).padStart(12) +
        cat.confidence.padStart(12) +
        (cat.isRecurring ? 'Yes' : 'No').padStart(10)
      )
    }
    console.log('')
  }

  // Recurring Transactions Detected
  const recurring = report.categoryForecasts.filter((f) => f.isRecurring)
  if (recurring.length > 0) {
    console.log(thinLine)
    console.log('DETECTED RECURRING PATTERNS')
    console.log(thinLine)

    for (const cat of recurring) {
      const dayInfo = cat.recurringDay ? ` (typically day ${cat.recurringDay})` : ''
      const amountStr = cat.recurringAmount ? formatCurrency(cat.recurringAmount) : 'varies'
      console.log(`  - ${cat.categoryName}: ${amountStr}${dayInfo}`)
    }
    console.log('')
  }

  console.log(line)
  console.log('')
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main() {
  // Parse command line arguments
  const { values } = parseArgs({
    options: {
      budget: { type: 'string', short: 'b' },
      months: { type: 'string', short: 'm', default: '6' },
      db: { type: 'string', short: 'd', default: './data/budget.db' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    console.log(`
Cash Flow Forecast Script
=========================

Analyzes historical transaction data to predict future cash flow.

Usage:
  bun run scripts/cash-flow-forecast.ts [options]

Options:
  -b, --budget <id>   Budget ID to analyze (uses first budget if not specified)
  -m, --months <n>    Number of months to forecast (default: 6)
  -d, --db <path>     Path to database file (default: ./data/budget.db)
  --json              Output as JSON instead of formatted report
  -h, --help          Show this help message

Examples:
  bun run scripts/cash-flow-forecast.ts
  bun run scripts/cash-flow-forecast.ts --months 12
  bun run scripts/cash-flow-forecast.ts --db /path/to/budget.db --json
`)
    process.exit(0)
  }

  const dbPath = values.db as string
  const forecastMonths = parseInt(values.months as string, 10)

  // Check if database exists
  if (!existsSync(dbPath)) {
    console.error(`Error: Database file not found: ${dbPath}`)
    console.error('Use --db option to specify the database path')
    process.exit(1)
  }

  // Load database
  console.log(`Loading database from ${dbPath}...`)
  const dbData = readFileSync(dbPath)
  const store = await SqliteStore.create(dbData)

  // Get budget
  let budgetId = values.budget as string | undefined
  if (!budgetId) {
    const budgets = store.listBudgets()
    if (budgets.length === 0) {
      console.error('Error: No budgets found in database')
      process.exit(1)
    }
    budgetId = budgets[0].id
    console.log(`Using budget: ${budgets[0].name}`)
  }

  // Generate forecast
  console.log(`Generating ${forecastMonths}-month forecast...`)
  console.log('')

  try {
    const report = generateForecast(store, budgetId, forecastMonths)

    if (values.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      printReport(report)
    }
  } catch (error) {
    console.error('Error generating forecast:', error)
    process.exit(1)
  } finally {
    store.close()
  }
}

main().catch(console.error)
