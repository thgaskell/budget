import { describe, it, expect } from 'vitest'
import { parseAmount, isOutflow, isInflow } from '../../src/utils/parse-amount.ts'

describe('parseAmount', () => {
  it('parses whole dollar amounts', () => {
    expect(parseAmount('100')).toBe(10000)
    expect(parseAmount('1')).toBe(100)
    expect(parseAmount('0')).toBe(0)
  })

  it('parses decimal amounts', () => {
    expect(parseAmount('100.50')).toBe(10050)
    expect(parseAmount('0.99')).toBe(99)
    expect(parseAmount('12.34')).toBe(1234)
  })

  it('parses negative amounts', () => {
    expect(parseAmount('-50')).toBe(-5000)
    expect(parseAmount('-100.50')).toBe(-10050)
  })

  it('parses positive amounts with plus sign', () => {
    expect(parseAmount('+1000')).toBe(100000)
    expect(parseAmount('+50.25')).toBe(5025)
  })

  it('handles whitespace', () => {
    expect(parseAmount('  100  ')).toBe(10000)
    expect(parseAmount('\t50.00\n')).toBe(5000)
  })

  it('removes currency symbols and commas', () => {
    expect(parseAmount('$100')).toBe(10000)
    expect(parseAmount('$1,000')).toBe(100000)
    expect(parseAmount('$1,234.56')).toBe(123456)
  })

  it('throws on empty string', () => {
    expect(() => parseAmount('')).toThrow('Amount cannot be empty')
    expect(() => parseAmount('   ')).toThrow('Amount cannot be empty')
  })

  it('throws on invalid input', () => {
    expect(() => parseAmount('abc')).toThrow('Invalid amount')
    expect(() => parseAmount('12abc')).toThrow('Invalid amount')
  })
})

describe('isOutflow', () => {
  it('returns true for negative amounts', () => {
    expect(isOutflow('-50')).toBe(true)
    expect(isOutflow('-100.50')).toBe(true)
    expect(isOutflow('  -25')).toBe(true)
  })

  it('returns false for positive amounts', () => {
    expect(isOutflow('50')).toBe(false)
    expect(isOutflow('+100')).toBe(false)
    expect(isOutflow('0')).toBe(false)
  })
})

describe('isInflow', () => {
  it('returns true for positive amounts', () => {
    expect(isInflow('50')).toBe(true)
    expect(isInflow('+100')).toBe(true)
    expect(isInflow('100.50')).toBe(true)
  })

  it('returns false for negative amounts', () => {
    expect(isInflow('-50')).toBe(false)
    expect(isInflow('-100.50')).toBe(false)
  })

  it('returns false for zero', () => {
    expect(isInflow('0')).toBe(false)
    expect(isInflow('0.00')).toBe(false)
  })
})
