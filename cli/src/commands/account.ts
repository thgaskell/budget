import { Command } from 'commander'
import {
  createAccount,
  getAccountBalances,
  type AccountType,
} from '@budget/core'
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

const ACCOUNT_TYPES: AccountType[] = ['checking', 'savings', 'credit', 'cash', 'tracking']

/**
 * Register account commands.
 */
export function registerAccountCommands(program: Command): void {
  const account = program
    .command('account')
    .description('Account management commands')

  // account add <name>
  account
    .command('add <name>')
    .description('Create a new account')
    .requiredOption('--type <type>', `Account type: ${ACCOUNT_TYPES.join(', ')}`)
    .option('--off-budget', 'Create as tracking (off-budget) account')
    .action(async (name: string, opts: { type: string; offBudget?: boolean }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const accountType = opts.type.toLowerCase() as AccountType
        if (!ACCOUNT_TYPES.includes(accountType)) {
          throw new Error(
            `Invalid account type: ${opts.type}. Valid types: ${ACCOUNT_TYPES.join(', ')}`
          )
        }

        const account = createAccount({
          budgetId,
          name,
          type: accountType,
          onBudget: opts.offBudget ? false : accountType !== 'tracking',
        })

        store.saveAccount(account)
        saveStore()

        outputSuccess(`Created account: ${account.name}`, options, account)
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // account list
  account
    .command('list')
    .description('List all accounts with balances')
    .action(async () => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()
        const accounts = store.listAccounts(budgetId)

        if (options.json) {
          const data = accounts.map((acc) => {
            const balances = getAccountBalances(store, acc.id)
            return { ...acc, balances }
          })
          console.log(JSON.stringify(data, null, 2))
        } else if (options.quiet) {
          for (const acc of accounts) {
            console.log(acc.id)
          }
        } else {
          if (accounts.length === 0) {
            console.log(
              colors.dim('No accounts found. Add one with "budget account add <name> --type <type>".')
            )
            return
          }

          const budget = store.getBudget(budgetId)
          const currency = budget?.currency ?? 'USD'

          outputTable(
            ['ID', 'Name', 'Type', 'On Budget', 'Cleared', 'Uncleared', 'Working'],
            accounts.map((acc) => {
              const balances = getAccountBalances(store, acc.id)
              return [
                acc.id.substring(0, 8) + '...',
                acc.name,
                acc.type,
                acc.onBudget ? 'Yes' : 'No',
                formatAmountColored(balances.cleared, currency),
                formatAmountColored(balances.uncleared, currency),
                formatAmountColored(balances.working, currency),
              ]
            }),
            options
          )
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // account show <id|name>
  account
    .command('show <idOrName>')
    .description('Show account details and recent transactions')
    .option('--limit <n>', 'Number of recent transactions to show', '10')
    .action(async (idOrName: string, opts: { limit: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()
        const accounts = store.listAccounts(budgetId)

        // Find by ID or name
        let account = accounts.find((a) => a.id === idOrName)
        if (!account) {
          account = accounts.find(
            (a) => a.name.toLowerCase() === idOrName.toLowerCase()
          )
        }

        if (!account) {
          throw new Error(`Account not found: ${idOrName}`)
        }

        const balances = getAccountBalances(store, account.id)
        const transactions = store.listTransactions(account.id)
        const limit = parseInt(opts.limit, 10)
        const recentTxns = transactions.slice(-limit).reverse()

        const budget = store.getBudget(budgetId)
        const currency = budget?.currency ?? 'USD'

        if (options.json) {
          console.log(
            JSON.stringify({ account, balances, recentTransactions: recentTxns }, null, 2)
          )
        } else if (options.quiet) {
          console.log(account.id)
        } else {
          console.log(colors.bold('Account Details'))
          console.log(`ID:         ${account.id}`)
          console.log(`Name:       ${account.name}`)
          console.log(`Type:       ${account.type}`)
          console.log(`On Budget:  ${account.onBudget ? 'Yes' : 'No'}`)
          console.log()
          console.log(colors.bold('Balances'))
          console.log(`Cleared:    ${formatAmountColored(balances.cleared, currency)}`)
          console.log(`Uncleared:  ${formatAmountColored(balances.uncleared, currency)}`)
          console.log(`Working:    ${formatAmountColored(balances.working, currency)}`)

          if (recentTxns.length > 0) {
            console.log()
            console.log(colors.bold(`Recent Transactions (${recentTxns.length})`))
            outputTable(
              ['Date', 'Payee', 'Category', 'Amount', 'Cleared'],
              recentTxns.map((txn) => {
                const payee = txn.payeeId ? store.getPayee(txn.payeeId)?.name : ''
                const category = txn.categoryId
                  ? store.getCategory(txn.categoryId)?.name
                  : ''
                return [
                  txn.date,
                  payee || colors.dim('(no payee)'),
                  category || colors.dim('(uncategorized)'),
                  formatAmountColored(txn.amount, currency),
                  txn.cleared ? 'C' : '',
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

  // account edit <id|name>
  account
    .command('edit <idOrName>')
    .description('Edit an existing account')
    .option('--name <name>', 'New account name')
    .option('--type <type>', `New account type: ${ACCOUNT_TYPES.join(', ')}`)
    .action(async (idOrName: string, opts: { name?: string; type?: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()
        const accounts = store.listAccounts(budgetId)

        // Find by ID or name
        let account = accounts.find((a) => a.id === idOrName)
        if (!account) {
          account = accounts.find(
            (a) => a.name.toLowerCase() === idOrName.toLowerCase()
          )
        }

        if (!account) {
          throw new Error(`Account not found: ${idOrName}`)
        }

        if (!opts.name && !opts.type) {
          throw new Error('At least one of --name or --type must be provided')
        }

        // Validate type if provided
        if (opts.type) {
          const accountType = opts.type.toLowerCase() as AccountType
          if (!ACCOUNT_TYPES.includes(accountType)) {
            throw new Error(
              `Invalid account type: ${opts.type}. Valid types: ${ACCOUNT_TYPES.join(', ')}`
            )
          }
          account = { ...account, type: accountType }
        }

        // Update name if provided
        if (opts.name) {
          account = { ...account, name: opts.name }
        }

        store.saveAccount(account)
        saveStore()

        outputSuccess(`Updated account: ${account.name}`, options, account)
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // account delete <id>
  account
    .command('delete <id>')
    .description('Delete an account')
    .option('--force', 'Skip confirmation')
    .action(async (id: string, _opts: { force?: boolean }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const account = store.getAccount(id)
        if (!account) {
          throw new Error(`Account not found: ${id}`)
        }

        if (account.budgetId !== budgetId) {
          throw new Error('Account does not belong to the active budget.')
        }

        // Delete all transactions for this account
        const transactions = store.listTransactions(id)
        for (const txn of transactions) {
          store.deleteTransaction(txn.id)
        }

        store.deleteAccount(id)
        saveStore()

        outputSuccess(`Deleted account: ${account.name}`, options, { id })
      } catch (error) {
        outputError(error as Error, options)
      }
    })
}
