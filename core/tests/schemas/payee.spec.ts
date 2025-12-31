import { describe, expect, it } from 'vitest'
import { createPayee } from '../../src/schemas/payee.ts'

describe('Payee', () => {
  describe('createPayee', () => {
    it('creates a payee with generated UUID', () => {
      const payee = createPayee({
        budgetId: 'budget-1',
        name: 'Grocery Store',
      })

      expect(payee.id).toBeDefined()
      expect(payee.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(payee.budgetId).toBe('budget-1')
      expect(payee.name).toBe('Grocery Store')
    })

    it('generates unique IDs', () => {
      const payee1 = createPayee({ budgetId: 'budget-1', name: 'Store A' })
      const payee2 = createPayee({ budgetId: 'budget-1', name: 'Store B' })

      expect(payee1.id).not.toBe(payee2.id)
    })
  })
})
