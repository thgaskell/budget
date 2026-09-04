import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { MemoryStore, SqliteStore } from '../../src/stores/index.ts'
import type { Store, StoreExportData } from '../../src/stores/index.ts'

/**
 * `budget-v1.json` is a real schemaVersion 1 export, produced by the last core release
 * before `transferId` existed. Every budget users of the hosted webapp hold is a file
 * of this shape, so importing one unchanged is the thing that must keep working.
 *
 * The file is a fixture, not a test input to tweak: read it fresh for each test and
 * never write to it.
 */
function readFixture(): StoreExportData {
  const text = readFileSync(new URL('../fixtures/budget-v1.json', import.meta.url), 'utf8')
  return JSON.parse(text) as StoreExportData
}

/** The fixture's own view of its contents, for comparing against what was imported. */
const fixture = readFixture()
const fixtureBudget = fixture.budgets[0]

interface Backend {
  name: string
  create(): Promise<{ store: Store; dispose(): void }>
}

const backends: Backend[] = [
  {
    name: 'MemoryStore',
    create: async () => ({ store: new MemoryStore(), dispose: () => {} }),
  },
  {
    name: 'SqliteStore',
    create: async () => {
      const store = await SqliteStore.create()
      return { store, dispose: () => store.close() }
    },
  },
]

/** Transactions across every account of the budget, keyed by id. */
function importedTransactions(store: Store, budgetId: string): Map<string, unknown> {
  const byId = new Map<string, unknown>()
  for (const account of store.listAccounts(budgetId)) {
    for (const txn of store.listTransactions(account.id)) {
      byId.set(txn.id, txn)
    }
  }
  return byId
}

for (const backend of backends) {
  describe(`${backend.name} - importing a version 1 export`, () => {
    it('accepts the file unchanged', async () => {
      const { store, dispose } = await backend.create()

      expect(() => store.fromJSON(readFixture())).not.toThrow()

      dispose()
    })

    it('imports every entity in the file', async () => {
      const { store, dispose } = await backend.create()
      store.fromJSON(readFixture())

      const budgets = store.listBudgets()
      expect(budgets).toHaveLength(1)
      const budgetId = budgets[0].id

      expect(store.listAccounts(budgetId)).toHaveLength(4)
      expect(store.listCategoryGroups(budgetId)).toHaveLength(2)
      expect(store.listCategories(budgetId)).toHaveLength(4)
      expect(store.listPayees(budgetId)).toHaveLength(4)
      expect(store.listAllAssignmentsForBudget(budgetId)).toHaveLength(4)
      expect(importedTransactions(store, budgetId).size).toBe(15)

      const targets = store
        .listCategories(budgetId)
        .map((category) => store.getTarget(category.id))
        .filter((target) => target !== null)
      expect(targets).toHaveLength(2)

      dispose()
    })

    it('sets transferId to null on every transaction, pairing nothing', async () => {
      const { store, dispose } = await backend.create()
      store.fromJSON(readFixture())

      const budgetId = store.listBudgets()[0].id
      const transactions = store.listAllTransactions(budgetId)

      expect(transactions).toHaveLength(15)
      for (const txn of transactions) {
        expect(txn.transferId).toBeNull()
      }

      dispose()
    })

    it('keeps transferAccountId on all 10 transfer legs', async () => {
      const { store, dispose } = await backend.create()
      store.fromJSON(readFixture())

      const budgetId = store.listBudgets()[0].id
      const imported = importedTransactions(store, budgetId)

      const legs = fixtureBudget.transactions.filter((t) => t.transferAccountId !== null)
      expect(legs).toHaveLength(10)

      for (const leg of legs) {
        const txn = imported.get(leg.id) as { transferAccountId: string | null }
        expect(txn.transferAccountId).toBe(leg.transferAccountId)
      }

      dispose()
    })

    it('leaves every other field exactly as the file has it', async () => {
      const { store, dispose } = await backend.create()
      store.fromJSON(readFixture())

      const budgetId = store.listBudgets()[0].id

      expect(store.getBudget(budgetId)).toEqual(fixtureBudget.budget)

      for (const account of fixtureBudget.accounts) {
        expect(store.getAccount(account.id)).toEqual(account)
      }
      for (const group of fixtureBudget.categoryGroups) {
        expect(store.getCategoryGroup(group.id)).toEqual(group)
      }
      for (const category of fixtureBudget.categories) {
        expect(store.getCategory(category.id)).toEqual(category)
      }
      for (const payee of fixtureBudget.payees) {
        expect(store.getPayee(payee.id)).toEqual(payee)
      }
      for (const target of fixtureBudget.targets) {
        expect(store.getTarget(target.categoryId)).toEqual(target)
      }
      for (const assignment of fixtureBudget.assignments) {
        expect(store.getAssignment(assignment.categoryId, assignment.month)).toEqual(assignment)
      }

      // transferId is the only field the upgrade adds; everything else is the file's
      const imported = importedTransactions(store, budgetId)
      for (const txn of fixtureBudget.transactions) {
        expect(imported.get(txn.id)).toEqual({ ...txn, transferId: null })
      }

      dispose()
    })

    it('exports at the current schema version and imports that again', async () => {
      const { store, dispose } = await backend.create()
      store.fromJSON(readFixture())

      const exported = JSON.parse(JSON.stringify(store.toJSON())) as StoreExportData
      expect(exported.schemaVersion).toBe(2)
      expect(exported.schemaVersion).toBe(store.getSchemaVersion())

      const second = await backend.create()
      second.store.fromJSON(exported)

      const budgetId = second.store.listBudgets()[0].id
      const reimported = importedTransactions(second.store, budgetId)
      expect(reimported.size).toBe(15)
      for (const txn of fixtureBudget.transactions) {
        expect(reimported.get(txn.id)).toEqual({ ...txn, transferId: null })
      }
      expect(second.store.listAccounts(budgetId)).toHaveLength(4)
      expect(second.store.listCategories(budgetId)).toHaveLength(4)

      second.dispose()
      dispose()
    })

    it('does not modify the object it was handed', async () => {
      const { store, dispose } = await backend.create()
      const data = readFixture()

      store.fromJSON(data)

      expect(data).toEqual(readFixture())

      dispose()
    })

    it('rejects data from a newer schema version, saying so', async () => {
      const { store, dispose } = await backend.create()
      const fromTheFuture = { ...readFixture(), schemaVersion: 99 }

      expect(() => store.fromJSON(fromTheFuture)).toThrow(
        /schema version 99.*only supports up to version 2/s
      )

      dispose()
    })

    it('replaces whatever the store already held', async () => {
      const { store, dispose } = await backend.create()

      store.saveBudget({ id: 'stale-budget', name: 'Stale', currency: 'EUR' })
      store.fromJSON(readFixture())

      expect(store.getBudget('stale-budget')).toBeNull()
      expect(store.listBudgets()).toHaveLength(1)

      dispose()
    })
  })
}
