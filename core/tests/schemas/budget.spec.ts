import { describe, expect, it } from 'vitest'
import { createBudget } from '../../src/schemas/budget.ts'

describe('Budget', () => {
  describe('createBudget', () => {
    it('creates a budget with generated UUID', () => {
      const budget = createBudget({ name: 'My Budget' })

      expect(budget.id).toBeDefined()
      expect(budget.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(budget.name).toBe('My Budget')
    })

    it('defaults currency to USD', () => {
      const budget = createBudget({ name: 'My Budget' })

      expect(budget.currency).toBe('USD')
    })

    it('accepts custom currency', () => {
      const budget = createBudget({ name: 'My Budget', currency: 'EUR' })

      expect(budget.currency).toBe('EUR')
    })

    it('generates unique IDs', () => {
      const budget1 = createBudget({ name: 'Budget 1' })
      const budget2 = createBudget({ name: 'Budget 2' })

      expect(budget1.id).not.toBe(budget2.id)
    })
  })
})
