import { Command } from 'commander'
import {
  assignToCategory,
  moveBetweenCategories,
  getReadyToAssign,
  getCategoryBalances,
  formatCurrency,
  type Assignment,
} from '@budget/core'
import { getStore, saveStore } from '../store.ts'
import { requireActiveBudgetId } from '../config.ts'
import { parseAmount } from '../utils/parse-amount.ts'
import { getCurrentMonth } from '../utils/parse-date.ts'
import {
  outputSuccess,
  outputError,
  outputTable,
  colors,
  formatAmountColored,
  type OutputOptions,
} from '../output.ts'

/**
 * Find a category by ID or name within the active budget.
 */
function findCategory(
  store: ReturnType<typeof getStore>,
  budgetId: string,
  idOrName: string
) {
  const categories = store.listCategories(budgetId)
  let category = categories.find((c) => c.id === idOrName)
  if (!category) {
    category = categories.find(
      (c) => c.name.toLowerCase() === idOrName.toLowerCase()
    )
  }
  return category
}

/**
 * Register allocation commands.
 */
export function registerAssignCommands(program: Command): void {
  // budget assign <category> <amount>
  program
    .command('assign <category> <amount>')
    .description('Assign money to a category')
    .option('--month <month>', 'Month in YYYY-MM format (default: current)')
    .action(async (categoryArg: string, amountArg: string, opts: { month?: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        // Find category
        const category = findCategory(store, budgetId, categoryArg)
        if (!category) {
          throw new Error(`Category not found: ${categoryArg}`)
        }

        // Parse amount
        const amount = parseAmount(amountArg)

        // Get month
        const month = opts.month ?? getCurrentMonth()

        // Assign
        const assignment = assignToCategory(store, category.id, month, amount)
        saveStore()

        const budget = store.getBudget(budgetId)
        const currency = budget?.currency ?? 'USD'

        outputSuccess(
          `Assigned ${formatCurrency(amount, currency)} to ${category.name} for ${month}`,
          options,
          assignment
        )
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // budget assign-list [--month YYYY-MM]
  program
    .command('assign-list')
    .description('List all assignments for a month')
    .option('--month <month>', 'Month in YYYY-MM format (default: current)')
    .action(async (opts: { month?: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const month = opts.month ?? getCurrentMonth()
        const budget = store.getBudget(budgetId)
        const currency = budget?.currency ?? 'USD'

        const assignments = store.listAssignments(budgetId, month)
        const categories = store.listCategories(budgetId)
        const groups = store.listCategoryGroups(budgetId)

        // Build lookup maps
        const categoryMap = new Map(categories.map((c) => [c.id, c]))
        const groupMap = new Map(groups.map((g) => [g.id, g]))

        // Enrich assignments with category and group names
        const enrichedAssignments = assignments
          .map((a: Assignment) => {
            const category = categoryMap.get(a.categoryId)
            const group = category ? groupMap.get(category.groupId) : null
            return {
              ...a,
              categoryName: category?.name ?? 'Unknown',
              groupName: group?.name ?? 'Unknown',
            }
          })
          .filter((a) => a.amount !== 0) // Only show non-zero assignments
          .sort((a, b) => {
            // Sort by group name, then category name
            const groupCompare = a.groupName.localeCompare(b.groupName)
            if (groupCompare !== 0) return groupCompare
            return a.categoryName.localeCompare(b.categoryName)
          })

        if (options.json) {
          console.log(JSON.stringify({ month, assignments: enrichedAssignments }, null, 2))
        } else if (options.quiet) {
          for (const a of enrichedAssignments) {
            console.log(`${a.categoryId}\t${a.amount}`)
          }
        } else {
          if (enrichedAssignments.length === 0) {
            console.log(colors.dim(`No assignments for ${month}.`))
            return
          }

          console.log(colors.bold(`Assignments for ${month}`))
          console.log()

          outputTable(
            ['Category', 'Group', 'Assigned'],
            enrichedAssignments.map((a) => [
              a.categoryName,
              a.groupName,
              formatAmountColored(a.amount, currency),
            ]),
            { ...options, json: false, quiet: false }
          )

          // Show total
          const total = enrichedAssignments.reduce((sum, a) => sum + a.amount, 0)
          console.log()
          console.log(`Total assigned: ${formatAmountColored(total, currency)}`)
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // budget assign-clear <category> [--month YYYY-MM]
  program
    .command('assign-clear <category>')
    .description('Clear (zero out) an assignment for a category')
    .option('--month <month>', 'Month in YYYY-MM format (default: current)')
    .action(async (categoryArg: string, opts: { month?: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        // Find category
        const category = findCategory(store, budgetId, categoryArg)
        if (!category) {
          throw new Error(`Category not found: ${categoryArg}`)
        }

        const month = opts.month ?? getCurrentMonth()
        const budget = store.getBudget(budgetId)
        const currency = budget?.currency ?? 'USD'

        // Get current assignment to show what was cleared
        const existing = store.getAssignment(category.id, month)
        const previousAmount = existing?.amount ?? 0

        if (previousAmount === 0) {
          if (options.json) {
            console.log(JSON.stringify({ message: 'No assignment to clear', category: category.name, month }, null, 2))
          } else if (!options.quiet) {
            console.log(colors.dim(`No assignment to clear for ${category.name} in ${month}.`))
          }
          return
        }

        // Delete the assignment
        store.deleteAssignment(category.id, month)
        saveStore()

        outputSuccess(
          `Cleared ${formatCurrency(previousAmount, currency)} assignment from ${category.name} for ${month}`,
          options,
          { categoryId: category.id, categoryName: category.name, month, clearedAmount: previousAmount }
        )
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // budget move <from-category> <to-category> <amount>
  program
    .command('move <fromCategory> <toCategory> <amount>')
    .description('Move money between categories')
    .option('--month <month>', 'Month in YYYY-MM format (default: current)')
    .action(
      async (
        fromArg: string,
        toArg: string,
        amountArg: string,
        opts: { month?: string }
      ) => {
        const options = program.opts() as OutputOptions
        try {
          const budgetId = requireActiveBudgetId()
          const store = getStore()

          // Find categories
          const fromCategory = findCategory(store, budgetId, fromArg)
          if (!fromCategory) {
            throw new Error(`Source category not found: ${fromArg}`)
          }

          const toCategory = findCategory(store, budgetId, toArg)
          if (!toCategory) {
            throw new Error(`Destination category not found: ${toArg}`)
          }

          // Parse amount
          const amount = parseAmount(amountArg)

          // Get month
          const month = opts.month ?? getCurrentMonth()

          // Move
          const result = moveBetweenCategories(
            store,
            fromCategory.id,
            toCategory.id,
            month,
            amount
          )
          saveStore()

          const budget = store.getBudget(budgetId)
          const currency = budget?.currency ?? 'USD'

          outputSuccess(
            `Moved ${formatCurrency(amount, currency)} from ${fromCategory.name} to ${toCategory.name}`,
            options,
            result
          )
        } catch (error) {
          outputError(error as Error, options)
        }
      }
    )

  // budget available
  program
    .command('available')
    .description('Show Ready to Assign amount')
    .option('--month <month>', 'Month in YYYY-MM format (default: current)')
    .action(async (opts: { month?: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const month = opts.month ?? getCurrentMonth()
        const readyToAssign = getReadyToAssign(store, budgetId, month)

        const budget = store.getBudget(budgetId)
        const currency = budget?.currency ?? 'USD'

        if (options.json) {
          console.log(
            JSON.stringify(
              { readyToAssign, month, formatted: formatCurrency(readyToAssign, currency) },
              null,
              2
            )
          )
        } else if (options.quiet) {
          console.log(readyToAssign)
        } else {
          console.log(
            `Ready to Assign (${month}): ${formatAmountColored(readyToAssign, currency)}`
          )
          if (readyToAssign > 0) {
            console.log(
              colors.dim('You have money to assign to categories.')
            )
          } else if (readyToAssign < 0) {
            console.log(
              colors.warning(
                'You have overassigned. Move money from other categories.'
              )
            )
          } else {
            console.log(
              colors.success('All money is assigned. Zero-based budget achieved!')
            )
          }
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // budget status
  program
    .command('status')
    .description('Show budget overview (all categories with available amounts)')
    .option('--month <month>', 'Month in YYYY-MM format (default: current)')
    .action(async (opts: { month?: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const month = opts.month ?? getCurrentMonth()
        const budget = store.getBudget(budgetId)
        const currency = budget?.currency ?? 'USD'

        const groups = store.listCategoryGroups(budgetId)
        const categories = store.listCategories(budgetId)
        const readyToAssign = getReadyToAssign(store, budgetId, month)

        if (options.json) {
          const data = {
            month,
            readyToAssign,
            groups: groups.map((group) => {
              const groupCategories = categories.filter(
                (c) => c.groupId === group.id
              )
              return {
                ...group,
                categories: groupCategories.map((cat) => {
                  const balances = getCategoryBalances(store, cat.id, month)
                  return { ...cat, balances }
                }),
              }
            }),
          }
          console.log(JSON.stringify(data, null, 2))
        } else if (options.quiet) {
          console.log(readyToAssign)
        } else {
          console.log(colors.bold(`Budget Status for ${month}`))
          console.log()
          console.log(
            `Ready to Assign: ${formatAmountColored(readyToAssign, currency)}`
          )
          console.log()

          for (const group of groups) {
            console.log(colors.bold(group.name))
            const groupCategories = categories.filter(
              (c) => c.groupId === group.id
            )

            if (groupCategories.length === 0) {
              console.log(colors.dim('  (no categories)'))
            } else {
              const rows: (string | number)[][] = []
              for (const cat of groupCategories) {
                const balances = getCategoryBalances(store, cat.id, month)
                rows.push([
                  cat.name,
                  formatAmountColored(balances.assigned, currency),
                  formatAmountColored(balances.activity, currency),
                  formatAmountColored(balances.available, currency),
                ])
              }

              outputTable(
                ['Category', 'Assigned', 'Activity', 'Available'],
                rows,
                { ...options, json: false, quiet: false }
              )
            }
            console.log()
          }
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })
}
