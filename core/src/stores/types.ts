import type { Account } from '../schemas/account.ts'
import type { Assignment } from '../schemas/assignment.ts'
import type { Budget } from '../schemas/budget.ts'
import type { Category } from '../schemas/category.ts'
import type { CategoryGroup } from '../schemas/category-group.ts'
import type { MonthSummary } from '../schemas/month-summary.ts'
import type { Payee } from '../schemas/payee.ts'
import type { Target } from '../schemas/target.ts'
import type { Transaction } from '../schemas/transaction.ts'

/**
 * Options for querying transactions.
 */
export interface TransactionQueryOptions {
  /** Filter transactions from this date (inclusive) */
  from?: string
  /** Filter transactions to this date (inclusive) */
  to?: string
}

/**
 * Portable export format for store data.
 * Used for cross-platform transfer (CLI ↔ Webapp).
 */
export interface StoreExportData {
  /** Export format version */
  version: string
  /** Schema version of the exported data */
  schemaVersion: number
  /** ISO timestamp when exported */
  exportedAt: string
  /** All data organized by budget */
  budgets: Array<{
    budget: Budget
    accounts: Account[]
    categoryGroups: CategoryGroup[]
    categories: Category[]
    payees: Payee[]
    transactions: Transaction[]
    targets: Target[]
    assignments: Assignment[]
    monthSummaries: MonthSummary[]
  }>
}

/**
 * Store interface - abstract data persistence layer.
 * All business logic operates through this interface.
 */
export interface Store {
  // Schema Version - all stores must track their schema version
  getSchemaVersion(): number

  // Export/Import - portable JSON format for cross-platform transfer
  toJSON(): StoreExportData
  fromJSON(data: StoreExportData): void

  // Budget
  getBudget(id: string): Budget | null
  listBudgets(): Budget[]
  saveBudget(budget: Budget): void
  deleteBudget(id: string): void

  // Account
  getAccount(id: string): Account | null
  listAccounts(budgetId: string): Account[]
  saveAccount(account: Account): void
  deleteAccount(id: string): void

  // Transaction
  getTransaction(id: string): Transaction | null
  listTransactions(accountId: string, options?: TransactionQueryOptions): Transaction[]
  listAllTransactions(budgetId: string, options?: TransactionQueryOptions): Transaction[]
  saveTransaction(transaction: Transaction): void
  deleteTransaction(id: string): void

  // Category
  getCategory(id: string): Category | null
  listCategories(budgetId: string): Category[]
  saveCategory(category: Category): void
  deleteCategory(id: string): void

  // CategoryGroup
  getCategoryGroup(id: string): CategoryGroup | null
  listCategoryGroups(budgetId: string): CategoryGroup[]
  saveCategoryGroup(group: CategoryGroup): void
  deleteCategoryGroup(id: string): void

  // Payee
  getPayee(id: string): Payee | null
  listPayees(budgetId: string): Payee[]
  savePayee(payee: Payee): void
  deletePayee(id: string): void

  // Target
  getTarget(categoryId: string): Target | null
  saveTarget(target: Target): void
  deleteTarget(categoryId: string): void

  // Assignment
  getAssignment(categoryId: string, month: string): Assignment | null
  listAssignments(budgetId: string, month: string): Assignment[]
  listAllAssignmentsForBudget(budgetId: string): Assignment[]
  saveAssignment(assignment: Assignment): void
  deleteAssignment(categoryId: string, month: string): void

  // MonthSummary
  getMonthSummary(budgetId: string, month: string): MonthSummary | null
  listMonthSummaries(budgetId: string): MonthSummary[]
  saveMonthSummary(summary: MonthSummary): void
  deleteMonthSummary(budgetId: string, month: string): void
}
