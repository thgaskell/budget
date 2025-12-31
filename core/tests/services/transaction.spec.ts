import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '../../src/stores/memory.ts'
import { SqliteStore } from '../../src/stores/sqlite.ts'
import type { Store } from '../../src/stores/types.ts'
import { createBudget } from '../../src/schemas/budget.ts'
import { createAccount } from '../../src/schemas/account.ts'
import { createCategoryGroup } from '../../src/schemas/category-group.ts'
import { createCategory } from '../../src/schemas/category.ts'
import {
  addTransaction,
  createTransfer,
  setTransactionCleared,
  reassignTransaction,
} from '../../src/services/transaction.ts'

describe.each([
  ['MemoryStore', async () => new MemoryStore()],
  ['SqliteStore', async () => await SqliteStore.create()],
])('Transaction Service with %s', (_, createStore) => {
  let store: Store
  let budget: ReturnType<typeof createBudget>
  let account: ReturnType<typeof createAccount>
  let group: ReturnType<typeof createCategoryGroup>
  let category: ReturnType<typeof createCategory>

  beforeEach(async () => {
    store = await createStore()
    budget = createBudget({ name: 'Test' })
    account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })
    group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
    category = createCategory({ groupId: group.id, name: 'Groceries' })

    store.saveBudget(budget)
    store.saveAccount(account)
    store.saveCategoryGroup(group)
    store.saveCategory(category)
  })

  describe('addTransaction', () => {
    it('creates and saves a transaction', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        categoryId: category.id,
      })

      expect(txn.id).toBeDefined()
      expect(store.getTransaction(txn.id)).toEqual(txn)
    })

    it('accepts all optional fields', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        categoryId: category.id,
        payeeId: 'payee-1',
        memo: 'Test purchase',
        cleared: true,
      })

      expect(txn.categoryId).toBe(category.id)
      expect(txn.payeeId).toBe('payee-1')
      expect(txn.memo).toBe('Test purchase')
      expect(txn.cleared).toBe(true)
    })
  })

  describe('createTransfer', () => {
    it('creates two linked transactions for a transfer', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(from.accountId).toBe(account.id)
      expect(from.amount).toBe(-10000) // Outflow is negative
      expect(from.transferAccountId).toBe(savings.id)

      expect(to.accountId).toBe(savings.id)
      expect(to.amount).toBe(10000) // Inflow is positive
      expect(to.transferAccountId).toBe(account.id)
    })

    it('sets no category for budget-to-budget transfers', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(from.categoryId).toBeNull()
      expect(to.categoryId).toBeNull()
    })

    it('saves both transactions to the store', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(store.getTransaction(from.id)).toBeDefined()
      expect(store.getTransaction(to.id)).toBeDefined()
    })

    it('throws for invalid account IDs', () => {
      expect(() =>
        createTransfer(store, {
          fromAccountId: 'invalid',
          toAccountId: account.id,
          amount: 10000,
          date: '2024-01-15',
        })
      ).toThrow('Invalid account ID')
    })

    it('preserves memo and cleared status', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
        memo: 'Monthly savings',
        cleared: true,
      })

      expect(from.memo).toBe('Monthly savings')
      expect(from.cleared).toBe(true)
      expect(to.memo).toBe('Monthly savings')
      expect(to.cleared).toBe(true)
    })
  })

  describe('setTransactionCleared', () => {
    it('updates cleared status to true', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        cleared: false,
      })

      const updated = setTransactionCleared(store, txn.id, true)

      expect(updated?.cleared).toBe(true)
      expect(store.getTransaction(txn.id)?.cleared).toBe(true)
    })

    it('updates cleared status to false', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        cleared: true,
      })

      const updated = setTransactionCleared(store, txn.id, false)

      expect(updated?.cleared).toBe(false)
    })

    it('returns null for non-existent transaction', () => {
      const result = setTransactionCleared(store, 'non-existent', true)

      expect(result).toBeNull()
    })
  })

  describe('reassignTransaction', () => {
    it('changes transaction category', () => {
      const category2 = createCategory({ groupId: group.id, name: 'Dining' })
      store.saveCategory(category2)

      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        categoryId: category.id,
      })

      const updated = reassignTransaction(store, txn.id, category2.id)

      expect(updated?.categoryId).toBe(category2.id)
      expect(store.getTransaction(txn.id)?.categoryId).toBe(category2.id)
    })

    it('can remove category (set to null)', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        categoryId: category.id,
      })

      const updated = reassignTransaction(store, txn.id, null)

      expect(updated?.categoryId).toBeNull()
    })

    it('returns null for non-existent transaction', () => {
      const result = reassignTransaction(store, 'non-existent', category.id)

      expect(result).toBeNull()
    })
  })
})
