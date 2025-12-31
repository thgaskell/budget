import { Command } from 'commander'
import {
  createTarget,
  getCategoryBalances,
  getCumulativeCategoryAvailable,
  formatCurrency,
  type Target,
  type TargetType,
} from '@budget/core'
import { getStore, saveStore } from '../store.ts'
import { requireActiveBudgetId } from '../config.ts'
import { parseAmount } from '../utils/parse-amount.ts'
import { parseDate, getCurrentMonth } from '../utils/parse-date.ts'
import {
  outputSuccess,
  outputError,
  colors,
  formatAmountColored,
  type OutputOptions,
} from '../output.ts'

const TARGET_TYPES: TargetType[] = ['spending_limit', 'savings_balance', 'monthly_contribution']
const TARGET_TYPE_ALIASES: Record<string, TargetType> = {
  spending: 'spending_limit',
  savings: 'savings_balance',
  monthly: 'monthly_contribution',
  limit: 'spending_limit',
  balance: 'savings_balance',
  contribution: 'monthly_contribution',
}

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
 * Parse target type from input.
 */
function parseTargetType(input: string): TargetType {
  const normalized = input.toLowerCase().replace(/-/g, '_')
  if (TARGET_TYPES.includes(normalized as TargetType)) {
    return normalized as TargetType
  }
  if (normalized in TARGET_TYPE_ALIASES) {
    return TARGET_TYPE_ALIASES[normalized]
  }
  throw new Error(
    `Invalid target type: ${input}. Valid types: spending, savings, monthly`
  )
}

/**
 * Format target type for display.
 */
function formatTargetType(type: TargetType): string {
  switch (type) {
    case 'spending_limit':
      return 'Spending Limit'
    case 'savings_balance':
      return 'Savings Balance'
    case 'monthly_contribution':
      return 'Monthly Contribution'
    default:
      return type
  }
}

/**
 * Register target commands.
 */
export function registerTargetCommands(program: Command): void {
  const target = program
    .command('target')
    .description('Category target management commands')

  // target set <category>
  target
    .command('set <category>')
    .description('Set a target for a category')
    .requiredOption('--amount <amount>', 'Target amount')
    .option(
      '--type <type>',
      'Target type: spending, savings, monthly (default: spending)',
      'spending'
    )
    .option('--by <date>', 'Target date (for savings targets)')
    .action(
      async (
        categoryArg: string,
        opts: { amount: string; type: string; by?: string }
      ) => {
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
          const amount = parseAmount(opts.amount)

          // Parse type
          const type = parseTargetType(opts.type)

          // Parse target date
          const targetDate = opts.by ? parseDate(opts.by) : null

          // Create or update target
          const existingTarget = store.getTarget(category.id)
          if (existingTarget) {
            // Update existing
            const updated: Target = {
              ...existingTarget,
              type,
              amount,
              targetDate,
            }
            store.saveTarget(updated)
            saveStore()

            const budget = store.getBudget(budgetId)
            const currency = budget?.currency ?? 'USD'

            outputSuccess(
              `Updated target for ${category.name}: ${formatTargetType(type)} of ${formatCurrency(amount, currency)}`,
              options,
              updated
            )
          } else {
            // Create new
            const newTarget = createTarget({
              categoryId: category.id,
              type,
              amount,
              targetDate,
            })
            store.saveTarget(newTarget)
            saveStore()

            const budget = store.getBudget(budgetId)
            const currency = budget?.currency ?? 'USD'

            outputSuccess(
              `Set target for ${category.name}: ${formatTargetType(type)} of ${formatCurrency(amount, currency)}`,
              options,
              newTarget
            )
          }
        } catch (error) {
          outputError(error as Error, options)
        }
      }
    )

  // target show <category>
  target
    .command('show <category>')
    .description('Show target progress for a category')
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

        const targetData = store.getTarget(category.id)
        if (!targetData) {
          if (options.json) {
            console.log(JSON.stringify({ category, target: null }, null, 2))
          } else {
            console.log(
              colors.dim(`No target set for ${category.name}. Use "budget target set" to create one.`)
            )
          }
          return
        }

        const month = opts.month ?? getCurrentMonth()
        const balances = getCategoryBalances(store, category.id, month)
        const cumulativeAvailable = getCumulativeCategoryAvailable(
          store,
          category.id,
          month
        )

        const budget = store.getBudget(budgetId)
        const currency = budget?.currency ?? 'USD'

        // Calculate progress
        let progress: number
        let progressPercent: number
        let remaining: number

        switch (targetData.type) {
          case 'spending_limit':
            // For spending limit, activity is negative spending
            progress = Math.abs(balances.activity)
            remaining = targetData.amount - progress
            progressPercent = (progress / targetData.amount) * 100
            break
          case 'savings_balance':
            // For savings, we look at cumulative available
            progress = cumulativeAvailable
            remaining = targetData.amount - progress
            progressPercent = (progress / targetData.amount) * 100
            break
          case 'monthly_contribution':
            // For monthly, we look at assigned amount
            progress = balances.assigned
            remaining = targetData.amount - progress
            progressPercent = (progress / targetData.amount) * 100
            break
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                category,
                target: targetData,
                month,
                progress: {
                  current: progress,
                  remaining,
                  percent: Math.min(100, Math.max(0, progressPercent)),
                },
                balances,
              },
              null,
              2
            )
          )
        } else if (options.quiet) {
          console.log(progress)
        } else {
          console.log(colors.bold(`Target for ${category.name}`))
          console.log(`Type:     ${formatTargetType(targetData.type)}`)
          console.log(`Target:   ${formatCurrency(targetData.amount, currency)}`)
          if (targetData.targetDate) {
            console.log(`By:       ${targetData.targetDate}`)
          }
          console.log()
          console.log(colors.bold('Progress'))
          console.log(`Current:  ${formatAmountColored(progress, currency)}`)
          console.log(`Remaining: ${formatAmountColored(remaining, currency)}`)
          console.log(
            `Progress: ${Math.min(100, Math.max(0, progressPercent)).toFixed(1)}%`
          )

          // Visual progress bar
          const barWidth = 30
          const filledWidth = Math.round((Math.min(100, progressPercent) / 100) * barWidth)
          const emptyWidth = barWidth - filledWidth
          const bar = colors.success('='.repeat(filledWidth)) + colors.dim('-'.repeat(emptyWidth))
          console.log(`[${bar}]`)
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // target clear <category>
  target
    .command('clear <category>')
    .description('Remove target from a category')
    .action(async (categoryArg: string) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        // Find category
        const category = findCategory(store, budgetId, categoryArg)
        if (!category) {
          throw new Error(`Category not found: ${categoryArg}`)
        }

        const existingTarget = store.getTarget(category.id)
        if (!existingTarget) {
          throw new Error(`No target set for ${category.name}`)
        }

        store.deleteTarget(category.id)
        saveStore()

        outputSuccess(`Cleared target for ${category.name}`, options, {
          categoryId: category.id,
        })
      } catch (error) {
        outputError(error as Error, options)
      }
    })
}
