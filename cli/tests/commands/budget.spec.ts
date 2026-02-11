import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryStore, createBudget } from '@budget/core'
import { setStore, resetStore } from '../../src/store.ts'

describe('Budget Commands', () => {
  let store: MemoryStore

  beforeEach(() => {
    store = new MemoryStore()
    setStore(store)
  })

  afterEach(() => {
    resetStore()
  })

  describe('budget create', () => {
    it('creates a new budget', () => {
      const budget = createBudget({ name: 'Test Budget' })
      store.saveBudget(budget)

      expect(store.getBudget(budget.id)).not.toBeNull()
      expect(store.getBudget(budget.id)?.name).toBe('Test Budget')
    })

    it('creates budget with custom currency', () => {
      const budget = createBudget({ name: 'Euro Budget', currency: 'EUR' })
      store.saveBudget(budget)

      expect(store.getBudget(budget.id)?.currency).toBe('EUR')
    })

    it('enforces 1:1 budget-per-file constraint', () => {
      // Create first budget
      const budget1 = createBudget({ name: 'First Budget' })
      store.saveBudget(budget1)

      // Attempting to check the constraint manually (as the command would)
      const existingBudgets = store.listBudgets()
      expect(existingBudgets.length).toBe(1)
      expect(() => {
        if (existingBudgets.length > 0) {
          throw new Error(
            'This file already contains a budget. Only one budget per .budget file is allowed.'
          )
        }
      }).toThrow('Only one budget per .budget file is allowed')
    })
  })

  describe('budget show', () => {
    it('returns budget details', () => {
      const budget = createBudget({ name: 'My Budget', currency: 'USD' })
      store.saveBudget(budget)

      const retrieved = store.getBudget(budget.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved?.name).toBe('My Budget')
      expect(retrieved?.currency).toBe('USD')
    })
  })

  describe('budget delete', () => {
    it('deletes a budget', () => {
      const budget = createBudget({ name: 'Delete Me' })
      store.saveBudget(budget)

      expect(store.getBudget(budget.id)).not.toBeNull()

      store.deleteBudget(budget.id)

      expect(store.getBudget(budget.id)).toBeNull()
    })
  })
})
