import { Command } from 'commander'
import type { Store } from '@budget/core'
import { SqliteStore } from '@budget/core'
import { existsSync, writeFileSync } from 'fs'
import { setStore, saveStore } from '../../src/store.ts'
import { getCurrentDbPath } from '../../src/config.ts'
import {
  registerBudgetCommands,
  registerAccountCommands,
  registerTransactionCommands,
  registerCategoryCommands,
  registerGroupCommands,
  registerAssignCommands,
  registerTargetCommands,
} from '../../src/commands/index.ts'

interface CommandResult {
  output: string
  exitCode: number
}

/**
 * Parse command string into arguments array.
 * Handles quoted strings properly.
 */
function parseCommandArgs(command: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuote = false
  let quoteChar = ''

  for (const char of command) {
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true
      quoteChar = char
    } else if (char === quoteChar && inQuote) {
      inQuote = false
      quoteChar = ''
    } else if (char === ' ' && !inQuote) {
      if (current) {
        args.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }

  if (current) {
    args.push(current)
  }

  return args
}

/**
 * Run a CLI command and capture output.
 */
export async function runCommand(command: string, store: Store): Promise<CommandResult> {
  // Ensure store is set
  setStore(store)

  // Capture console output
  let output = ''
  const originalLog = console.log
  const originalError = console.error
  let exitCode = 0

  console.log = (...args: unknown[]) => {
    output += args.map(String).join(' ') + '\n'
  }

  console.error = (...args: unknown[]) => {
    output += args.map(String).join(' ') + '\n'
  }

  // Store original process.exitCode
  const originalExitCode = process.exitCode

  try {
    // Create fresh commander instance
    const program = new Command()

    program
      .name('budget')
      .description('Personal budget management CLI')
      .version('0.1.0')
      .option('--json', 'Output in JSON format')
      .option('--quiet', 'Minimal output (IDs only)')
      .option('--db <path>', 'Path to SQLite database file')
      .exitOverride() // Prevent process.exit

    // Capture errors
    program.configureOutput({
      writeOut: (str) => {
        output += str
      },
      writeErr: (str) => {
        output += str
      },
    })

    // Register all commands
    registerBudgetCommands(program)
    registerAccountCommands(program)
    registerTransactionCommands(program)
    registerCategoryCommands(program)
    registerGroupCommands(program)
    registerAssignCommands(program)
    registerTargetCommands(program)

    // Parse the command
    const args = parseCommandArgs(command)

    // Remove 'budget' prefix if present (it's already the program name)
    if (args[0] === 'budget') {
      args.shift()
    }

    // Prepend fake argv entries (node + script)
    const fullArgs = ['node', 'budget', ...args]

    await program.parseAsync(fullArgs)

    // Check if exitCode was set
    if (typeof process.exitCode === 'number' && process.exitCode !== 0) {
      exitCode = process.exitCode
    }

    // Save after command completes
    saveStore()

    // For file-based stores, also save to disk
    const dbPath = getCurrentDbPath()
    if (dbPath && store) {
      const sqliteStore = store as SqliteStore
      if (typeof sqliteStore.export === 'function') {
        const data = sqliteStore.export()
        writeFileSync(dbPath, Buffer.from(data))
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      // Commander throws on errors, capture message
      if (error.message) {
        output += error.message + '\n'
      }
    }
    exitCode = 1
  } finally {
    // Restore console
    console.log = originalLog
    console.error = originalError
    process.exitCode = originalExitCode
  }

  return { output: output.trim(), exitCode }
}
