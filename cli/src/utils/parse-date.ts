/**
 * Parse a flexible date input string to ISO date string (YYYY-MM-DD).
 * Accepts formats: 2025-01-15, today, yesterday, 1/15, 01/15/2025
 */
export function parseDate(input: string): string {
  const trimmed = input.trim().toLowerCase()

  if (!trimmed) {
    throw new Error('Date cannot be empty')
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Handle special keywords
  if (trimmed === 'today') {
    return formatISODate(today)
  }

  if (trimmed === 'yesterday') {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    return formatISODate(yesterday)
  }

  if (trimmed === 'tomorrow') {
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return formatISODate(tomorrow)
  }

  // Try ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed + 'T00:00:00')
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${input}`)
    }
    return trimmed
  }

  // Try M/D or M/D/YYYY format
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10)
    const day = parseInt(slashMatch[2], 10)
    let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : today.getFullYear()

    // Handle 2-digit years
    if (year < 100) {
      year += year < 50 ? 2000 : 1900
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(`Invalid date: ${input}`)
    }

    const date = new Date(year, month - 1, day)
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${input}`)
    }

    return formatISODate(date)
  }

  throw new Error(`Invalid date format: ${input}. Use YYYY-MM-DD, M/D, M/D/YYYY, today, or yesterday.`)
}

/**
 * Format a Date object to ISO date string (YYYY-MM-DD).
 */
export function formatISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get today's date as ISO string.
 */
export function getTodayISO(): string {
  return formatISODate(new Date())
}

/**
 * Get the current month in YYYY-MM format.
 */
export function getCurrentMonth(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}
