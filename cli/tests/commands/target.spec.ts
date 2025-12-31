import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  MemoryStore,
  createBudget,
  createCategory,
  createCategoryGroup,
  createTarget,
} from '@budget/core'
import { setStore, resetStore } from '../../src/store.ts'

describe('Target Commands', () => {
  let store: MemoryStore
  let budgetId: string
  let categoryId: string

  beforeEach(() => {
    store = new MemoryStore()
    setStore(store)

    const budget = createBudget({ name: 'Test Budget' })
    store.saveBudget(budget)
    budgetId = budget.id

    const group = createCategoryGroup({ budgetId, name: 'Expenses' })
    store.saveCategoryGroup(group)

    const category = createCategory({ groupId: group.id, name: 'Groceries' })
    store.saveCategory(category)
    categoryId = category.id
  })

  afterEach(() => {
    resetStore()
  })

  describe('target set', () => {
    it('sets a spending limit target', () => {
      const target = createTarget({
        categoryId,
        type: 'spending_limit',
        amount: 50000,
      })
      store.saveTarget(target)

      expect(store.getTarget(categoryId)).not.toBeNull()
      expect(store.getTarget(categoryId)?.type).toBe('spending_limit')
      expect(store.getTarget(categoryId)?.amount).toBe(50000)
    })

    it('sets a savings balance target', () => {
      const target = createTarget({
        categoryId,
        type: 'savings_balance',
        amount: 100000,
        targetDate: '2025-12-31',
      })
      store.saveTarget(target)

      expect(store.getTarget(categoryId)?.type).toBe('savings_balance')
      expect(store.getTarget(categoryId)?.targetDate).toBe('2025-12-31')
    })

    it('sets a monthly contribution target', () => {
      const target = createTarget({
        categoryId,
        type: 'monthly_contribution',
        amount: 20000,
      })
      store.saveTarget(target)

      expect(store.getTarget(categoryId)?.type).toBe('monthly_contribution')
    })

    it('updates existing target', () => {
      const target1 = createTarget({
        categoryId,
        type: 'spending_limit',
        amount: 50000,
      })
      store.saveTarget(target1)

      const target2 = createTarget({
        categoryId,
        type: 'spending_limit',
        amount: 75000,
      })
      store.saveTarget(target2)

      expect(store.getTarget(categoryId)?.amount).toBe(75000)
    })
  })

  describe('target show', () => {
    it('returns target details', () => {
      const target = createTarget({
        categoryId,
        type: 'savings_balance',
        amount: 100000,
        targetDate: '2025-06-30',
      })
      store.saveTarget(target)

      const retrieved = store.getTarget(categoryId)

      expect(retrieved).not.toBeNull()
      expect(retrieved?.type).toBe('savings_balance')
      expect(retrieved?.amount).toBe(100000)
      expect(retrieved?.targetDate).toBe('2025-06-30')
    })

    it('returns null for category without target', () => {
      expect(store.getTarget(categoryId)).toBeNull()
    })
  })

  describe('target clear', () => {
    it('removes target from category', () => {
      const target = createTarget({
        categoryId,
        type: 'spending_limit',
        amount: 50000,
      })
      store.saveTarget(target)

      expect(store.getTarget(categoryId)).not.toBeNull()

      store.deleteTarget(categoryId)

      expect(store.getTarget(categoryId)).toBeNull()
    })
  })
})
