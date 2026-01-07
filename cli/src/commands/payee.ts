import { Command } from 'commander'
import { getStore, saveStore } from '../store.ts'
import { requireActiveBudgetId } from '../config.ts'
import {
  outputSuccess,
  outputError,
  outputTable,
  colors,
  formatAmountColored,
  type OutputOptions,
} from '../output.ts'

/**
 * Find a payee by ID or name within the active budget.
 */
function findPayee(
  store: ReturnType<typeof getStore>,
  budgetId: string,
  idOrName: string
) {
  const payees = store.listPayees(budgetId)
  let payee = payees.find((p) => p.id === idOrName)
  if (!payee) {
    payee = payees.find((p) => p.name.toLowerCase() === idOrName.toLowerCase())
  }
  return payee
}

/**
 * Register payee commands.
 */
export function registerPayeeCommands(program: Command): void {
  const payee = program
    .command('payee')
    .description('Payee management commands')

  // payee list
  payee
    .command('list')
    .description('List all payees')
    .action(async () => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()
        const payees = store.listPayees(budgetId)

        if (options.json) {
          console.log(JSON.stringify(payees, null, 2))
        } else if (options.quiet) {
          for (const p of payees) {
            console.log(p.id)
          }
        } else {
          if (payees.length === 0) {
            console.log(
              colors.dim('No payees found. Payees are created automatically when adding transactions.')
            )
            return
          }

          outputTable(
            ['ID', 'Name'],
            payees.map((p) => [
              p.id.substring(0, 8) + '...',
              p.name,
            ]),
            options
          )
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // payee show <id|name>
  payee
    .command('show <idOrName>')
    .description('Show payee details and transaction history')
    .option('--limit <n>', 'Number of recent transactions to show', '10')
    .action(async (idOrName: string, opts: { limit: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const payee = findPayee(store, budgetId, idOrName)
        if (!payee) {
          throw new Error(`Payee not found: ${idOrName}`)
        }

        // Get all transactions for this payee
        const allTransactions = store.listAllTransactions(budgetId)
        const payeeTransactions = allTransactions
          .filter((t) => t.payeeId === payee.id)
          .sort((a, b) => b.date.localeCompare(a.date))

        const limit = parseInt(opts.limit, 10)
        const recentTxns = payeeTransactions.slice(0, limit)

        const budget = store.getBudget(budgetId)
        const currency = budget?.currency ?? 'USD'

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                payee,
                transactionCount: payeeTransactions.length,
                recentTransactions: recentTxns,
              },
              null,
              2
            )
          )
        } else if (options.quiet) {
          console.log(payee.id)
        } else {
          console.log(colors.bold('Payee Details'))
          console.log(`ID:           ${payee.id}`)
          console.log(`Name:         ${payee.name}`)
          console.log(`Transactions: ${payeeTransactions.length}`)

          if (recentTxns.length > 0) {
            console.log()
            console.log(colors.bold(`Recent Transactions (${recentTxns.length})`))

            outputTable(
              ['Date', 'Account', 'Category', 'Amount'],
              recentTxns.map((txn) => {
                const account = store.getAccount(txn.accountId)
                const category = txn.categoryId
                  ? store.getCategory(txn.categoryId)
                  : null
                return [
                  txn.date,
                  account?.name ?? colors.dim('(unknown)'),
                  category?.name ?? colors.dim('(uncategorized)'),
                  formatAmountColored(txn.amount, currency),
                ]
              }),
              options
            )
          }
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // payee edit <id|name>
  payee
    .command('edit <idOrName>')
    .description('Edit a payee')
    .requiredOption('--name <new>', 'New name for the payee')
    .action(async (idOrName: string, opts: { name: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const payee = findPayee(store, budgetId, idOrName)
        if (!payee) {
          throw new Error(`Payee not found: ${idOrName}`)
        }

        // Check if new name already exists
        const existingPayee = store
          .listPayees(budgetId)
          .find(
            (p) =>
              p.id !== payee.id &&
              p.name.toLowerCase() === opts.name.toLowerCase()
          )

        if (existingPayee) {
          throw new Error(`A payee with the name "${opts.name}" already exists.`)
        }

        const oldName = payee.name
        const updatedPayee = { ...payee, name: opts.name }
        store.savePayee(updatedPayee)
        saveStore()

        outputSuccess(
          `Renamed payee: "${oldName}" -> "${opts.name}"`,
          options,
          updatedPayee
        )
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // payee delete <id|name>
  payee
    .command('delete <idOrName>')
    .description('Delete a payee')
    .option('--force', 'Skip confirmation')
    .action(async (idOrName: string, _opts: { force?: boolean }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const payee = findPayee(store, budgetId, idOrName)
        if (!payee) {
          throw new Error(`Payee not found: ${idOrName}`)
        }

        // Check for transactions using this payee
        const allTransactions = store.listAllTransactions(budgetId)
        const payeeTransactions = allTransactions.filter(
          (t) => t.payeeId === payee.id
        )

        if (payeeTransactions.length > 0) {
          // Clear payeeId from all transactions that use this payee
          for (const txn of payeeTransactions) {
            const updatedTxn = { ...txn, payeeId: null }
            store.saveTransaction(updatedTxn)
          }
        }

        store.deletePayee(payee.id)
        saveStore()

        const message =
          payeeTransactions.length > 0
            ? `Deleted payee: ${payee.name} (cleared from ${payeeTransactions.length} transactions)`
            : `Deleted payee: ${payee.name}`

        outputSuccess(message, options, { id: payee.id })
      } catch (error) {
        outputError(error as Error, options)
      }
    })
}
