import { describe, expect, it } from 'vitest'
import { createTarget } from '../../src/schemas/target.ts'

describe('Target', () => {
  describe('createTarget', () => {
    it('creates a spending limit target', () => {
      const target = createTarget({
        categoryId: 'category-1',
        type: 'spending_limit',
        amount: 50000,
      })

      expect(target.id).toBeDefined()
      expect(target.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(target.categoryId).toBe('category-1')
      expect(target.type).toBe('spending_limit')
      expect(target.amount).toBe(50000)
    })

    it('creates a savings balance target', () => {
      const target = createTarget({
        categoryId: 'category-1',
        type: 'savings_balance',
        amount: 100000,
      })

      expect(target.type).toBe('savings_balance')
    })

    it('creates a monthly contribution target', () => {
      const target = createTarget({
        categoryId: 'category-1',
        type: 'monthly_contribution',
        amount: 20000,
      })

      expect(target.type).toBe('monthly_contribution')
    })

    it('defaults targetDate to null', () => {
      const target = createTarget({
        categoryId: 'category-1',
        type: 'savings_balance',
        amount: 100000,
      })

      expect(target.targetDate).toBeNull()
    })

    it('accepts custom targetDate', () => {
      const target = createTarget({
        categoryId: 'category-1',
        type: 'savings_balance',
        amount: 100000,
        targetDate: '2024-12-31',
      })

      expect(target.targetDate).toBe('2024-12-31')
    })
  })
})
