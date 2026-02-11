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
  registerUpdateCommands,
} from './commands/index.ts'
import pkg from '../package.json'

const program = new Command()

program
  .name('budget')
  .description('Personal budget management CLI')
  .version(pkg.version)
  .option('--json', 'Output in JSON format')
  .option('--quiet', 'Minimal output (IDs only)')
  .option('-f, --file <path>', 'Path to .budget file')

// Initialize store after parsing but before command execution
program.hook('preAction', async (thisCommand, actionCommand) => {
  if (actionCommand.name() === 'create') {
    return // create manages its own store initialization
  }
  const opts = thisCommand.opts()
  await initStore({ dbPath: opts.file })
})

// Register all commands
registerBudgetCommands(program)
registerAccountCommands(program)
registerTransactionCommands(program)
registerCategoryCommands(program)
registerGroupCommands(program)
registerAssignCommands(program)
registerTargetCommands(program)
registerUpdateCommands(program)

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
