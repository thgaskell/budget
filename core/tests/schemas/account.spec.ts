import { describe, expect, it } from 'vitest'
import { createAccount } from '../../src/schemas/account.ts'

describe('Account', () => {
  describe('createAccount', () => {
    it('creates an account with generated UUID', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Checking',
        type: 'checking',
      })

      expect(account.id).toBeDefined()
      expect(account.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(account.name).toBe('Checking')
      expect(account.budgetId).toBe('budget-1')
      expect(account.type).toBe('checking')
    })

    it('defaults onBudget to true for checking accounts', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Checking',
        type: 'checking',
      })

      expect(account.onBudget).toBe(true)
    })

    it('defaults onBudget to true for savings accounts', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Savings',
        type: 'savings',
      })

      expect(account.onBudget).toBe(true)
    })

    it('defaults onBudget to true for credit accounts', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Credit Card',
        type: 'credit',
      })

      expect(account.onBudget).toBe(true)
    })

    it('defaults onBudget to true for cash accounts', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Wallet',
        type: 'cash',
      })

      expect(account.onBudget).toBe(true)
    })

    it('defaults onBudget to false for tracking accounts', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Investment',
        type: 'tracking',
      })

      expect(account.onBudget).toBe(false)
    })

    it('allows explicit onBudget override', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Special Account',
        type: 'checking',
        onBudget: false,
      })

      expect(account.onBudget).toBe(false)
    })
  })
})
