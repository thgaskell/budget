import { Command } from 'commander'
import {
  addTransaction,
  createPayee,
  formatCurrency,
  type Transaction,
} from '@budget/core'
import { getStore, saveStore } from '../store.ts'
import { requireActiveBudgetId } from '../config.ts'
import { parseAmount } from '../utils/parse-amount.ts'
import { parseDate, getTodayISO } from '../utils/parse-date.ts'
import {
  outputSuccess,
  outputError,
  outputTable,
  colors,
  formatAmountColored,
  type OutputOptions,
} from '../output.ts'

/**
 * Find an account by ID or name within the active budget.
 */
function findAccount(store: ReturnType<typeof getStore>, budgetId: string, idOrName: string) {
  const accounts = store.listAccounts(budgetId)
  let account = accounts.find((a) => a.id === idOrName)
  if (!account) {
    account = accounts.find((a) => a.name.toLowerCase() === idOrName.toLowerCase())
  }
  return account
}

/**
 * Find a category by ID or name within the active budget.
 */
function findCategory(store: ReturnType<typeof getStore>, budgetId: string, idOrName: string) {
  const categories = store.listCategories(budgetId)
  let category = categories.find((c) => c.id === idOrName)
  if (!category) {
    category = categories.find((c) => c.name.toLowerCase() === idOrName.toLowerCase())
  }
  return category
}

/**
 * Find or create a payee by name within the active budget.
 */
function findOrCreatePayee(store: ReturnType<typeof getStore>, budgetId: string, name: string) {
  const payees = store.listPayees(budgetId)
  let payee = payees.find((p) => p.name.toLowerCase() === name.toLowerCase())
  if (!payee) {
    payee = createPayee({ budgetId, name })
    store.savePayee(payee)
  }
  return payee
}

/**
 * Register transaction commands.
 */
export function registerTransactionCommands(program: Command): void {
  const tx = program
    .command('tx')
    .description('Transaction management commands')

  // tx add
  tx
    .command('add')
    .description('Add a new transaction')
    .requiredOption('--account <id|name>', 'Account ID or name')
    .requiredOption('--amount <amount>', 'Amount (negative for outflow)')
    .requiredOption('--payee <name>', 'Payee name')
    .option('--category <id|name>', 'Category ID or name')
    .option('--date <date>', 'Transaction date (default: today)')
    .option('--memo <text>', 'Transaction memo')
    .option('--cleared', 'Mark as cleared')
    .action(
      async (opts: {
        account: string
        amount: string
        payee: string
        category?: string
        date?: string
        memo?: string
        cleared?: boolean
      }) => {
        const options = program.opts() as OutputOptions
        try {
          const budgetId = requireActiveBudgetId()
          const store = getStore()

          // Find account
          const account = findAccount(store, budgetId, opts.account)
          if (!account) {
            throw new Error(`Account not found: ${opts.account}`)
          }

          // Parse amount
          const amount = parseAmount(opts.amount)

          // Parse date
          const date = opts.date ? parseDate(opts.date) : getTodayISO()

          // Find or create payee
          const payee = findOrCreatePayee(store, budgetId, opts.payee)

          // Find category (optional)
          let categoryId: string | null = null
          if (opts.category) {
            const category = findCategory(store, budgetId, opts.category)
            if (!category) {
              throw new Error(`Category not found: ${opts.category}`)
            }
            categoryId = category.id
          }

          // Create transaction
          const transaction = addTransaction(store, {
            accountId: account.id,
            amount,
            date,
            payeeId: payee.id,
            categoryId,
            memo: opts.memo ?? null,
            cleared: opts.cleared ?? false,
          })

          saveStore()

          outputSuccess(
            `Added transaction: ${formatCurrency(amount)} to ${payee.name}`,
            options,
            transaction
          )
        } catch (error) {
          outputError(error as Error, options)
        }
      }
    )

  // tx list
  tx
    .command('list')
    .description('List transactions')
    .option('--account <id|name>', 'Filter by account')
    .option('--from <date>', 'Start date')
    .option('--to <date>', 'End date')
    .option('--limit <n>', 'Maximum number to show', '50')
    .action(
      async (opts: {
        account?: string
        from?: string
        to?: string
        limit: string
      }) => {
        const options = program.opts() as OutputOptions
        try {
          const budgetId = requireActiveBudgetId()
          const store = getStore()

          const budget = store.getBudget(budgetId)
          const currency = budget?.currency ?? 'USD'

          let transactions: Transaction[]

          const queryOptions = {
            from: opts.from ? parseDate(opts.from) : undefined,
            to: opts.to ? parseDate(opts.to) : undefined,
          }

          if (opts.account) {
            const account = findAccount(store, budgetId, opts.account)
            if (!account) {
              throw new Error(`Account not found: ${opts.account}`)
            }
            transactions = store.listTransactions(account.id, queryOptions)
          } else {
            transactions = store.listAllTransactions(budgetId, queryOptions)
          }

          const limit = parseInt(opts.limit, 10)
          const limited = transactions.slice(-limit).reverse()

          if (options.json) {
            console.log(JSON.stringify(limited, null, 2))
          } else if (options.quiet) {
            for (const txn of limited) {
              console.log(txn.id)
            }
          } else {
            if (limited.length === 0) {
              console.log(colors.dim('No transactions found.'))
              return
            }

            outputTable(
              ['ID', 'Date', 'Account', 'Payee', 'Category', 'Amount', 'C'],
              limited.map((txn) => {
                const account = store.getAccount(txn.accountId)
                const payee = txn.payeeId ? store.getPayee(txn.payeeId) : null
                const category = txn.categoryId
                  ? store.getCategory(txn.categoryId)
                  : null

                return [
                  txn.id.substring(0, 8) + '...',
                  txn.date,
                  account?.name ?? '',
                  payee?.name ?? colors.dim('(no payee)'),
                  category?.name ?? colors.dim('(none)'),
                  formatAmountColored(txn.amount, currency),
                  txn.cleared ? 'C' : '',
                ]
              }),
              options
            )
          }
        } catch (error) {
          outputError(error as Error, options)
        }
      }
    )

  // tx show <id>
  tx
    .command('show <id>')
    .description('Show transaction details')
    .action(async (id: string) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const transaction = store.getTransaction(id)
        if (!transaction) {
          throw new Error(`Transaction not found: ${id}`)
        }

        const account = store.getAccount(transaction.accountId)
        if (account?.budgetId !== budgetId) {
          throw new Error('Transaction does not belong to the active budget.')
        }

        const budget = store.getBudget(budgetId)
        const currency = budget?.currency ?? 'USD'

        const payee = transaction.payeeId
          ? store.getPayee(transaction.payeeId)
          : null
        const category = transaction.categoryId
          ? store.getCategory(transaction.categoryId)
          : null

        if (options.json) {
          console.log(
            JSON.stringify(
              { transaction, account, payee, category },
              null,
              2
            )
          )
        } else if (options.quiet) {
          console.log(transaction.id)
        } else {
          console.log(colors.bold('Transaction Details'))
          console.log(`ID:       ${transaction.id}`)
          console.log(`Date:     ${transaction.date}`)
          console.log(`Account:  ${account?.name ?? transaction.accountId}`)
          console.log(`Payee:    ${payee?.name ?? '(no payee)'}`)
          console.log(`Category: ${category?.name ?? '(uncategorized)'}`)
          console.log(
            `Amount:   ${formatAmountColored(transaction.amount, currency)}`
          )
          console.log(`Cleared:  ${transaction.cleared ? 'Yes' : 'No'}`)
          if (transaction.memo) {
            console.log(`Memo:     ${transaction.memo}`)
          }
          if (transaction.transferAccountId) {
            const transferAccount = store.getAccount(
              transaction.transferAccountId
            )
            console.log(
              `Transfer: ${transferAccount?.name ?? transaction.transferAccountId}`
            )
          }
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // tx edit <id>
  tx
    .command('edit <id>')
    .description('Edit a transaction')
    .option('--amount <amount>', 'New amount')
    .option('--payee <name>', 'New payee')
    .option('--category <id|name>', 'New category')
    .option('--memo <text>', 'New memo')
    .option('--cleared', 'Mark as cleared')
    .option('--no-cleared', 'Mark as uncleared')
    .action(
      async (
        id: string,
        opts: {
          amount?: string
          payee?: string
          category?: string
          memo?: string
          cleared?: boolean
        }
      ) => {
        const options = program.opts() as OutputOptions
        try {
          const budgetId = requireActiveBudgetId()
          const store = getStore()

          const transaction = store.getTransaction(id)
          if (!transaction) {
            throw new Error(`Transaction not found: ${id}`)
          }

          const account = store.getAccount(transaction.accountId)
          if (account?.budgetId !== budgetId) {
            throw new Error('Transaction does not belong to the active budget.')
          }

          // Apply updates
          const updated = { ...transaction }

          if (opts.amount !== undefined) {
            updated.amount = parseAmount(opts.amount)
          }

          if (opts.payee !== undefined) {
            const payee = findOrCreatePayee(store, budgetId, opts.payee)
            updated.payeeId = payee.id
          }

          if (opts.category !== undefined) {
            const category = findCategory(store, budgetId, opts.category)
            if (!category) {
              throw new Error(`Category not found: ${opts.category}`)
            }
            updated.categoryId = category.id
          }

          if (opts.memo !== undefined) {
            updated.memo = opts.memo || null
          }

          if (opts.cleared !== undefined) {
            updated.cleared = opts.cleared
          }

          store.saveTransaction(updated)
          saveStore()

          outputSuccess('Transaction updated', options, updated)
        } catch (error) {
          outputError(error as Error, options)
        }
      }
    )

  // tx delete <id>
  tx
    .command('delete <id>')
    .description('Delete a transaction')
    .option('--force', 'Skip confirmation')
    .action(async (id: string, _opts: { force?: boolean }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const transaction = store.getTransaction(id)
        if (!transaction) {
          throw new Error(`Transaction not found: ${id}`)
        }

        const account = store.getAccount(transaction.accountId)
        if (account?.budgetId !== budgetId) {
          throw new Error('Transaction does not belong to the active budget.')
        }

        store.deleteTransaction(id)
        saveStore()

        outputSuccess('Transaction deleted', options, { id })
      } catch (error) {
        outputError(error as Error, options)
      }
    })
}
