import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  MemoryStore,
  createBudget,
  createAccount,
  createPayee,
  createCategory,
  createCategoryGroup,
  addTransaction,
} from '@budget/core'
import { setStore, resetStore } from '../../src/store.ts'

describe('Transaction Commands', () => {
  let store: MemoryStore
  let budgetId: string
  let accountId: string
  let categoryId: string
  let payeeId: string

  beforeEach(() => {
    store = new MemoryStore()
    setStore(store)

    // Set up test data
    const budget = createBudget({ name: 'Test Budget' })
    store.saveBudget(budget)
    budgetId = budget.id

    const account = createAccount({ budgetId, name: 'Checking', type: 'checking' })
    store.saveAccount(account)
    accountId = account.id

    const group = createCategoryGroup({ budgetId, name: 'Expenses' })
    store.saveCategoryGroup(group)

    const category = createCategory({ groupId: group.id, name: 'Groceries' })
    store.saveCategory(category)
    categoryId = category.id

    const payee = createPayee({ budgetId, name: 'Grocery Store' })
    store.savePayee(payee)
    payeeId = payee.id
  })

  afterEach(() => {
    resetStore()
  })

  describe('tx add', () => {
    it('creates a transaction', () => {
      const txn = addTransaction(store, {
        accountId,
        amount: -5000, // $50 outflow
        date: '2025-01-15',
        categoryId,
        payeeId,
      })

      expect(store.getTransaction(txn.id)).not.toBeNull()
      expect(store.getTransaction(txn.id)?.amount).toBe(-5000)
    })

    it('creates transaction with memo', () => {
      const txn = addTransaction(store, {
        accountId,
        amount: -5000,
        date: '2025-01-15',
        memo: 'Weekly groceries',
      })

      expect(store.getTransaction(txn.id)?.memo).toBe('Weekly groceries')
    })

    it('creates cleared transaction', () => {
      const txn = addTransaction(store, {
        accountId,
        amount: 100000,
        date: '2025-01-01',
        cleared: true,
      })

      expect(store.getTransaction(txn.id)?.cleared).toBe(true)
    })
  })

  describe('tx list', () => {
    it('lists transactions for account', () => {
      addTransaction(store, { accountId, amount: -1000, date: '2025-01-01' })
      addTransaction(store, { accountId, amount: -2000, date: '2025-01-02' })

      const txns = store.listTransactions(accountId)
      expect(txns).toHaveLength(2)
    })

    it('lists transactions with date filter', () => {
      addTransaction(store, { accountId, amount: -1000, date: '2025-01-01' })
      addTransaction(store, { accountId, amount: -2000, date: '2025-01-15' })
      addTransaction(store, { accountId, amount: -3000, date: '2025-01-31' })

      const txns = store.listTransactions(accountId, {
        from: '2025-01-10',
        to: '2025-01-20',
      })

      expect(txns).toHaveLength(1)
      expect(txns[0].amount).toBe(-2000)
    })

    it('lists all transactions for budget', () => {
      const account2 = createAccount({ budgetId, name: 'Savings', type: 'savings' })
      store.saveAccount(account2)

      addTransaction(store, { accountId, amount: -1000, date: '2025-01-01' })
      addTransaction(store, { accountId: account2.id, amount: 5000, date: '2025-01-02' })

      const txns = store.listAllTransactions(budgetId)
      expect(txns).toHaveLength(2)
    })
  })

  describe('tx show', () => {
    it('shows transaction details', () => {
      const txn = addTransaction(store, {
        accountId,
        amount: -7500,
        date: '2025-01-15',
        categoryId,
        payeeId,
        memo: 'Test memo',
        cleared: true,
      })

      const retrieved = store.getTransaction(txn.id)

      expect(retrieved).not.toBeNull()
      expect(retrieved?.amount).toBe(-7500)
      expect(retrieved?.categoryId).toBe(categoryId)
      expect(retrieved?.payeeId).toBe(payeeId)
      expect(retrieved?.memo).toBe('Test memo')
      expect(retrieved?.cleared).toBe(true)
    })
  })

  describe('tx edit', () => {
    it('updates transaction amount', () => {
      const txn = addTransaction(store, {
        accountId,
        amount: -5000,
        date: '2025-01-15',
      })

      const updated = { ...txn, amount: -7500 }
      store.saveTransaction(updated)

      expect(store.getTransaction(txn.id)?.amount).toBe(-7500)
    })

    it('updates transaction category', () => {
      const txn = addTransaction(store, {
        accountId,
        amount: -5000,
        date: '2025-01-15',
      })

      const updated = { ...txn, categoryId }
      store.saveTransaction(updated)

      expect(store.getTransaction(txn.id)?.categoryId).toBe(categoryId)
    })
  })

  describe('tx delete', () => {
    it('deletes transaction', () => {
      const txn = addTransaction(store, {
        accountId,
        amount: -5000,
        date: '2025-01-15',
      })

      expect(store.getTransaction(txn.id)).not.toBeNull()

      store.deleteTransaction(txn.id)

      expect(store.getTransaction(txn.id)).toBeNull()
    })
  })
})
