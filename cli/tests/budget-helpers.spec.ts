import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryStore, createBudget } from '@budget/core'
import { setStore, resetStore } from '../src/store.ts'
import { requireBudgetId } from '../src/budget-helpers.ts'

describe('Budget Helpers', () => {
  let store: MemoryStore

  beforeEach(() => {
    store = new MemoryStore()
    setStore(store)
  })

  afterEach(() => {
    resetStore()
  })

  describe('requireBudgetId', () => {
    it('returns the budget ID when a budget exists', () => {
      const budget = createBudget({ name: 'Test Budget' })
      store.saveBudget(budget)

      expect(requireBudgetId()).toBe(budget.id)
    })

    it('throws when no budgets exist', () => {
      expect(() => requireBudgetId()).toThrow(
        'No budget found in this file. Use "budget create <name>" to create one.'
      )
    })
  })
})
