import type { Account } from '../schemas/account.ts'
import type { Assignment } from '../schemas/assignment.ts'
import type { Budget } from '../schemas/budget.ts'
import type { Category } from '../schemas/category.ts'
import type { CategoryGroup } from '../schemas/category-group.ts'
import type { MonthSummary } from '../schemas/month-summary.ts'
import type { Payee } from '../schemas/payee.ts'
import type { Target } from '../schemas/target.ts'
import type { Transaction } from '../schemas/transaction.ts'
import type { Store, TransactionQueryOptions, StoreExportData } from './types.ts'
import { migrations, getLatestVersion } from '../migrations/index.ts'

/**
 * In-memory store implementation.
 * Session-scoped - data is lost when the process exits.
 * Useful for testing and temporary operations.
 */
export class MemoryStore implements Store {
  private budgets = new Map<string, Budget>()

  /**
   * Get the current schema version.
   * MemoryStore always uses the latest schema version.
   */
  getSchemaVersion(): number {
    return getLatestVersion(migrations)
  }

  /**
   * Export store data as portable JSON format.
   */
  toJSON(): StoreExportData {
    const budgets = this.listBudgets()

    return {
      version: '1.0',
      schemaVersion: this.getSchemaVersion(),
      exportedAt: new Date().toISOString(),
      budgets: budgets.map((budget) => {
        const categoryGroups = this.listCategoryGroups(budget.id)
        const categories = this.listCategories(budget.id)
        const accounts = this.listAccounts(budget.id)

        const transactions: Transaction[] = []
        for (const account of accounts) {
          transactions.push(...this.listTransactions(account.id))
        }

        const targets: Target[] = []
        for (const category of categories) {
          const target = this.getTarget(category.id)
          if (target) targets.push(target)
        }

        return {
          budget,
          accounts,
          categoryGroups,
          categories,
          payees: this.listPayees(budget.id),
          transactions,
          targets,
          assignments: this.listAllAssignmentsForBudget(budget.id),
          monthSummaries: this.listMonthSummaries(budget.id),
        }
      }),
    }
  }

  /**
   * Import data from portable JSON format.
   * Replaces all existing data in the store.
   *
   * @throws Error if schemaVersion doesn't match current version
   */
  fromJSON(data: StoreExportData): void {
    const currentVersion = this.getSchemaVersion()
    if (data.schemaVersion !== currentVersion) {
      throw new Error(
        `Cannot import data with schema version ${data.schemaVersion}. ` +
        `Store is at version ${currentVersion}. ` +
        `Migrate the data first.`
      )
    }

    // Clear existing data
    this.budgets.clear()
    this.accounts.clear()
    this.transactions.clear()
    this.categories.clear()
    this.categoryGroups.clear()
    this.payees.clear()
    this.targets.clear()
    this.assignments.clear()
    this.monthSummaries.clear()

    // Import new data
    for (const budgetData of data.budgets) {
      this.saveBudget(budgetData.budget)
      for (const account of budgetData.accounts) {
        this.saveAccount(account)
      }
      for (const group of budgetData.categoryGroups) {
        this.saveCategoryGroup(group)
      }
      for (const category of budgetData.categories) {
        this.saveCategory(category)
      }
      for (const payee of budgetData.payees) {
        this.savePayee(payee)
      }
      for (const transaction of budgetData.transactions) {
        this.saveTransaction(transaction)
      }
      for (const target of budgetData.targets) {
        this.saveTarget(target)
      }
      for (const assignment of budgetData.assignments) {
        this.saveAssignment(assignment)
      }
      for (const summary of budgetData.monthSummaries) {
        this.saveMonthSummary(summary)
      }
    }
  }

  private accounts = new Map<string, Account>()
  private transactions = new Map<string, Transaction>()
  private categories = new Map<string, Category>()
  private categoryGroups = new Map<string, CategoryGroup>()
  private payees = new Map<string, Payee>()
  private targets = new Map<string, Target>() // keyed by categoryId
  private assignments = new Map<string, Assignment>() // keyed by "categoryId:month"
  private monthSummaries = new Map<string, MonthSummary>() // keyed by "budgetId:month"

  // Budget
  getBudget(id: string): Budget | null {
    return this.budgets.get(id) ?? null
  }

  listBudgets(): Budget[] {
    return Array.from(this.budgets.values())
  }

  saveBudget(budget: Budget): void {
    this.budgets.set(budget.id, budget)
  }

  deleteBudget(id: string): void {
    this.budgets.delete(id)
  }

  // Account
  getAccount(id: string): Account | null {
    return this.accounts.get(id) ?? null
  }

  listAccounts(budgetId: string): Account[] {
    return Array.from(this.accounts.values()).filter((a) => a.budgetId === budgetId)
  }

  saveAccount(account: Account): void {
    this.accounts.set(account.id, account)
  }

  deleteAccount(id: string): void {
    this.accounts.delete(id)
  }

  // Transaction
  getTransaction(id: string): Transaction | null {
    return this.transactions.get(id) ?? null
  }

  listTransactions(accountId: string, options?: TransactionQueryOptions): Transaction[] {
    let txns = Array.from(this.transactions.values()).filter((t) => t.accountId === accountId)

    if (options?.from) {
      txns = txns.filter((t) => t.date >= options.from!)
    }
    if (options?.to) {
      txns = txns.filter((t) => t.date <= options.to!)
    }

    return txns.sort((a, b) => a.date.localeCompare(b.date))
  }

  listAllTransactions(budgetId: string, options?: TransactionQueryOptions): Transaction[] {
    const accountIds = new Set(this.listAccounts(budgetId).map((a) => a.id))
    let txns = Array.from(this.transactions.values()).filter((t) => accountIds.has(t.accountId))

    if (options?.from) {
      txns = txns.filter((t) => t.date >= options.from!)
    }
    if (options?.to) {
      txns = txns.filter((t) => t.date <= options.to!)
    }

    return txns.sort((a, b) => a.date.localeCompare(b.date))
  }

  saveTransaction(transaction: Transaction): void {
    this.transactions.set(transaction.id, transaction)
  }

  deleteTransaction(id: string): void {
    this.transactions.delete(id)
  }

  // Category
  getCategory(id: string): Category | null {
    return this.categories.get(id) ?? null
  }

  listCategories(budgetId: string): Category[] {
    const groupIds = new Set(this.listCategoryGroups(budgetId).map((g) => g.id))
    return Array.from(this.categories.values())
      .filter((c) => groupIds.has(c.groupId))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }

  saveCategory(category: Category): void {
    this.categories.set(category.id, category)
  }

  deleteCategory(id: string): void {
    this.categories.delete(id)
  }

  // CategoryGroup
  getCategoryGroup(id: string): CategoryGroup | null {
    return this.categoryGroups.get(id) ?? null
  }

  listCategoryGroups(budgetId: string): CategoryGroup[] {
    return Array.from(this.categoryGroups.values())
      .filter((g) => g.budgetId === budgetId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }

  saveCategoryGroup(group: CategoryGroup): void {
    this.categoryGroups.set(group.id, group)
  }

  deleteCategoryGroup(id: string): void {
    this.categoryGroups.delete(id)
  }

  // Payee
  getPayee(id: string): Payee | null {
    return this.payees.get(id) ?? null
  }

  listPayees(budgetId: string): Payee[] {
    return Array.from(this.payees.values()).filter((p) => p.budgetId === budgetId)
  }

  savePayee(payee: Payee): void {
    this.payees.set(payee.id, payee)
  }

  deletePayee(id: string): void {
    this.payees.delete(id)
  }

  // Target
  getTarget(categoryId: string): Target | null {
    return this.targets.get(categoryId) ?? null
  }

  saveTarget(target: Target): void {
    this.targets.set(target.categoryId, target)
  }

  deleteTarget(categoryId: string): void {
    this.targets.delete(categoryId)
  }

  // Assignment
  private assignmentKey(categoryId: string, month: string): string {
    return `${categoryId}:${month}`
  }

  getAssignment(categoryId: string, month: string): Assignment | null {
    return this.assignments.get(this.assignmentKey(categoryId, month)) ?? null
  }

  listAssignments(budgetId: string, month: string): Assignment[] {
    const categoryIds = new Set(this.listCategories(budgetId).map((c) => c.id))
    return Array.from(this.assignments.values()).filter(
      (a) => categoryIds.has(a.categoryId) && a.month === month
    )
  }

  listAllAssignmentsForBudget(budgetId: string): Assignment[] {
    const categoryIds = new Set(this.listCategories(budgetId).map((c) => c.id))
    return Array.from(this.assignments.values()).filter(
      (a) => categoryIds.has(a.categoryId)
    )
  }

  saveAssignment(assignment: Assignment): void {
    this.assignments.set(this.assignmentKey(assignment.categoryId, assignment.month), assignment)
  }

  deleteAssignment(categoryId: string, month: string): void {
    this.assignments.delete(this.assignmentKey(categoryId, month))
  }

  // MonthSummary
  private monthSummaryKey(budgetId: string, month: string): string {
    return `${budgetId}:${month}`
  }

  getMonthSummary(budgetId: string, month: string): MonthSummary | null {
    return this.monthSummaries.get(this.monthSummaryKey(budgetId, month)) ?? null
  }

  listMonthSummaries(budgetId: string): MonthSummary[] {
    return Array.from(this.monthSummaries.values())
      .filter((s) => s.budgetId === budgetId)
      .sort((a, b) => a.month.localeCompare(b.month))
  }

  saveMonthSummary(summary: MonthSummary): void {
    this.monthSummaries.set(this.monthSummaryKey(summary.budgetId, summary.month), summary)
  }

  deleteMonthSummary(budgetId: string, month: string): void {
    this.monthSummaries.delete(this.monthSummaryKey(budgetId, month))
  }
}
