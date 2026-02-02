import initSqlJs, { type Database, type SqlValue } from 'sql.js'
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
import {
  migrations,
  runMigrations,
  getCurrentVersion,
  getLatestVersion,
  getPendingMigrations,
  getAppliedVersions,
} from '../migrations/index.ts'
import type { Migration, SchemaVersion, MigrationResult, MigrationOptions } from '../migrations/index.ts'

/**
 * SQLite store implementation using sql.js.
 * Persisted - data survives process restarts.
 *
 * Schema version behavior:
 * - New database (v0): Auto-migrates to latest version
 * - Current version (v == latest): Ready to use
 * - Older version (v < latest): Throws error - call migrate() explicitly
 * - Future version (v > latest): Throws error - update the library
 */
export class SqliteStore implements Store {
  private db: Database

  private constructor(db: Database) {
    this.db = db
  }

  /**
   * Create a new SqliteStore instance.
   * Must be called with await due to async initialization.
   *
   * Schema version handling:
   * - New database: Auto-migrates to latest
   * - Existing at latest: Ready to use
   * - Existing older: Throws - must call migrate() explicitly after handling
   * - Existing newer: Throws - data from future version
   *
   * @throws Error if schema version requires migration or is from future
   */
  static async create(data?: ArrayLike<number>): Promise<SqliteStore> {
    const SQL = await initSqlJs()
    const db = data ? new SQL.Database(data) : new SQL.Database()
    const store = new SqliteStore(db)

    const currentVersion = store.getSchemaVersion()
    const latestVersion = store.getLatestSchemaVersion()

    // New database: auto-migrate
    if (currentVersion === 0) {
      store.migrate()
      return store
    }

    // Future version: reject
    if (currentVersion > latestVersion) {
      store.close()
      throw new Error(
        `Cannot load database with schema version ${currentVersion}. ` +
        `This library only supports up to version ${latestVersion}. ` +
        `Please update to a newer version of the library.`
      )
    }

    // Older version: reject (developer must handle migration explicitly)
    if (currentVersion < latestVersion) {
      store.close()
      throw new Error(
        `Database schema version ${currentVersion} is outdated. ` +
        `Latest version is ${latestVersion}. ` +
        `Use SqliteStore.createUnmigrated() to load and then call migrate().`
      )
    }

    // Current version: ready to use
    return store
  }

  /**
   * Create a SqliteStore without version validation.
   * Use this when you need to handle migration manually.
   *
   * @example
   * ```typescript
   * const store = await SqliteStore.createUnmigrated(oldData)
   * if (store.needsMigration()) {
   *   // Prompt user, backup, etc.
   *   store.migrate()
   * }
   * ```
   */
  static async createUnmigrated(data?: ArrayLike<number>): Promise<SqliteStore> {
    const SQL = await initSqlJs()
    const db = data ? new SQL.Database(data) : new SQL.Database()
    return new SqliteStore(db)
  }

  /**
   * Run pending migrations on the database.
   * Returns a result with the number of migrations applied.
   *
   * This is the only way to apply schema changes. Migrations are atomic -
   * either all migrations in the batch succeed, or none are applied.
   *
   * @param options - Optional migration options
   * @param options.to - Target version to migrate to (defaults to latest)
   *
   * @example
   * ```typescript
   * // Migrate to latest version
   * store.migrate()
   *
   * // Migrate only to version 2
   * store.migrate({ to: 2 })
   *
   * // Staged migration with intermediate work
   * store.migrate({ to: 3 })
   * // ... do data preparation ...
   * store.migrate({ to: 5 })
   * // ... more preparation ...
   * store.migrate() // finish to latest
   * ```
   */
  migrate(options?: MigrationOptions): MigrationResult {
    return runMigrations(this.db, migrations, options)
  }

  /**
   * Check if the database needs migration.
   * Returns true if there are pending migrations to apply.
   */
  needsMigration(): boolean {
    return getPendingMigrations(this.db, migrations).length > 0
  }

  /**
   * Get the current schema version of the database.
   * Returns 0 if no migrations have been applied (new database).
   */
  getSchemaVersion(): number {
    return getCurrentVersion(this.db)
  }

  /**
   * Get the latest available schema version.
   */
  getLatestSchemaVersion(): number {
    return getLatestVersion(migrations)
  }

  /**
   * Get all pending migrations that need to be applied.
   */
  getPendingMigrations(): Migration[] {
    return getPendingMigrations(this.db, migrations)
  }

  /**
   * Get all applied schema versions.
   */
  getAppliedVersions(): SchemaVersion[] {
    return getAppliedVersions(this.db)
  }

  /**
   * Export database as binary data for persistence.
   */
  export(): Uint8Array {
    return this.db.export()
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close()
  }

  /**
   * Export store data as portable JSON format.
   * Used for cross-platform transfer (CLI ↔ Webapp).
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

        // Collect all transactions across all accounts
        const transactions: ReturnType<typeof this.listTransactions> = []
        for (const account of accounts) {
          transactions.push(...this.listTransactions(account.id))
        }

        // Collect all targets for categories
        const targets: ReturnType<typeof this.getTarget>[] = []
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
          targets: targets.filter((t): t is NonNullable<typeof t> => t !== null),
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

    // Clear existing data (in reverse dependency order)
    for (const budget of this.listBudgets()) {
      // Delete month summaries
      for (const summary of this.listMonthSummaries(budget.id)) {
        this.deleteMonthSummary(budget.id, summary.month)
      }
      // Delete assignments
      for (const assignment of this.listAllAssignmentsForBudget(budget.id)) {
        this.deleteAssignment(assignment.categoryId, assignment.month)
      }
      // Delete targets and categories
      for (const category of this.listCategories(budget.id)) {
        this.deleteTarget(category.id)
        this.deleteCategory(category.id)
      }
      // Delete category groups
      for (const group of this.listCategoryGroups(budget.id)) {
        this.deleteCategoryGroup(group.id)
      }
      // Delete transactions and accounts
      for (const account of this.listAccounts(budget.id)) {
        for (const txn of this.listTransactions(account.id)) {
          this.deleteTransaction(txn.id)
        }
        this.deleteAccount(account.id)
      }
      // Delete payees
      for (const payee of this.listPayees(budget.id)) {
        this.deletePayee(payee.id)
      }
      // Delete budget
      this.deleteBudget(budget.id)
    }

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

  private queryOne<T>(sql: string, params: SqlValue[] = []): T | null {
    const stmt = this.db.prepare(sql)
    stmt.bind(params)
    if (stmt.step()) {
      const row = stmt.getAsObject() as T
      stmt.free()
      return row
    }
    stmt.free()
    return null
  }

  private queryAll<T>(sql: string, params: SqlValue[] = []): T[] {
    const results: T[] = []
    const stmt = this.db.prepare(sql)
    stmt.bind(params)
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T)
    }
    stmt.free()
    return results
  }

  // Budget
  getBudget(id: string): Budget | null {
    const row = this.queryOne<{ id: string; name: string; currency: string }>(
      'SELECT * FROM budgets WHERE id = ?',
      [id]
    )
    return row ? { id: row.id, name: row.name, currency: row.currency } : null
  }

  listBudgets(): Budget[] {
    const rows = this.queryAll<{ id: string; name: string; currency: string }>(
      'SELECT * FROM budgets'
    )
    return rows.map((r) => ({ id: r.id, name: r.name, currency: r.currency }))
  }

  saveBudget(budget: Budget): void {
    this.db.run(
      `INSERT OR REPLACE INTO budgets (id, name, currency) VALUES (?, ?, ?)`,
      [budget.id, budget.name, budget.currency]
    )
  }

  deleteBudget(id: string): void {
    this.db.run('DELETE FROM budgets WHERE id = ?', [id])
  }

  // Account
  getAccount(id: string): Account | null {
    const row = this.queryOne<{
      id: string
      budget_id: string
      name: string
      type: string
      on_budget: number
    }>('SELECT * FROM accounts WHERE id = ?', [id])
    return row
      ? {
          id: row.id,
          budgetId: row.budget_id,
          name: row.name,
          type: row.type as Account['type'],
          onBudget: row.on_budget === 1,
        }
      : null
  }

  listAccounts(budgetId: string): Account[] {
    const rows = this.queryAll<{
      id: string
      budget_id: string
      name: string
      type: string
      on_budget: number
    }>('SELECT * FROM accounts WHERE budget_id = ?', [budgetId])
    return rows.map((r) => ({
      id: r.id,
      budgetId: r.budget_id,
      name: r.name,
      type: r.type as Account['type'],
      onBudget: r.on_budget === 1,
    }))
  }

  saveAccount(account: Account): void {
    this.db.run(
      `INSERT OR REPLACE INTO accounts (id, budget_id, name, type, on_budget) VALUES (?, ?, ?, ?, ?)`,
      [account.id, account.budgetId, account.name, account.type, account.onBudget ? 1 : 0]
    )
  }

  deleteAccount(id: string): void {
    this.db.run('DELETE FROM accounts WHERE id = ?', [id])
  }

  // Transaction
  getTransaction(id: string): Transaction | null {
    const row = this.queryOne<{
      id: string
      account_id: string
      category_id: string | null
      payee_id: string | null
      date: string
      amount: number
      cleared: number
      memo: string | null
      transfer_account_id: string | null
    }>('SELECT * FROM transactions WHERE id = ?', [id])
    return row
      ? {
          id: row.id,
          accountId: row.account_id,
          categoryId: row.category_id,
          payeeId: row.payee_id,
          date: row.date,
          amount: row.amount,
          cleared: row.cleared === 1,
          memo: row.memo,
          transferAccountId: row.transfer_account_id,
        }
      : null
  }

  listTransactions(accountId: string, options?: TransactionQueryOptions): Transaction[] {
    let query = 'SELECT * FROM transactions WHERE account_id = ?'
    const params: SqlValue[] = [accountId]

    if (options?.from) {
      query += ' AND date >= ?'
      params.push(options.from)
    }
    if (options?.to) {
      query += ' AND date <= ?'
      params.push(options.to)
    }

    query += ' ORDER BY date'

    const rows = this.queryAll<{
      id: string
      account_id: string
      category_id: string | null
      payee_id: string | null
      date: string
      amount: number
      cleared: number
      memo: string | null
      transfer_account_id: string | null
    }>(query, params)

    return rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      categoryId: r.category_id,
      payeeId: r.payee_id,
      date: r.date,
      amount: r.amount,
      cleared: r.cleared === 1,
      memo: r.memo,
      transferAccountId: r.transfer_account_id,
    }))
  }

  listAllTransactions(budgetId: string, options?: TransactionQueryOptions): Transaction[] {
    let query = `
      SELECT t.* FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.budget_id = ?
    `
    const params: SqlValue[] = [budgetId]

    if (options?.from) {
      query += ' AND t.date >= ?'
      params.push(options.from)
    }
    if (options?.to) {
      query += ' AND t.date <= ?'
      params.push(options.to)
    }

    query += ' ORDER BY t.date'

    const rows = this.queryAll<{
      id: string
      account_id: string
      category_id: string | null
      payee_id: string | null
      date: string
      amount: number
      cleared: number
      memo: string | null
      transfer_account_id: string | null
    }>(query, params)

    return rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      categoryId: r.category_id,
      payeeId: r.payee_id,
      date: r.date,
      amount: r.amount,
      cleared: r.cleared === 1,
      memo: r.memo,
      transferAccountId: r.transfer_account_id,
    }))
  }

  saveTransaction(transaction: Transaction): void {
    this.db.run(
      `INSERT OR REPLACE INTO transactions
       (id, account_id, category_id, payee_id, date, amount, cleared, memo, transfer_account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transaction.id,
        transaction.accountId,
        transaction.categoryId,
        transaction.payeeId,
        transaction.date,
        transaction.amount,
        transaction.cleared ? 1 : 0,
        transaction.memo,
        transaction.transferAccountId,
      ]
    )
  }

  deleteTransaction(id: string): void {
    this.db.run('DELETE FROM transactions WHERE id = ?', [id])
  }

  // Category
  getCategory(id: string): Category | null {
    const row = this.queryOne<{
      id: string
      group_id: string
      name: string
      sort_order: number
    }>('SELECT * FROM categories WHERE id = ?', [id])
    return row
      ? {
          id: row.id,
          groupId: row.group_id,
          name: row.name,
          sortOrder: row.sort_order,
        }
      : null
  }

  listCategories(budgetId: string): Category[] {
    const rows = this.queryAll<{
      id: string
      group_id: string
      name: string
      sort_order: number
    }>(
      `SELECT c.* FROM categories c
       JOIN category_groups g ON c.group_id = g.id
       WHERE g.budget_id = ?
       ORDER BY g.sort_order, c.sort_order`,
      [budgetId]
    )
    return rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      name: r.name,
      sortOrder: r.sort_order,
    }))
  }

  saveCategory(category: Category): void {
    this.db.run(
      `INSERT OR REPLACE INTO categories (id, group_id, name, sort_order) VALUES (?, ?, ?, ?)`,
      [category.id, category.groupId, category.name, category.sortOrder]
    )
  }

  deleteCategory(id: string): void {
    this.db.run('DELETE FROM categories WHERE id = ?', [id])
  }

  // CategoryGroup
  getCategoryGroup(id: string): CategoryGroup | null {
    const row = this.queryOne<{
      id: string
      budget_id: string
      name: string
      sort_order: number
    }>('SELECT * FROM category_groups WHERE id = ?', [id])
    return row
      ? {
          id: row.id,
          budgetId: row.budget_id,
          name: row.name,
          sortOrder: row.sort_order,
        }
      : null
  }

  listCategoryGroups(budgetId: string): CategoryGroup[] {
    const rows = this.queryAll<{
      id: string
      budget_id: string
      name: string
      sort_order: number
    }>('SELECT * FROM category_groups WHERE budget_id = ? ORDER BY sort_order', [budgetId])
    return rows.map((r) => ({
      id: r.id,
      budgetId: r.budget_id,
      name: r.name,
      sortOrder: r.sort_order,
    }))
  }

  saveCategoryGroup(group: CategoryGroup): void {
    this.db.run(
      `INSERT OR REPLACE INTO category_groups (id, budget_id, name, sort_order) VALUES (?, ?, ?, ?)`,
      [group.id, group.budgetId, group.name, group.sortOrder]
    )
  }

  deleteCategoryGroup(id: string): void {
    this.db.run('DELETE FROM category_groups WHERE id = ?', [id])
  }

  // Payee
  getPayee(id: string): Payee | null {
    const row = this.queryOne<{
      id: string
      budget_id: string
      name: string
    }>('SELECT * FROM payees WHERE id = ?', [id])
    return row
      ? {
          id: row.id,
          budgetId: row.budget_id,
          name: row.name,
        }
      : null
  }

  listPayees(budgetId: string): Payee[] {
    const rows = this.queryAll<{
      id: string
      budget_id: string
      name: string
    }>('SELECT * FROM payees WHERE budget_id = ?', [budgetId])
    return rows.map((r) => ({
      id: r.id,
      budgetId: r.budget_id,
      name: r.name,
    }))
  }

  savePayee(payee: Payee): void {
    this.db.run(`INSERT OR REPLACE INTO payees (id, budget_id, name) VALUES (?, ?, ?)`, [
      payee.id,
      payee.budgetId,
      payee.name,
    ])
  }

  deletePayee(id: string): void {
    this.db.run('DELETE FROM payees WHERE id = ?', [id])
  }

  // Target
  getTarget(categoryId: string): Target | null {
    const row = this.queryOne<{
      id: string
      category_id: string
      type: string
      amount: number
      target_date: string | null
    }>('SELECT * FROM targets WHERE category_id = ?', [categoryId])
    return row
      ? {
          id: row.id,
          categoryId: row.category_id,
          type: row.type as Target['type'],
          amount: row.amount,
          targetDate: row.target_date,
        }
      : null
  }

  saveTarget(target: Target): void {
    this.db.run(
      `INSERT OR REPLACE INTO targets (id, category_id, type, amount, target_date) VALUES (?, ?, ?, ?, ?)`,
      [target.id, target.categoryId, target.type, target.amount, target.targetDate]
    )
  }

  deleteTarget(categoryId: string): void {
    this.db.run('DELETE FROM targets WHERE category_id = ?', [categoryId])
  }

  // Assignment
  getAssignment(categoryId: string, month: string): Assignment | null {
    const row = this.queryOne<{
      id: string
      category_id: string
      month: string
      amount: number
    }>('SELECT * FROM assignments WHERE category_id = ? AND month = ?', [categoryId, month])
    return row
      ? {
          id: row.id,
          categoryId: row.category_id,
          month: row.month,
          amount: row.amount,
        }
      : null
  }

  listAssignments(budgetId: string, month: string): Assignment[] {
    const rows = this.queryAll<{
      id: string
      category_id: string
      month: string
      amount: number
    }>(
      `SELECT a.* FROM assignments a
       JOIN categories c ON a.category_id = c.id
       JOIN category_groups g ON c.group_id = g.id
       WHERE g.budget_id = ? AND a.month = ?`,
      [budgetId, month]
    )
    return rows.map((r) => ({
      id: r.id,
      categoryId: r.category_id,
      month: r.month,
      amount: r.amount,
    }))
  }

  listAllAssignmentsForBudget(budgetId: string): Assignment[] {
    const rows = this.queryAll<{
      id: string
      category_id: string
      month: string
      amount: number
    }>(
      `SELECT a.* FROM assignments a
       JOIN categories c ON a.category_id = c.id
       JOIN category_groups g ON c.group_id = g.id
       WHERE g.budget_id = ?`,
      [budgetId]
    )
    return rows.map((r) => ({
      id: r.id,
      categoryId: r.category_id,
      month: r.month,
      amount: r.amount,
    }))
  }

  saveAssignment(assignment: Assignment): void {
    this.db.run(
      `INSERT OR REPLACE INTO assignments (id, category_id, month, amount) VALUES (?, ?, ?, ?)`,
      [assignment.id, assignment.categoryId, assignment.month, assignment.amount]
    )
  }

  deleteAssignment(categoryId: string, month: string): void {
    this.db.run('DELETE FROM assignments WHERE category_id = ? AND month = ?', [
      categoryId,
      month,
    ])
  }

  // MonthSummary
  getMonthSummary(budgetId: string, month: string): MonthSummary | null {
    const row = this.queryOne<{
      id: string
      budget_id: string
      month: string
      closing_rta: number
      category_balances: string
      updated_at: string
    }>('SELECT * FROM month_summaries WHERE budget_id = ? AND month = ?', [budgetId, month])
    return row
      ? {
          id: row.id,
          budgetId: row.budget_id,
          month: row.month,
          closingRTA: row.closing_rta,
          categoryBalances: JSON.parse(row.category_balances),
          updatedAt: row.updated_at,
        }
      : null
  }

  listMonthSummaries(budgetId: string): MonthSummary[] {
    const rows = this.queryAll<{
      id: string
      budget_id: string
      month: string
      closing_rta: number
      category_balances: string
      updated_at: string
    }>('SELECT * FROM month_summaries WHERE budget_id = ? ORDER BY month', [budgetId])
    return rows.map((r) => ({
      id: r.id,
      budgetId: r.budget_id,
      month: r.month,
      closingRTA: r.closing_rta,
      categoryBalances: JSON.parse(r.category_balances),
      updatedAt: r.updated_at,
    }))
  }

  saveMonthSummary(summary: MonthSummary): void {
    this.db.run(
      `INSERT OR REPLACE INTO month_summaries
       (id, budget_id, month, closing_rta, category_balances, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        summary.id,
        summary.budgetId,
        summary.month,
        summary.closingRTA,
        JSON.stringify(summary.categoryBalances),
        summary.updatedAt,
      ]
    )
  }

  deleteMonthSummary(budgetId: string, month: string): void {
    this.db.run('DELETE FROM month_summaries WHERE budget_id = ? AND month = ?', [
      budgetId,
      month,
    ])
  }
}
