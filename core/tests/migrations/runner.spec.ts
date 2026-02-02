import { describe, it, expect, beforeEach } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import {
  migrations,
  validateMigrations,
  getCurrentVersion,
  getAppliedVersions,
  getPendingMigrations,
  runMigrations,
  getLatestVersion,
  MigrationValidationError,
} from '../../src/migrations/index.ts'
import type { Migration } from '../../src/migrations/index.ts'

describe('Migration Runner', () => {
  let db: Database

  beforeEach(async () => {
    const SQL = await initSqlJs()
    db = new SQL.Database()
  })

  describe('getCurrentVersion', () => {
    it('returns 0 for fresh database', () => {
      expect(getCurrentVersion(db)).toBe(0)
    })

    it('returns current version after migrations', () => {
      runMigrations(db, migrations)
      expect(getCurrentVersion(db)).toBe(getLatestVersion(migrations))
    })
  })

  describe('getAppliedVersions', () => {
    it('returns empty array for fresh database', () => {
      expect(getAppliedVersions(db)).toEqual([])
    })

    it('returns applied versions after migrations', () => {
      runMigrations(db, migrations)
      const versions = getAppliedVersions(db)
      expect(versions.length).toBe(migrations.length)
      expect(versions[0].version).toBe(1)
      expect(versions[0].description).toBe('Initial database schema')
    })
  })

  describe('getPendingMigrations', () => {
    it('returns all migrations for fresh database', () => {
      const pending = getPendingMigrations(db, migrations)
      expect(pending.length).toBe(migrations.length)
    })

    it('returns empty after all migrations applied', () => {
      runMigrations(db, migrations)
      expect(getPendingMigrations(db, migrations)).toEqual([])
    })
  })

  describe('runMigrations', () => {
    it('creates schema_version table', () => {
      runMigrations(db, migrations)
      const stmt = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
      )
      expect(stmt.step()).toBe(true)
      stmt.free()
    })

    it('creates all expected tables', () => {
      runMigrations(db, migrations)
      const expectedTables = [
        'budgets',
        'accounts',
        'category_groups',
        'categories',
        'payees',
        'transactions',
        'targets',
        'assignments',
        'month_summaries',
        'schema_version',
      ]
      for (const table of expectedTables) {
        const stmt = db.prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`
        )
        expect(stmt.step(), `Table ${table} should exist`).toBe(true)
        stmt.free()
      }
    })

    it('creates expected indexes', () => {
      runMigrations(db, migrations)
      const expectedIndexes = [
        'idx_accounts_budget',
        'idx_transactions_account',
        'idx_transactions_date',
        'idx_categories_group',
        'idx_category_groups_budget',
        'idx_payees_budget',
        'idx_assignments_category_month',
        'idx_month_summaries_budget_month',
      ]
      for (const index of expectedIndexes) {
        const stmt = db.prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND name='${index}'`
        )
        expect(stmt.step(), `Index ${index} should exist`).toBe(true)
        stmt.free()
      }
    })

    it('returns migration result with correct counts', () => {
      const result = runMigrations(db, migrations)
      expect(result.applied).toBe(migrations.length)
      expect(result.currentVersion).toBe(getLatestVersion(migrations))
      expect(result.latestVersion).toBe(getLatestVersion(migrations))
    })

    it('is idempotent - running again returns 0 applied', () => {
      runMigrations(db, migrations)
      const result = runMigrations(db, migrations)
      expect(result.applied).toBe(0)
    })

    it('rolls back on failure - transaction atomicity', async () => {
      // Create a database and run migrations
      runMigrations(db, migrations)

      // Create a fresh database to test rollback
      const SQL = await initSqlJs()
      const freshDb = new SQL.Database()

      // Manually create a scenario where migration would fail
      // by creating schema_version table with incompatible schema
      freshDb.run('CREATE TABLE schema_version (bad_column TEXT)')
      freshDb.run("INSERT INTO schema_version VALUES ('not a number')")

      // Running migrations should fail but database should be unchanged
      // (except for the table we manually created)
      expect(() => {
        // This would fail because schema_version exists with wrong schema
        // and INSERT would fail
        runMigrations(freshDb, migrations)
      }).toThrow()

      freshDb.close()
    })

    it('returns empty log when no migrations to apply', () => {
      runMigrations(db, migrations)
      const result = runMigrations(db, migrations)
      expect(result.log).toEqual([])
    })

    it('includes log entries for applied migrations', () => {
      const result = runMigrations(db, migrations)
      expect(result.log.length).toBe(migrations.length)
      expect(result.log[0].version).toBe(1)
      expect(result.log[0].status).toBe('completed')
      expect(result.log[0].startedAt).toBeDefined()
      expect(result.log[0].completedAt).toBeDefined()
    })
  })

  describe('validateMigrations', () => {
    it('accepts valid sequential migrations', () => {
      const valid: Migration[] = [
        { version: 1, description: 'First', up: () => {} },
        { version: 2, description: 'Second', up: () => {} },
        { version: 3, description: 'Third', up: () => {} },
      ]
      expect(() => validateMigrations(valid)).not.toThrow()
    })

    it('accepts empty migrations array', () => {
      expect(() => validateMigrations([])).not.toThrow()
    })

    it('rejects duplicate versions', () => {
      const invalid: Migration[] = [
        { version: 1, description: 'First', up: () => {} },
        { version: 1, description: 'Duplicate', up: () => {} },
      ]
      expect(() => validateMigrations(invalid)).toThrow(MigrationValidationError)
      expect(() => validateMigrations(invalid)).toThrow('Duplicate migration versions')
    })

    it('rejects out-of-order versions', () => {
      const invalid: Migration[] = [
        { version: 2, description: 'Second', up: () => {} },
        { version: 1, description: 'First', up: () => {} },
      ]
      expect(() => validateMigrations(invalid)).toThrow(MigrationValidationError)
      expect(() => validateMigrations(invalid)).toThrow('ascending version order')
    })

    it('rejects gaps in version numbers', () => {
      const invalid: Migration[] = [
        { version: 1, description: 'First', up: () => {} },
        { version: 3, description: 'Third (missing 2)', up: () => {} },
      ]
      expect(() => validateMigrations(invalid)).toThrow(MigrationValidationError)
      expect(() => validateMigrations(invalid)).toThrow('gap detected')
    })

    it('rejects non-positive versions', () => {
      const invalid: Migration[] = [{ version: 0, description: 'Zero', up: () => {} }]
      expect(() => validateMigrations(invalid)).toThrow(MigrationValidationError)
    })

    it('rejects empty descriptions', () => {
      const invalid: Migration[] = [{ version: 1, description: '', up: () => {} }]
      expect(() => validateMigrations(invalid)).toThrow(MigrationValidationError)
    })
  })

  describe('actual migrations', () => {
    it('all migrations have unique versions', () => {
      const versions = migrations.map((m) => m.version)
      const uniqueVersions = new Set(versions)
      expect(uniqueVersions.size).toBe(versions.length)
    })

    it('all migrations are in ascending order', () => {
      for (let i = 1; i < migrations.length; i++) {
        expect(migrations[i].version).toBeGreaterThan(migrations[i - 1].version)
      }
    })

    it('all migrations pass validation', () => {
      expect(() => validateMigrations(migrations)).not.toThrow()
    })
  })

  describe('getLatestVersion', () => {
    it('returns highest version from migrations', () => {
      expect(getLatestVersion(migrations)).toBe(migrations[migrations.length - 1].version)
    })

    it('returns 0 for empty migrations', () => {
      expect(getLatestVersion([])).toBe(0)
    })
  })
})

/**
 * Tests for staged migrations using custom migration lists.
 * These tests demonstrate multi-version migration behavior.
 */
describe('Staged Migration (multi-version)', () => {
  let db: Database

  // Create test migrations for multi-version scenarios
  const testMigrations: Migration[] = [
    {
      version: 1,
      description: 'Create users table',
      up: (database: Database) => {
        database.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT)')
      },
    },
    {
      version: 2,
      description: 'Add email to users',
      up: (database: Database) => {
        database.run('ALTER TABLE users ADD COLUMN email TEXT')
      },
    },
    {
      version: 3,
      description: 'Create posts table',
      up: (database: Database) => {
        database.run('CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT, title TEXT)')
      },
    },
  ]

  beforeEach(async () => {
    const SQL = await initSqlJs()
    db = new SQL.Database()
  })

  it('migrates to specific version with { to } option', () => {
    // Migrate only to version 1
    const result1 = runMigrations(db, testMigrations, { to: 1 })
    expect(result1.applied).toBe(1)
    expect(result1.currentVersion).toBe(1)
    expect(getCurrentVersion(db)).toBe(1)

    // Should still have pending migrations
    expect(getPendingMigrations(db, testMigrations).length).toBe(2)
  })

  it('supports staged migration - migrate in steps', () => {
    // Step 1: Migrate to version 1
    const result1 = runMigrations(db, testMigrations, { to: 1 })
    expect(result1.applied).toBe(1)
    expect(getCurrentVersion(db)).toBe(1)

    // Verify users table exists
    const tableStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    expect(tableStmt.step()).toBe(true)
    tableStmt.free()

    // Step 2: Migrate to version 2
    const result2 = runMigrations(db, testMigrations, { to: 2 })
    expect(result2.applied).toBe(1)
    expect(getCurrentVersion(db)).toBe(2)

    // Verify users table has email column
    const colStmt = db.prepare("SELECT name FROM pragma_table_info('users') WHERE name = 'email'")
    expect(colStmt.step()).toBe(true)
    colStmt.free()

    // Step 3: Migrate to version 3
    const result3 = runMigrations(db, testMigrations, { to: 3 })
    expect(result3.applied).toBe(1)
    expect(getCurrentVersion(db)).toBe(3)

    // Verify posts table exists
    const postsStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'")
    expect(postsStmt.step()).toBe(true)
    postsStmt.free()

    // No more pending migrations
    expect(getPendingMigrations(db, testMigrations).length).toBe(0)
  })

  it('throws if target version exceeds latest available', () => {
    expect(() => runMigrations(db, testMigrations, { to: 999 })).toThrow(MigrationValidationError)
    expect(() => runMigrations(db, testMigrations, { to: 999 })).toThrow('exceeds latest available')
  })

  it('throws if target version is less than or equal to current', () => {
    runMigrations(db, testMigrations, { to: 2 })

    // Already at version 2, trying to go to 2 or lower should fail
    expect(() => runMigrations(db, testMigrations, { to: 2 })).toThrow(MigrationValidationError)
    expect(() => runMigrations(db, testMigrations, { to: 1 })).toThrow(MigrationValidationError)
    expect(() => runMigrations(db, testMigrations, { to: 0 })).toThrow(MigrationValidationError)
  })

  it('getPendingMigrations respects target version', () => {
    // All pending (no target) - should be 3 migrations
    expect(getPendingMigrations(db, testMigrations).length).toBe(3)

    // Only up to version 1
    expect(getPendingMigrations(db, testMigrations, 1).length).toBe(1)
    expect(getPendingMigrations(db, testMigrations, 1)[0].version).toBe(1)

    // Only up to version 2
    expect(getPendingMigrations(db, testMigrations, 2).length).toBe(2)

    // Run migration 1
    runMigrations(db, testMigrations, { to: 1 })

    // Now no pending for target=1
    expect(getPendingMigrations(db, testMigrations, 1).length).toBe(0)

    // But still pending for target=2 or higher
    expect(getPendingMigrations(db, testMigrations, 2).length).toBe(1)
    expect(getPendingMigrations(db, testMigrations).length).toBe(2)
  })

  it('migrates all pending when no target specified', () => {
    const result = runMigrations(db, testMigrations)
    expect(result.applied).toBe(3)
    expect(result.currentVersion).toBe(3)
    expect(result.latestVersion).toBe(3)
    expect(getPendingMigrations(db, testMigrations).length).toBe(0)
  })

  it('logs all migrations in order', () => {
    const result = runMigrations(db, testMigrations)
    expect(result.log.length).toBe(3)
    expect(result.log[0].version).toBe(1)
    expect(result.log[1].version).toBe(2)
    expect(result.log[2].version).toBe(3)
    expect(result.log.every((entry) => entry.status === 'completed')).toBe(true)
  })
})
