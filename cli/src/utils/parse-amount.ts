import { dollarsToCents } from '@budget/core'

/**
 * Parse a flexible amount input string to cents.
 * Accepts formats: 100, 100.50, -50, +1000
 */
export function parseAmount(input: string): number {
  const trimmed = input.trim()

  if (!trimmed) {
    throw new Error('Amount cannot be empty')
  }

  // Remove commas and currency symbols
  const cleaned = trimmed.replace(/[$,]/g, '')

  // Validate that the entire string is a valid number
  // Allow optional sign, digits, optional decimal point, and more digits
  if (!/^[+-]?\d*\.?\d+$/.test(cleaned)) {
    throw new Error(`Invalid amount: ${input}`)
  }

  const num = parseFloat(cleaned)

  if (isNaN(num)) {
    throw new Error(`Invalid amount: ${input}`)
  }

  return dollarsToCents(num)
}

/**
 * Check if an amount string represents an outflow (negative).
 */
export function isOutflow(input: string): boolean {
  return input.trim().startsWith('-')
}

/**
 * Check if an amount string represents an inflow (positive).
 */
export function isInflow(input: string): boolean {
  const trimmed = input.trim()
  return trimmed.startsWith('+') || (!trimmed.startsWith('-') && parseFloat(trimmed) > 0)
}
