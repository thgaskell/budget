import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import type { Account } from '../schemas/account.ts'
import type { Assignment } from '../schemas/assignment.ts'
import type { Budget } from '../schemas/budget.ts'
import type { Category } from '../schemas/category.ts'
import type { CategoryGroup } from '../schemas/category-group.ts'
import type { Payee } from '../schemas/payee.ts'
import type { Target } from '../schemas/target.ts'
import type { Transaction } from '../schemas/transaction.ts'
import type { Store, TransactionQueryOptions } from './types.ts'

/**
 * SQLite store implementation using sql.js.
 * Persisted - data survives process restarts.
 */
export class SqliteStore implements Store {
  private db: Database

  private constructor(db: Database) {
    this.db = db
    this.initSchema()
  }

  /**
   * Create a new SqliteStore instance.
   * Must be called with await due to async initialization.
   */
  static async create(data?: ArrayLike<number>): Promise<SqliteStore> {
    const SQL = await initSqlJs()
    const db = data ? new SQL.Database(data) : new SQL.Database()
    return new SqliteStore(db)
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD'
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        on_budget INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (budget_id) REFERENCES budgets(id)
      );

      CREATE TABLE IF NOT EXISTS category_groups (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (budget_id) REFERENCES budgets(id)
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (group_id) REFERENCES category_groups(id)
      );

      CREATE TABLE IF NOT EXISTS payees (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY (budget_id) REFERENCES budgets(id)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        category_id TEXT,
        payee_id TEXT,
        date TEXT NOT NULL,
        amount INTEGER NOT NULL,
        cleared INTEGER NOT NULL DEFAULT 0,
        memo TEXT,
        transfer_account_id TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        FOREIGN KEY (category_id) REFERENCES categories(id),
        FOREIGN KEY (payee_id) REFERENCES payees(id),
        FOREIGN KEY (transfer_account_id) REFERENCES accounts(id)
      );

      CREATE TABLE IF NOT EXISTS targets (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        target_date TEXT,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL,
        month TEXT NOT NULL,
        amount INTEGER NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id),
        UNIQUE (category_id, month)
      );

      CREATE INDEX IF NOT EXISTS idx_accounts_budget ON accounts(budget_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_categories_group ON categories(group_id);
      CREATE INDEX IF NOT EXISTS idx_category_groups_budget ON category_groups(budget_id);
      CREATE INDEX IF NOT EXISTS idx_payees_budget ON payees(budget_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_category_month ON assignments(category_id, month);
    `)
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
}
