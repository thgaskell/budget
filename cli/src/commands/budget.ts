import { Command } from 'commander'
import { createBudget } from '@budget/core'
import { getStore, saveStore } from '../store.ts'
import {
  getActiveBudgetId,
  setActiveBudgetId,
  clearActiveBudgetId,
} from '../config.ts'
import {
  outputSuccess,
  outputError,
  outputTable,
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
    .option('--currency <code>', 'Currency code (default: USD)', 'USD')
    .action(async (name: string, opts: { currency: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const store = getStore()
        const budget = createBudget({ name, currency: opts.currency })
        store.saveBudget(budget)
        saveStore()

        outputSuccess(`Created budget: ${budget.name}`, options, budget)
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // budget list
  program
    .command('list')
    .description('List all budgets')
    .action(async () => {
      const options = program.opts() as OutputOptions
      try {
        const store = getStore()
        const budgets = store.listBudgets()
        const activeBudgetId = getActiveBudgetId()

        if (options.json) {
          console.log(JSON.stringify(budgets, null, 2))
        } else if (options.quiet) {
          for (const budget of budgets) {
            console.log(budget.id)
          }
        } else {
          if (budgets.length === 0) {
            console.log(colors.dim('No budgets found. Create one with "budget create <name>".'))
            return
          }

          outputTable(
            ['ID', 'Name', 'Currency', 'Active'],
            budgets.map((b) => [
              b.id,
              b.name,
              b.currency,
              b.id === activeBudgetId ? colors.success('*') : '',
            ]),
            options
          )
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // budget use <id|name>
  program
    .command('use <idOrName>')
    .description('Set active budget for subsequent commands')
    .action(async (idOrName: string) => {
      const options = program.opts() as OutputOptions
      try {
        const store = getStore()
        const budgets = store.listBudgets()

        // Try to find by ID first, then by name
        let budget = budgets.find((b) => b.id === idOrName)
        if (!budget) {
          budget = budgets.find(
            (b) => b.name.toLowerCase() === idOrName.toLowerCase()
          )
        }

        if (!budget) {
          throw new Error(`Budget not found: ${idOrName}`)
        }

        setActiveBudgetId(budget.id)
        outputSuccess(`Now using budget: ${budget.name}`, options, budget)
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // budget show
  program
    .command('show')
    .description('Show active budget details')
    .action(async () => {
      const options = program.opts() as OutputOptions
      try {
        const store = getStore()
        const activeBudgetId = getActiveBudgetId()

        if (!activeBudgetId) {
          throw new Error(
            'No active budget. Use "budget use <id|name>" to select a budget.'
          )
        }

        const budget = store.getBudget(activeBudgetId)
        if (!budget) {
          clearActiveBudgetId()
          throw new Error('Active budget no longer exists.')
        }

        if (options.json) {
          console.log(JSON.stringify(budget, null, 2))
        } else if (options.quiet) {
          console.log(budget.id)
        } else {
          console.log(colors.bold('Budget Details'))
          console.log(`ID:       ${budget.id}`)
          console.log(`Name:     ${budget.name}`)
          console.log(`Currency: ${budget.currency}`)
        }
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

        // Clear active budget if deleting the active one
        const activeBudgetId = getActiveBudgetId()
        if (activeBudgetId === id) {
          clearActiveBudgetId()
        }

        store.deleteBudget(id)
        saveStore()

        outputSuccess(`Deleted budget: ${budget.name}`, options, { id })
      } catch (error) {
        outputError(error as Error, options)
      }
    })
}
