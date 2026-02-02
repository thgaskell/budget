import type { Database } from 'sql.js'
import type { Migration } from './types.ts'

/**
 * Initial database schema.
 * Creates all core tables for the budget application.
 */
export const migration: Migration = {
  version: 1,
  description: 'Initial database schema',

  up(db: Database): void {
    db.run(`
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

      CREATE TABLE IF NOT EXISTS month_summaries (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        month TEXT NOT NULL,
        closing_rta INTEGER NOT NULL,
        category_balances TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (budget_id) REFERENCES budgets(id),
        UNIQUE (budget_id, month)
      );

      CREATE INDEX IF NOT EXISTS idx_accounts_budget ON accounts(budget_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_categories_group ON categories(group_id);
      CREATE INDEX IF NOT EXISTS idx_category_groups_budget ON category_groups(budget_id);
      CREATE INDEX IF NOT EXISTS idx_payees_budget ON payees(budget_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_category_month ON assignments(category_id, month);
      CREATE INDEX IF NOT EXISTS idx_month_summaries_budget_month ON month_summaries(budget_id, month);
    `)
  },
}
