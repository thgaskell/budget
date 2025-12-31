import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  MemoryStore,
  createBudget,
  createAccount,
  createCategory,
  createCategoryGroup,
  addTransaction,
  assignToCategory,
  moveBetweenCategories,
  getReadyToAssign,
  getCategoryBalances,
} from '@budget/core'
import { setStore, resetStore } from '../../src/store.ts'

describe('Assign Commands', () => {
  let store: MemoryStore
  let budgetId: string
  let accountId: string
  let categoryId1: string
  let categoryId2: string

  beforeEach(() => {
    store = new MemoryStore()
    setStore(store)

    const budget = createBudget({ name: 'Test Budget' })
    store.saveBudget(budget)
    budgetId = budget.id

    const account = createAccount({ budgetId, name: 'Checking', type: 'checking' })
    store.saveAccount(account)
    accountId = account.id

    const group = createCategoryGroup({ budgetId, name: 'Expenses' })
    store.saveCategoryGroup(group)

    const category1 = createCategory({ groupId: group.id, name: 'Groceries' })
    store.saveCategory(category1)
    categoryId1 = category1.id

    const category2 = createCategory({ groupId: group.id, name: 'Utilities' })
    store.saveCategory(category2)
    categoryId2 = category2.id
  })

  afterEach(() => {
    resetStore()
  })

  describe('assign', () => {
    it('assigns money to a category', () => {
      const assignment = assignToCategory(store, categoryId1, '2025-01', 50000)

      expect(assignment.amount).toBe(50000)
      expect(assignment.categoryId).toBe(categoryId1)
      expect(assignment.month).toBe('2025-01')
    })

    it('updates existing assignment', () => {
      assignToCategory(store, categoryId1, '2025-01', 50000)
      const updated = assignToCategory(store, categoryId1, '2025-01', 75000)

      expect(updated.amount).toBe(75000)
    })
  })

  describe('move', () => {
    it('moves money between categories', () => {
      assignToCategory(store, categoryId1, '2025-01', 100000)

      const result = moveBetweenCategories(
        store,
        categoryId1,
        categoryId2,
        '2025-01',
        25000
      )

      expect(result.from.amount).toBe(75000)
      expect(result.to.amount).toBe(25000)
    })

    it('can move all money from a category', () => {
      assignToCategory(store, categoryId1, '2025-01', 50000)

      const result = moveBetweenCategories(
        store,
        categoryId1,
        categoryId2,
        '2025-01',
        50000
      )

      expect(result.from.amount).toBe(0)
      expect(result.to.amount).toBe(50000)
    })
  })

  describe('available (Ready to Assign)', () => {
    it('returns zero when no transactions or assignments', () => {
      const available = getReadyToAssign(store, budgetId, '2025-01')
      expect(available).toBe(0)
    })

    it('returns income minus assigned', () => {
      // Add income
      addTransaction(store, {
        accountId,
        amount: 300000, // $3000 income
        date: '2025-01-01',
      })

      // Assign some
      assignToCategory(store, categoryId1, '2025-01', 100000)
      assignToCategory(store, categoryId2, '2025-01', 50000)

      const available = getReadyToAssign(store, budgetId, '2025-01')
      expect(available).toBe(150000) // $1500 remaining
    })

    it('returns zero when fully assigned', () => {
      addTransaction(store, {
        accountId,
        amount: 100000,
        date: '2025-01-01',
      })

      assignToCategory(store, categoryId1, '2025-01', 100000)

      const available = getReadyToAssign(store, budgetId, '2025-01')
      expect(available).toBe(0)
    })

    it('returns negative when over-assigned', () => {
      addTransaction(store, {
        accountId,
        amount: 100000,
        date: '2025-01-01',
      })

      assignToCategory(store, categoryId1, '2025-01', 150000)

      const available = getReadyToAssign(store, budgetId, '2025-01')
      expect(available).toBe(-50000)
    })
  })

  describe('status (category balances)', () => {
    it('shows assigned, activity, and available', () => {
      // Add income and assign
      addTransaction(store, {
        accountId,
        amount: 200000,
        date: '2025-01-01',
      })

      assignToCategory(store, categoryId1, '2025-01', 100000)

      // Spend from category
      addTransaction(store, {
        accountId,
        amount: -30000,
        date: '2025-01-15',
        categoryId: categoryId1,
      })

      const balances = getCategoryBalances(store, categoryId1, '2025-01')

      expect(balances.assigned).toBe(100000)
      expect(balances.activity).toBe(-30000)
      expect(balances.available).toBe(70000)
    })

    it('handles category with no activity', () => {
      assignToCategory(store, categoryId1, '2025-01', 50000)

      const balances = getCategoryBalances(store, categoryId1, '2025-01')

      expect(balances.assigned).toBe(50000)
      expect(balances.activity).toBe(0)
      expect(balances.available).toBe(50000)
    })

    it('handles category with no assignment', () => {
      addTransaction(store, {
        accountId,
        amount: -25000,
        date: '2025-01-15',
        categoryId: categoryId1,
      })

      const balances = getCategoryBalances(store, categoryId1, '2025-01')

      expect(balances.assigned).toBe(0)
      expect(balances.activity).toBe(-25000)
      expect(balances.available).toBe(-25000) // Overspent
    })
  })
})
