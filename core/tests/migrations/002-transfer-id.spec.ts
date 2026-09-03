import { describe, it, expect, beforeEach } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { migrations, runMigrations, getCurrentVersion } from '../../src/migrations/index.ts'
import { SqliteStore } from '../../src/stores/sqlite.ts'

/**
 * A database as it stood before transfers recorded their partner's id: schema v1, with
 * a transfer pair that is only marked as such by transfer_account_id on each leg.
 */
function seedVersion1(db: Database): { outflowId: string; inflowId: string } {
  runMigrations(db, migrations, { to: 1 })

  db.run(`INSERT INTO budgets (id, name, currency) VALUES ('budget-1', 'Household', 'USD')`)
  db.run(
    `INSERT INTO accounts (id, budget_id, name, type, on_budget) VALUES
       ('acc-checking', 'budget-1', 'Checking', 'checking', 1),
       ('acc-savings', 'budget-1', 'Savings', 'savings', 1)`
  )
  db.run(
    `INSERT INTO transactions (id, account_id, category_id, payee_id, date, amount, cleared, memo, transfer_account_id) VALUES
       ('txn-out', 'acc-checking', NULL, NULL, '2024-01-10', -5000, 0, NULL, 'acc-savings'),
       ('txn-in', 'acc-savings', NULL, NULL, '2024-01-10', 5000, 0, NULL, 'acc-checking')`
  )

  return { outflowId: 'txn-out', inflowId: 'txn-in' }
}

describe('Migration 002 - record the transfer partner by transaction id', () => {
  let db: Database

  beforeEach(async () => {
    const SQL = await initSqlJs()
    db = new SQL.Database()
  })

  it('adds transfer_id to a version 1 database and leaves it null on every row', () => {
    const { outflowId, inflowId } = seedVersion1(db)
    expect(getCurrentVersion(db)).toBe(1)

    runMigrations(db, migrations)

    expect(getCurrentVersion(db)).toBe(2)

    const stmt = db.prepare('SELECT id, transfer_account_id, transfer_id FROM transactions')
    const rows: Record<string, unknown>[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()

    // The pair keeps its transfer markers, so the budget rules still treat both legs as
    // a transfer - but which row the partner is was never recorded, and the migration
    // does not guess it from the mirrored amount, shared date or matching accounts
    expect(rows).toEqual([
      { id: outflowId, transfer_account_id: 'acc-savings', transfer_id: null },
      { id: inflowId, transfer_account_id: 'acc-checking', transfer_id: null },
    ])
  })

  it('leaves a migrated leg readable through the store with transferId null', async () => {
    const { outflowId } = seedVersion1(db)
    const data = db.export()
    db.close()

    const store = await SqliteStore.createUnmigrated(data)
    expect(store.needsMigration()).toBe(true)
    store.migrate()

    const outflow = store.getTransaction(outflowId)
    expect(outflow?.transferAccountId).toBe('acc-savings')
    expect(outflow?.transferId).toBeNull()

    store.close()
  })
})
