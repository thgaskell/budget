#!/usr/bin/env bun
import { Command } from 'commander'
import { initStore, closeStore } from './store.ts'
import { outputError } from './output.ts'
import {
  registerBudgetCommands,
  registerAccountCommands,
  registerTransactionCommands,
  registerCategoryCommands,
  registerGroupCommands,
  registerAssignCommands,
  registerTargetCommands,
} from './commands/index.ts'

const program = new Command()

program
  .name('budget')
  .description('Personal budget management CLI')
  .version('0.1.0')
  .option('--json', 'Output in JSON format')
  .option('--quiet', 'Minimal output (IDs only)')
  .option('--db <path>', 'Path to SQLite database file')

// Initialize store after parsing but before command execution
program.hook('preAction', async (thisCommand) => {
  const opts = thisCommand.opts()
  await initStore({ dbPath: opts.db })
})

// Register all commands
registerBudgetCommands(program)
registerAccountCommands(program)
registerTransactionCommands(program)
registerCategoryCommands(program)
registerGroupCommands(program)
registerAssignCommands(program)
registerTargetCommands(program)

// Run CLI
async function main() {
  try {
    await program.parseAsync(process.argv)
  } catch (error) {
    outputError(error as Error, program.opts())
  } finally {
    closeStore()
  }
}

main()
