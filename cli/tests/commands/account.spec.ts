import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  MemoryStore,
  createBudget,
  createAccount,
  addTransaction,
  getAccountBalances,
} from '@budget/core'
import { setStore, resetStore } from '../../src/store.ts'

describe('Account Commands', () => {
  let store: MemoryStore
  let budgetId: string

  beforeEach(() => {
    store = new MemoryStore()
    setStore(store)

    const budget = createBudget({ name: 'Test Budget' })
    store.saveBudget(budget)
    budgetId = budget.id
  })

  afterEach(() => {
    resetStore()
  })

  describe('account add', () => {
    it('creates a checking account', () => {
      const account = createAccount({
        budgetId,
        name: 'Checking',
        type: 'checking',
      })
      store.saveAccount(account)

      expect(store.getAccount(account.id)).not.toBeNull()
      expect(store.getAccount(account.id)?.type).toBe('checking')
      expect(store.getAccount(account.id)?.onBudget).toBe(true)
    })

    it('creates a tracking account as off-budget', () => {
      const account = createAccount({
        budgetId,
        name: 'Investment',
        type: 'tracking',
      })
      store.saveAccount(account)

      expect(store.getAccount(account.id)?.onBudget).toBe(false)
    })

    it('creates each account type', () => {
      const types = ['checking', 'savings', 'credit', 'cash', 'tracking'] as const

      for (const type of types) {
        const account = createAccount({
          budgetId,
          name: `${type} Account`,
          type,
        })
        store.saveAccount(account)

        expect(store.getAccount(account.id)?.type).toBe(type)
      }
    })
  })

  describe('account list', () => {
    it('lists accounts for budget', () => {
      store.saveAccount(createAccount({ budgetId, name: 'Account 1', type: 'checking' }))
      store.saveAccount(createAccount({ budgetId, name: 'Account 2', type: 'savings' }))

      const accounts = store.listAccounts(budgetId)
      expect(accounts).toHaveLength(2)
    })

    it('does not include accounts from other budgets', () => {
      const otherBudget = createBudget({ name: 'Other' })
      store.saveBudget(otherBudget)

      store.saveAccount(createAccount({ budgetId, name: 'My Account', type: 'checking' }))
      store.saveAccount(
        createAccount({ budgetId: otherBudget.id, name: 'Other Account', type: 'checking' })
      )

      const accounts = store.listAccounts(budgetId)
      expect(accounts).toHaveLength(1)
      expect(accounts[0].name).toBe('My Account')
    })
  })

  describe('account show with balances', () => {
    it('calculates account balances', () => {
      const account = createAccount({ budgetId, name: 'Checking', type: 'checking' })
      store.saveAccount(account)

      // Add some transactions
      addTransaction(store, {
        accountId: account.id,
        amount: 100000, // $1000 inflow
        date: '2025-01-01',
        cleared: true,
      })

      addTransaction(store, {
        accountId: account.id,
        amount: -25000, // $250 outflow
        date: '2025-01-02',
        cleared: true,
      })

      addTransaction(store, {
        accountId: account.id,
        amount: -10000, // $100 pending outflow
        date: '2025-01-03',
        cleared: false,
      })

      const balances = getAccountBalances(store, account.id)

      expect(balances.cleared).toBe(75000) // $750
      expect(balances.uncleared).toBe(-10000) // -$100
      expect(balances.working).toBe(65000) // $650
    })
  })

  describe('account delete', () => {
    it('deletes account', () => {
      const account = createAccount({ budgetId, name: 'Delete Me', type: 'checking' })
      store.saveAccount(account)

      expect(store.getAccount(account.id)).not.toBeNull()

      store.deleteAccount(account.id)

      expect(store.getAccount(account.id)).toBeNull()
    })
  })
})
