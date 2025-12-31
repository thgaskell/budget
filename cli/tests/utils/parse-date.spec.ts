import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  parseDate,
  formatISODate,
  getTodayISO,
  getCurrentMonth,
} from '../../src/utils/parse-date.ts'

describe('parseDate', () => {
  beforeEach(() => {
    // Mock the date to 2025-01-15
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('parses ISO date format', () => {
    expect(parseDate('2025-01-15')).toBe('2025-01-15')
    expect(parseDate('2024-12-31')).toBe('2024-12-31')
    expect(parseDate('2025-06-01')).toBe('2025-06-01')
  })

  it('parses "today" keyword', () => {
    expect(parseDate('today')).toBe('2025-01-15')
    expect(parseDate('TODAY')).toBe('2025-01-15')
    expect(parseDate('  today  ')).toBe('2025-01-15')
  })

  it('parses "yesterday" keyword', () => {
    expect(parseDate('yesterday')).toBe('2025-01-14')
    expect(parseDate('YESTERDAY')).toBe('2025-01-14')
  })

  it('parses "tomorrow" keyword', () => {
    expect(parseDate('tomorrow')).toBe('2025-01-16')
    expect(parseDate('TOMORROW')).toBe('2025-01-16')
  })

  it('parses M/D format with current year', () => {
    expect(parseDate('1/15')).toBe('2025-01-15')
    expect(parseDate('12/25')).toBe('2025-12-25')
    expect(parseDate('6/1')).toBe('2025-06-01')
  })

  it('parses M/D/YYYY format', () => {
    expect(parseDate('1/15/2025')).toBe('2025-01-15')
    expect(parseDate('12/31/2024')).toBe('2024-12-31')
    expect(parseDate('6/1/2023')).toBe('2023-06-01')
  })

  it('parses M/D/YY format with 2-digit year', () => {
    expect(parseDate('1/15/25')).toBe('2025-01-15')
    expect(parseDate('12/31/24')).toBe('2024-12-31')
    expect(parseDate('6/1/99')).toBe('1999-06-01')
  })

  it('handles whitespace', () => {
    expect(parseDate('  2025-01-15  ')).toBe('2025-01-15')
    expect(parseDate('\t1/15\n')).toBe('2025-01-15')
  })

  it('throws on empty string', () => {
    expect(() => parseDate('')).toThrow('Date cannot be empty')
    expect(() => parseDate('   ')).toThrow('Date cannot be empty')
  })

  it('throws on invalid date format', () => {
    expect(() => parseDate('abc')).toThrow('Invalid date format')
    expect(() => parseDate('2025/01/15')).toThrow('Invalid date format')
  })

  it('throws on invalid month/day', () => {
    expect(() => parseDate('13/1')).toThrow('Invalid date')
    expect(() => parseDate('0/15')).toThrow('Invalid date')
    expect(() => parseDate('1/32')).toThrow('Invalid date')
  })
})

describe('formatISODate', () => {
  it('formats date to ISO string', () => {
    // Use Date constructor with year, month, day to avoid timezone issues
    expect(formatISODate(new Date(2025, 0, 15))).toBe('2025-01-15')
    expect(formatISODate(new Date(2024, 11, 1))).toBe('2024-12-01')
  })

  it('pads single digit months and days', () => {
    expect(formatISODate(new Date(2025, 0, 5))).toBe('2025-01-05')
    expect(formatISODate(new Date(2025, 5, 9))).toBe('2025-06-09')
  })
})

describe('getTodayISO', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns today as ISO date', () => {
    expect(getTodayISO()).toBe('2025-01-15')
  })
})

describe('getCurrentMonth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns current month in YYYY-MM format', () => {
    expect(getCurrentMonth()).toBe('2025-01')
  })
})
