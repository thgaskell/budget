import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Command } from 'commander'
import {
  MemoryStore,
  addTransaction,
  createAccount,
  createBudget,
  createCategory,
  createCategoryGroup,
  getCategoryBalances,
  getReadyToAssign,
} from '@budget/core'
import { setStore, resetStore } from '../../src/store.ts'
import { setActiveBudgetId, clearActiveBudgetId } from '../../src/config.ts'
import { registerTransactionCommands } from '../../src/commands/transaction.ts'

const TEST_CONFIG_DIR = join(tmpdir(), `budget-transfer-test-${process.pid}`)

interface CommandResult {
  output: string
  exitCode: number
}

/**
 * Run a CLI command through commander and capture its output.
 */
async function run(command: string): Promise<CommandResult> {
  const originalLog = console.log
  const originalError = console.error
  const originalExitCode = process.exitCode
  let output = ''

  console.log = (...args: unknown[]) => {
    output += args.map(String).join(' ') + '\n'
  }
  console.error = console.log

  try {
    const program = new Command()
    program
      .name('budget')
      .option('--json', 'Output in JSON format')
      .option('--quiet', 'Minimal output (IDs only)')
      .exitOverride()
    program.configureOutput({
      writeOut: (str) => {
        output += str
      },
      writeErr: (str) => {
        output += str
      },
    })
    registerTransactionCommands(program)

    await program.parseAsync(['node', 'budget', ...command.split(' ')])

    return { output: output.trim(), exitCode: (process.exitCode as number) ?? 0 }
  } catch {
    return { output: output.trim(), exitCode: 1 }
  } finally {
    console.log = originalLog
    console.error = originalError
    process.exitCode = originalExitCode
  }
}

describe('Transfer Commands', () => {
  let store: MemoryStore
  let budgetId: string
  let checkingId: string
  let savingsId: string
  let visaId: string
  let brokerageId: string
  let categoryId: string

  beforeEach(() => {
    process.env.BUDGET_CONFIG_DIR = TEST_CONFIG_DIR
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true })
    }

    store = new MemoryStore()
    setStore(store)

    const budget = createBudget({ name: 'Test Budget' })
    store.saveBudget(budget)
    budgetId = budget.id
    setActiveBudgetId(budgetId)

    const checking = createAccount({ budgetId, name: 'Checking', type: 'checking' })
    const savings = createAccount({ budgetId, name: 'Savings', type: 'savings' })
    const visa = createAccount({ budgetId, name: 'Visa', type: 'credit' })
    const brokerage = createAccount({ budgetId, name: 'Brokerage', type: 'tracking' })
    for (const account of [checking, savings, visa, brokerage]) {
      store.saveAccount(account)
    }
    checkingId = checking.id
    savingsId = savings.id
    visaId = visa.id
    brokerageId = brokerage.id

    const group = createCategoryGroup({ budgetId, name: 'Expenses' })
    store.saveCategoryGroup(group)
    const category = createCategory({ groupId: group.id, name: 'Investing' })
    store.saveCategory(category)
    categoryId = category.id
  })

  afterEach(() => {
    clearActiveBudgetId()
    resetStore()
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true })
    }
  })

  describe('tx transfer', () => {
    it('creates both legs and links them', async () => {
      const result = await run(
        'tx transfer --from Checking --to Savings --amount 500 --date 2025-01-15'
      )

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Transferred $500.00 from Checking to Savings')

      const outflow = store.listTransactions(checkingId)[0]
      const inflow = store.listTransactions(savingsId)[0]

      expect(outflow.amount).toBe(-50000)
      expect(outflow.transferAccountId).toBe(savingsId)
      expect(inflow.amount).toBe(50000)
      expect(inflow.transferAccountId).toBe(checkingId)
    })

    it('does not inflate Ready to Assign', async () => {
      await run('tx transfer --from Checking --to Savings --amount 500 --date 2025-01-15')

      expect(getReadyToAssign(store, budgetId, '2025-01')).toBe(0)
    })

    it('does not inflate Ready to Assign for a credit card payment', async () => {
      await run('tx transfer --from Checking --to Visa --amount 100 --date 2025-01-15')

      expect(getReadyToAssign(store, budgetId, '2025-01')).toBe(0)
      expect(store.listTransactions(visaId)[0].amount).toBe(10000)
    })

    it('resolves accounts by ID as well as by name', async () => {
      const result = await run(
        `tx transfer --from ${checkingId} --to ${savingsId} --amount 25 --date 2025-01-15`
      )

      expect(result.exitCode).toBe(0)
      expect(store.listTransactions(checkingId)[0].amount).toBe(-2500)
    })

    it('records memo and cleared status on both legs', async () => {
      await run(
        "tx transfer --from Checking --to Savings --amount 500 --date 2025-01-15 --memo Payday --cleared"
      )

      for (const accountId of [checkingId, savingsId]) {
        const txn = store.listTransactions(accountId)[0]
        expect(txn.memo).toBe('Payday')
        expect(txn.cleared).toBe(true)
      }
    })

    it('treats a negative amount as the size of the transfer', async () => {
      await run('tx transfer --from Checking --to Savings --amount -500 --date 2025-01-15')

      expect(store.listTransactions(checkingId)[0].amount).toBe(-50000)
      expect(store.listTransactions(savingsId)[0].amount).toBe(50000)
    })

    it('categorises the on-budget leg of an off-budget transfer', async () => {
      const result = await run(
        'tx transfer --from Checking --to Brokerage --amount 300 --category Investing --date 2025-01-15'
      )

      expect(result.exitCode).toBe(0)
      expect(store.listTransactions(checkingId)[0].categoryId).toBe(categoryId)
      expect(store.listTransactions(brokerageId)[0].categoryId).toBeNull()
    })

    it('rejects a category when both accounts are on-budget', async () => {
      const result = await run(
        'tx transfer --from Checking --to Savings --amount 300 --category Investing'
      )

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('exactly one account is off-budget')
      expect(store.listTransactions(checkingId)).toHaveLength(0)
    })

    it('rejects an unknown account', async () => {
      const result = await run('tx transfer --from Nowhere --to Savings --amount 10')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('Account not found: Nowhere')
    })

    it('rejects a zero amount', async () => {
      const result = await run('tx transfer --from Checking --to Savings --amount 0')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('Transfer amount must be greater than zero')
    })

    it('rejects a transfer to the same account', async () => {
      const result = await run('tx transfer --from Checking --to Checking --amount 10')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('Cannot transfer to the same account')
    })

    it('includes transferAccountId in JSON output', async () => {
      const result = await run(
        '--json tx transfer --from Checking --to Savings --amount 500 --date 2025-01-15'
      )

      const payload = JSON.parse(result.output)
      expect(payload.success).toBe(true)
      expect(payload.data.from.transferAccountId).toBe(savingsId)
      expect(payload.data.to.transferAccountId).toBe(checkingId)
    })
  })

  describe('tx link', () => {
    let outflowId: string
    let inflowId: string

    beforeEach(() => {
      outflowId = addTransaction(store, {
        accountId: checkingId,
        amount: -50000,
        date: '2025-01-15',
      }).id
      inflowId = addTransaction(store, {
        accountId: savingsId,
        amount: 50000,
        date: '2025-01-15',
      }).id
    })

    it('links two existing transactions and removes the phantom income', async () => {
      expect(getReadyToAssign(store, budgetId, '2025-01')).toBe(50000)

      const result = await run(`tx link ${outflowId} ${inflowId}`)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Linked transfer between Checking and Savings')
      expect(store.getTransaction(outflowId)?.transferAccountId).toBe(savingsId)
      expect(store.getTransaction(inflowId)?.transferAccountId).toBe(checkingId)
      expect(getReadyToAssign(store, budgetId, '2025-01')).toBe(0)
    })

    it('rejects an unknown transaction', async () => {
      const result = await run(`tx link ${outflowId} nope`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('Transaction not found: nope')
    })

    it('rejects a transaction from another budget', async () => {
      const otherBudget = createBudget({ name: 'Other' })
      const otherAccount = createAccount({
        budgetId: otherBudget.id,
        name: 'Other Checking',
        type: 'checking',
      })
      store.saveBudget(otherBudget)
      store.saveAccount(otherAccount)
      const foreign = addTransaction(store, {
        accountId: otherAccount.id,
        amount: 50000,
        date: '2025-01-15',
      })

      const result = await run(`tx link ${outflowId} ${foreign.id}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('does not belong to the active budget')
    })

    // A shared date is not evidence of a transfer; linking an unrelated pair used to
    // hide the inflow from Ready to Assign
    it('rejects a same-date pair whose amounts do not offset', async () => {
      const mismatched = addTransaction(store, {
        accountId: savingsId,
        amount: 25000,
        date: '2025-01-15',
      })
      const before = getReadyToAssign(store, budgetId, '2025-01')

      const result = await run(`tx link ${outflowId} ${mismatched.id}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must offset exactly')
      expect(store.getTransaction(outflowId)?.transferAccountId).toBeNull()
      expect(store.getTransaction(mismatched.id)?.transferAccountId).toBeNull()
      expect(getReadyToAssign(store, budgetId, '2025-01')).toBe(before)
    })

    it('rejects two outflows', async () => {
      const second = addTransaction(store, {
        accountId: savingsId,
        amount: -50000,
        date: '2025-01-15',
      })

      const result = await run(`tx link ${outflowId} ${second.id}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('A transfer needs one outflow and one inflow')
    })
  })

  describe('tx unlink', () => {
    it('clears the link on both sides and restores the inflow as income', async () => {
      await run('tx transfer --from Checking --to Savings --amount 500 --date 2025-01-15')
      const inflow = store.listTransactions(savingsId)[0]

      const result = await run(`tx unlink ${inflow.id}`)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Unlinked transfer on both transactions')
      expect(store.listTransactions(checkingId)[0].transferAccountId).toBeNull()
      expect(store.listTransactions(savingsId)[0].transferAccountId).toBeNull()
      expect(getReadyToAssign(store, budgetId, '2025-01')).toBe(50000)
    })

    it('rejects a transaction that is not a transfer', async () => {
      const txn = addTransaction(store, {
        accountId: checkingId,
        amount: -1000,
        date: '2025-01-15',
      })

      const result = await run(`tx unlink ${txn.id}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('not part of a transfer')
    })
  })

  describe('tx edit on a transfer leg', () => {
    beforeEach(async () => {
      await run('tx transfer --from Checking --to Savings --amount 500 --date 2025-01-15')
    })

    // Editing one leg used to leave the pair out of sync: $400 existed with no
    // income recorded and nothing indicating a problem
    it('keeps both legs in step when the amount changes', async () => {
      const inflow = store.listTransactions(savingsId)[0]

      const result = await run(`tx edit ${inflow.id} --amount 900`)

      expect(result.exitCode).toBe(0)
      expect(store.listTransactions(savingsId)[0].amount).toBe(90000)
      expect(store.listTransactions(checkingId)[0].amount).toBe(-90000)
      expect(getReadyToAssign(store, budgetId, '2025-01')).toBe(0)
    })

    // Categorising the inflow leg used to add $500 of spendable money to a category
    it('refuses a category when both accounts are on-budget', async () => {
      const inflow = store.listTransactions(savingsId)[0]

      const result = await run(`tx edit ${inflow.id} --category Investing`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('exactly one account is off-budget')
      expect(store.listTransactions(savingsId)[0].categoryId).toBeNull()
      expect(getCategoryBalances(store, categoryId, '2025-01').activity).toBe(0)
      expect(getCategoryBalances(store, categoryId, '2025-01').available).toBe(0)
    })

    // Moving a leg used to leave a stale transfer label and orphan the partner on delete
    it('repoints the other leg when a leg moves to another account', async () => {
      const outflow = store.listTransactions(checkingId)[0]

      const result = await run(`tx edit ${outflow.id} --account Visa`)

      expect(result.exitCode).toBe(0)
      expect(store.listTransactions(visaId)[0].transferAccountId).toBe(savingsId)
      expect(store.listTransactions(savingsId)[0].transferAccountId).toBe(visaId)

      await run(`tx delete ${outflow.id}`)

      expect(store.listTransactions(visaId)).toHaveLength(0)
      expect(store.listTransactions(savingsId)).toHaveLength(0)
    })

    it('still allows edits that cannot break the pair', async () => {
      const inflow = store.listTransactions(savingsId)[0]

      const result = await run(`tx edit ${inflow.id} --memo Payday`)

      expect(result.exitCode).toBe(0)
      expect(result.output).toBe('Transaction updated')
      expect(store.listTransactions(savingsId)[0].memo).toBe('Payday')
      expect(store.listTransactions(savingsId)[0].amount).toBe(50000)
      expect(store.listTransactions(checkingId)[0].amount).toBe(-50000)
    })
  })

  describe('tx delete', () => {
    it('deletes both legs of a transfer', async () => {
      await run('tx transfer --from Checking --to Savings --amount 500 --date 2025-01-15')
      const outflow = store.listTransactions(checkingId)[0]

      const result = await run(`tx delete ${outflow.id}`)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Transaction deleted')
      expect(store.listTransactions(checkingId)).toHaveLength(0)
      expect(store.listTransactions(savingsId)).toHaveLength(0)
    })

    it('deletes a plain transaction on its own', async () => {
      const txn = addTransaction(store, {
        accountId: checkingId,
        amount: -1000,
        date: '2025-01-15',
      })
      addTransaction(store, { accountId: savingsId, amount: 2000, date: '2025-01-15' })

      const result = await run(`tx delete ${txn.id}`)

      expect(result.exitCode).toBe(0)
      expect(store.listTransactions(checkingId)).toHaveLength(0)
      expect(store.listTransactions(savingsId)).toHaveLength(1)
    })
  })
})
