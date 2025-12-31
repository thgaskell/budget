import { describe, expect, it } from 'vitest'
import {
  createTransaction,
  dollarsToCents,
  centsToDollars,
  formatCurrency,
} from '../../src/schemas/transaction.ts'

describe('Transaction', () => {
  describe('createTransaction', () => {
    it('creates a transaction with generated UUID', () => {
      const txn = createTransaction({
        accountId: 'account-1',
        date: '2024-01-15',
        amount: -5000,
      })

      expect(txn.id).toBeDefined()
      expect(txn.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(txn.accountId).toBe('account-1')
      expect(txn.date).toBe('2024-01-15')
      expect(txn.amount).toBe(-5000)
    })

    it('defaults cleared to false', () => {
      const txn = createTransaction({
        accountId: 'account-1',
        date: '2024-01-15',
        amount: -5000,
      })

      expect(txn.cleared).toBe(false)
    })

    it('defaults optional fields to null', () => {
      const txn = createTransaction({
        accountId: 'account-1',
        date: '2024-01-15',
        amount: -5000,
      })

      expect(txn.categoryId).toBeNull()
      expect(txn.payeeId).toBeNull()
      expect(txn.memo).toBeNull()
      expect(txn.transferAccountId).toBeNull()
    })

    it('accepts all optional fields', () => {
      const txn = createTransaction({
        accountId: 'account-1',
        date: '2024-01-15',
        amount: -5000,
        categoryId: 'category-1',
        payeeId: 'payee-1',
        memo: 'Grocery shopping',
        cleared: true,
        transferAccountId: 'account-2',
      })

      expect(txn.categoryId).toBe('category-1')
      expect(txn.payeeId).toBe('payee-1')
      expect(txn.memo).toBe('Grocery shopping')
      expect(txn.cleared).toBe(true)
      expect(txn.transferAccountId).toBe('account-2')
    })
  })

  describe('dollarsToCents', () => {
    it('converts whole dollars', () => {
      expect(dollarsToCents(10)).toBe(1000)
      expect(dollarsToCents(100)).toBe(10000)
    })

    it('converts dollars with cents', () => {
      expect(dollarsToCents(10.5)).toBe(1050)
      expect(dollarsToCents(10.99)).toBe(1099)
      expect(dollarsToCents(10.01)).toBe(1001)
    })

    it('rounds to nearest cent', () => {
      expect(dollarsToCents(10.999)).toBe(1100)
      expect(dollarsToCents(10.001)).toBe(1000)
    })

    it('handles negative amounts', () => {
      expect(dollarsToCents(-50)).toBe(-5000)
      expect(dollarsToCents(-50.75)).toBe(-5075)
    })
  })

  describe('centsToDollars', () => {
    it('converts cents to dollars', () => {
      expect(centsToDollars(1000)).toBe(10)
      expect(centsToDollars(10000)).toBe(100)
    })

    it('preserves decimal places', () => {
      expect(centsToDollars(1050)).toBe(10.5)
      expect(centsToDollars(1099)).toBe(10.99)
      expect(centsToDollars(1001)).toBe(10.01)
    })

    it('handles negative amounts', () => {
      expect(centsToDollars(-5000)).toBe(-50)
      expect(centsToDollars(-5075)).toBe(-50.75)
    })
  })

  describe('formatCurrency', () => {
    it('formats positive amounts', () => {
      expect(formatCurrency(10000)).toBe('$100.00')
      expect(formatCurrency(1050)).toBe('$10.50')
    })

    it('formats negative amounts', () => {
      expect(formatCurrency(-5000)).toBe('-$50.00')
    })

    it('formats zero', () => {
      expect(formatCurrency(0)).toBe('$0.00')
    })

    it('accepts currency parameter', () => {
      expect(formatCurrency(10000, 'EUR')).toContain('100')
    })
  })
})
