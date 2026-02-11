import { Command } from 'commander'
import { createBudget } from '@budget/core'
import { getStore, saveStore, populateBudgetMeta } from '../store.ts'
import { requireBudgetId } from '../budget-helpers.ts'
import { getDefaultCurrency } from '../config.ts'
import {
  outputSuccess,
  outputError,
  colors,
  type OutputOptions,
} from '../output.ts'

/**
 * Register budget commands.
 */
export function registerBudgetCommands(program: Command): void {
  // budget create <name>
  program
    .command('create <name>')
    .description('Create a new budget')
    .option('--currency <code>', 'Currency code', getDefaultCurrency())
    .action(async (name: string, opts: { currency: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const store = getStore()

        // Enforce 1:1 budget-per-file constraint
        const existingBudgets = store.listBudgets()
        if (existingBudgets.length > 0) {
          throw new Error(
            'This file already contains a budget. Only one budget per .budget file is allowed.'
          )
        }

        const budget = createBudget({ name, currency: opts.currency })
        store.saveBudget(budget)
        populateBudgetMeta(budget)
        saveStore()

        outputSuccess(`Created budget: ${budget.name}`, options, budget)
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // budget show
  program
    .command('show')
    .description('Show budget details')
    .action(async () => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireBudgetId()
        const store = getStore()
        const budget = store.getBudget(budgetId)!

        if (options.json) {
          console.log(JSON.stringify(budget, null, 2))
        } else if (options.quiet) {
          console.log(budget.id)
        } else {
          console.log(colors.bold('Budget Details'))
          console.log(`ID:       ${budget.id}`)
          console.log(`Name:     ${budget.name}`)
          console.log(`Currency: ${budget.currency}`)
          // Display timestamps if available (from core timestamps feature)
          const budgetWithTimestamps = budget as { createdAt?: string; updatedAt?: string }
          if (budgetWithTimestamps.createdAt) {
            console.log(`Created:  ${budgetWithTimestamps.createdAt}`)
          }
          if (budgetWithTimestamps.updatedAt) {
            console.log(`Updated:  ${budgetWithTimestamps.updatedAt}`)
          }
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // budget edit
  program
    .command('edit')
    .description('Edit the budget')
    .option('--name <new-name>', 'New budget name')
    .option('--currency <new-currency>', 'New currency code')
    .action(async (opts: { name?: string; currency?: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireBudgetId()
        const store = getStore()
        const budget = store.getBudget(budgetId)!

        if (!opts.name && !opts.currency) {
          throw new Error(
            'No changes specified. Use --name or --currency to update the budget.'
          )
        }

        // Update budget fields
        const updatedBudget = {
          ...budget,
          name: opts.name ?? budget.name,
          currency: opts.currency ?? budget.currency,
        }

        store.saveBudget(updatedBudget)
        populateBudgetMeta(updatedBudget)
        saveStore()

        outputSuccess(`Updated budget: ${updatedBudget.name}`, options, updatedBudget)
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // budget delete <id>
  program
    .command('delete <id>')
    .description('Delete a budget')
    .option('--force', 'Skip confirmation')
    .action(async (id: string, _opts: { force?: boolean }) => {
      const options = program.opts() as OutputOptions
      try {
        const store = getStore()
        const budget = store.getBudget(id)

        if (!budget) {
          throw new Error(`Budget not found: ${id}`)
        }

        store.deleteBudget(id)
        saveStore()

        outputSuccess(`Deleted budget: ${budget.name}`, options, { id })
      } catch (error) {
        outputError(error as Error, options)
      }
    })
}
