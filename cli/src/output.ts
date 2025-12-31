import Table from 'cli-table3'
import chalk from 'chalk'
import { formatCurrency } from '@budget/core'

/**
 * Output options from CLI flags.
 */
export interface OutputOptions {
  json?: boolean
  quiet?: boolean
}

/**
 * Check if color output is enabled.
 * Respects NO_COLOR environment variable.
 */
export function isColorEnabled(): boolean {
  return !process.env.NO_COLOR && process.stdout.isTTY !== false
}

/**
 * Color formatting helpers.
 */
export const colors = {
  success: (text: string) => (isColorEnabled() ? chalk.green(text) : text),
  error: (text: string) => (isColorEnabled() ? chalk.red(text) : text),
  warning: (text: string) => (isColorEnabled() ? chalk.yellow(text) : text),
  info: (text: string) => (isColorEnabled() ? chalk.blue(text) : text),
  dim: (text: string) => (isColorEnabled() ? chalk.dim(text) : text),
  bold: (text: string) => (isColorEnabled() ? chalk.bold(text) : text),
  positive: (text: string) => (isColorEnabled() ? chalk.green(text) : text),
  negative: (text: string) => (isColorEnabled() ? chalk.red(text) : text),
}

/**
 * Format a currency amount with color based on sign.
 */
export function formatAmountColored(cents: number, currency = 'USD'): string {
  const formatted = formatCurrency(cents, currency)
  if (cents < 0) {
    return colors.negative(formatted)
  } else if (cents > 0) {
    return colors.positive(formatted)
  }
  return formatted
}

/**
 * Output data based on format options.
 */
export function output<T>(
  data: T,
  options: OutputOptions,
  formatters: {
    table: (data: T) => void
    quiet: (data: T) => void
  }
): void {
  if (options.json) {
    console.log(JSON.stringify(data, null, 2))
  } else if (options.quiet) {
    formatters.quiet(data)
  } else {
    formatters.table(data)
  }
}

/**
 * Output a simple success message.
 */
export function outputSuccess(message: string, options: OutputOptions, data?: unknown): void {
  if (options.json) {
    console.log(JSON.stringify({ success: true, message, data }))
  } else if (options.quiet) {
    // Quiet mode: only output essential data (like IDs)
    if (data && typeof data === 'object' && 'id' in data) {
      console.log((data as { id: string }).id)
    }
  } else {
    console.log(colors.success(message))
  }
}

/**
 * Output an error message.
 */
export function outputError(error: Error | string, options: OutputOptions): void {
  const message = error instanceof Error ? error.message : error
  if (options.json) {
    console.error(JSON.stringify({ success: false, error: message }))
  } else {
    console.error(colors.error(`Error: ${message}`))
  }
  process.exitCode = 1
}

/**
 * Create a table for output.
 */
export function createTable(headers: string[]): Table.Table {
  return new Table({
    head: headers.map((h) => colors.bold(h)),
    style: {
      head: [],
      border: [],
    },
  })
}

/**
 * Output a table of data.
 */
export function outputTable(
  headers: string[],
  rows: (string | number)[][],
  options: OutputOptions
): void {
  if (options.json) {
    const data = rows.map((row) =>
      headers.reduce(
        (acc, header, i) => {
          acc[header.toLowerCase().replace(/\s+/g, '_')] = row[i]
          return acc
        },
        {} as Record<string, string | number>
      )
    )
    console.log(JSON.stringify(data, null, 2))
  } else if (options.quiet) {
    // Quiet: first column only (usually ID)
    for (const row of rows) {
      console.log(row[0])
    }
  } else {
    const table = createTable(headers)
    for (const row of rows) {
      table.push(row.map((cell) => String(cell)))
    }
    console.log(table.toString())
  }
}

/**
 * Output list of items with consistent formatting.
 */
export function outputList<T extends { id: string }>(
  items: T[],
  options: OutputOptions,
  formatRow: (item: T) => (string | number)[]
): void {
  if (options.json) {
    console.log(JSON.stringify(items, null, 2))
  } else if (options.quiet) {
    for (const item of items) {
      console.log(item.id)
    }
  } else {
    for (const item of items) {
      const row = formatRow(item)
      console.log(row.join('\t'))
    }
  }
}
