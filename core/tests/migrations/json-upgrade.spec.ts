import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  migrations,
  upgradeExportData,
  validateMigrations,
  getLatestVersion,
  MigrationValidationError,
} from '../../src/migrations/index.ts'
import type { Migration, JsonExportData } from '../../src/migrations/index.ts'

function readFixture(): JsonExportData {
  const text = readFileSync(new URL('../fixtures/budget-v1.json', import.meta.url), 'utf8')
  return JSON.parse(text) as JsonExportData
}

/** A minimal well-formed document at the given schema version. */
function emptyDocument(schemaVersion: number): JsonExportData {
  return { version: '1.0', schemaVersion, exportedAt: '2026-08-15T12:00:00.000Z', budgets: [] }
}

describe('upgradeExportData', () => {
  it('brings a version 1 document up to the latest schema version', () => {
    const upgraded = upgradeExportData(readFixture(), migrations)

    expect(upgraded.schemaVersion).toBe(getLatestVersion(migrations))
    expect(upgraded.schemaVersion).toBe(2)
  })

  it('adds transferId: null to every transaction and pairs nothing', () => {
    const upgraded = upgradeExportData(readFixture(), migrations)
    const transactions = upgraded.budgets[0].transactions as Array<Record<string, unknown>>

    expect(transactions).toHaveLength(15)
    for (const txn of transactions) {
      expect(txn).toHaveProperty('transferId')
      expect(txn.transferId).toBeNull()
    }
  })

  it('leaves the two identical same-day transfers unpaired, like every other leg', () => {
    const upgraded = upgradeExportData(readFixture(), migrations)
    const transactions = upgraded.budgets[0].transactions as Array<Record<string, unknown>>

    // The $50 Checking -> Savings pairs of 2026-08-10 differ in nothing but their ids:
    // an upgrade that guessed would have to guess here, and it must not
    const ambiguous = transactions.filter(
      (txn) => txn.date === '2026-08-10' && Math.abs(txn.amount as number) === 5000
    )
    expect(ambiguous).toHaveLength(4)
    for (const txn of ambiguous) {
      expect(txn.transferId).toBeNull()
      expect(txn.transferAccountId).not.toBeNull()
    }
  })

  it('changes nothing else about the document', () => {
    const original = readFixture()
    const upgraded = upgradeExportData(readFixture(), migrations)

    expect(upgraded.version).toBe(original.version)
    expect(upgraded.exportedAt).toBe(original.exportedAt)
    expect(upgraded.budgets).toHaveLength(1)

    const before = original.budgets[0]
    const after = upgraded.budgets[0]
    expect(after.budget).toEqual(before.budget)
    expect(after.accounts).toEqual(before.accounts)
    expect(after.categoryGroups).toEqual(before.categoryGroups)
    expect(after.categories).toEqual(before.categories)
    expect(after.payees).toEqual(before.payees)
    expect(after.targets).toEqual(before.targets)
    expect(after.assignments).toEqual(before.assignments)
    expect(after.monthSummaries).toEqual(before.monthSummaries)

    const transactionsBefore = before.transactions as Array<Record<string, unknown>>
    const transactionsAfter = after.transactions as Array<Record<string, unknown>>
    expect(transactionsAfter).toEqual(
      transactionsBefore.map((txn) => ({ ...txn, transferId: null }))
    )
  })

  it('does not mutate the document it was given', () => {
    const data = readFixture()

    upgradeExportData(data, migrations)

    expect(data).toEqual(readFixture())
  })

  it('returns a document already at the latest version unchanged', () => {
    const current = emptyDocument(getLatestVersion(migrations))

    expect(upgradeExportData(current, migrations)).toEqual(current)
  })

  it('rejects a document from a newer schema version and says that is why', () => {
    expect(() => upgradeExportData(emptyDocument(99), migrations)).toThrow(
      /schema version 99.*only supports up to version 2.*update to a newer version/is
    )
  })

  it('rejects a schema version that is not a positive integer', () => {
    expect(() => upgradeExportData(emptyDocument(0), migrations)).toThrow(/positive integer/)
    expect(() => upgradeExportData(emptyDocument(1.5), migrations)).toThrow(/positive integer/)
  })

  it('applies each intervening migration in order', () => {
    const applied: number[] = []
    const stub = (version: number): Migration => ({
      version,
      description: `stub ${version}`,
      up: () => {},
      upgradeJson: (data) => {
        applied.push(version)
        return data
      },
    })

    const upgraded = upgradeExportData(emptyDocument(1), [stub(1), stub(2), stub(3), stub(4)])

    expect(applied).toEqual([2, 3, 4])
    expect(upgraded.schemaVersion).toBe(4)
  })
})

describe('SQL/JSON migration drift guard', () => {
  it('every shipped migration carries a JSON counterpart', () => {
    expect(migrations.length).toBeGreaterThan(0)
    for (const migration of migrations) {
      expect(typeof migration.upgradeJson).toBe('function')
    }
  })

  it('rejects a migration that changes SQL only', () => {
    const sqlOnly = {
      version: 1,
      description: 'adds a column and forgets every exported file',
      up: () => {},
    } as unknown as Migration

    expect(() => validateMigrations([sqlOnly])).toThrow(MigrationValidationError)
    expect(() => validateMigrations([sqlOnly])).toThrow(/upgradeJson/)
  })

  it('refuses to upgrade a document through migrations that have drifted', () => {
    const sqlOnly = {
      version: 1,
      description: 'adds a column and forgets every exported file',
      up: () => {},
    } as unknown as Migration

    expect(() => upgradeExportData(emptyDocument(1), [sqlOnly])).toThrow(MigrationValidationError)
  })

  it('is a type error to declare a migration without a JSON counterpart', () => {
    // @ts-expect-error - Migration requires upgradeJson; `bun run typecheck` enforces it
    const sqlOnly: Migration = {
      version: 1,
      description: 'adds a column and forgets every exported file',
      up: () => {},
    }

    expect(sqlOnly.version).toBe(1)
  })
})
