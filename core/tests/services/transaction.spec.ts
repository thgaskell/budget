import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '../../src/stores/memory.ts'
import { SqliteStore } from '../../src/stores/sqlite.ts'
import type { Store } from '../../src/stores/types.ts'
import { createBudget } from '../../src/schemas/budget.ts'
import { createAccount } from '../../src/schemas/account.ts'
import { createCategoryGroup } from '../../src/schemas/category-group.ts'
import { createCategory } from '../../src/schemas/category.ts'
import {
  addTransaction,
  countsAsIncome,
  createTransfer,
  deleteTransactionWithTransfer,
  findTransferPartner,
  linkTransactions,
  setTransactionCleared,
  reassignTransaction,
  unlinkTransaction,
  updateTransaction,
} from '../../src/services/transaction.ts'

describe.each([
  ['MemoryStore', async () => new MemoryStore()],
  ['SqliteStore', async () => {
    const store = await SqliteStore.create()
    store.migrate()
    return store
  }],
])('Transaction Service with %s', (_, createStore) => {
  let store: Store
  let budget: ReturnType<typeof createBudget>
  let account: ReturnType<typeof createAccount>
  let group: ReturnType<typeof createCategoryGroup>
  let category: ReturnType<typeof createCategory>

  beforeEach(async () => {
    store = await createStore()
    budget = createBudget({ name: 'Test' })
    account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })
    group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
    category = createCategory({ groupId: group.id, name: 'Groceries' })

    store.saveBudget(budget)
    store.saveAccount(account)
    store.saveCategoryGroup(group)
    store.saveCategory(category)
  })

  describe('addTransaction', () => {
    it('creates and saves a transaction', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        categoryId: category.id,
      })

      expect(txn.id).toBeDefined()
      expect(store.getTransaction(txn.id)).toEqual(txn)
    })

    it('accepts all optional fields', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        categoryId: category.id,
        payeeId: 'payee-1',
        memo: 'Test purchase',
        cleared: true,
      })

      expect(txn.categoryId).toBe(category.id)
      expect(txn.payeeId).toBe('payee-1')
      expect(txn.memo).toBe('Test purchase')
      expect(txn.cleared).toBe(true)
    })
  })

  describe('createTransfer', () => {
    it('creates two linked transactions for a transfer', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(from.accountId).toBe(account.id)
      expect(from.amount).toBe(-10000) // Outflow is negative
      expect(from.transferId).toBe(to.id)
      expect(to.transferId).toBe(from.id)
      expect(from.transferAccountId).toBe(savings.id)

      expect(to.accountId).toBe(savings.id)
      expect(to.amount).toBe(10000) // Inflow is positive
      expect(to.transferAccountId).toBe(account.id)
    })

    it('sets no category for budget-to-budget transfers', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(from.categoryId).toBeNull()
      expect(to.categoryId).toBeNull()
    })

    it('saves both transactions to the store', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(store.getTransaction(from.id)).toBeDefined()
      expect(store.getTransaction(to.id)).toBeDefined()
    })

    it('throws for invalid account IDs', () => {
      expect(() =>
        createTransfer(store, {
          fromAccountId: 'invalid',
          toAccountId: account.id,
          amount: 10000,
          date: '2024-01-15',
        })
      ).toThrow('Invalid account ID')
    })

    it('preserves memo and cleared status', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
        memo: 'Monthly savings',
        cleared: true,
      })

      expect(from.memo).toBe('Monthly savings')
      expect(from.cleared).toBe(true)
      expect(to.memo).toBe('Monthly savings')
      expect(to.cleared).toBe(true)
    })

    it('throws when transferring to the same account', () => {
      expect(() =>
        createTransfer(store, {
          fromAccountId: account.id,
          toAccountId: account.id,
          amount: 10000,
          date: '2024-01-15',
        })
      ).toThrow('Cannot transfer to the same account')
    })

    it('rejects a category on a transfer between two on-budget accounts', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      expect(() =>
        createTransfer(store, {
          fromAccountId: account.id,
          toAccountId: savings.id,
          amount: 10000,
          date: '2024-01-15',
          categoryId: category.id,
        })
      ).toThrow('exactly one account is off-budget')
    })

    it('puts the category on the on-budget leg when the other side is off-budget', () => {
      const brokerage = createAccount({ budgetId: budget.id, name: 'Brokerage', type: 'tracking' })
      store.saveAccount(brokerage)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: brokerage.id,
        amount: 10000,
        date: '2024-01-15',
        categoryId: category.id,
      })

      expect(from.categoryId).toBe(category.id)
      expect(to.categoryId).toBeNull()
    })
  })

  describe('setTransactionCleared', () => {
    it('updates cleared status to true', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        cleared: false,
      })

      const updated = setTransactionCleared(store, txn.id, true)

      expect(updated?.cleared).toBe(true)
      expect(store.getTransaction(txn.id)?.cleared).toBe(true)
    })

    it('updates cleared status to false', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        cleared: true,
      })

      const updated = setTransactionCleared(store, txn.id, false)

      expect(updated?.cleared).toBe(false)
    })

    it('returns null for non-existent transaction', () => {
      const result = setTransactionCleared(store, 'non-existent', true)

      expect(result).toBeNull()
    })
  })

  describe('reassignTransaction', () => {
    it('changes transaction category', () => {
      const category2 = createCategory({ groupId: group.id, name: 'Dining' })
      store.saveCategory(category2)

      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        categoryId: category.id,
      })

      const updated = reassignTransaction(store, txn.id, category2.id)

      expect(updated?.categoryId).toBe(category2.id)
      expect(store.getTransaction(txn.id)?.categoryId).toBe(category2.id)
    })

    it('can remove category (set to null)', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
        categoryId: category.id,
      })

      const updated = reassignTransaction(store, txn.id, null)

      expect(updated?.categoryId).toBeNull()
    })

    it('returns null for non-existent transaction', () => {
      const result = reassignTransaction(store, 'non-existent', category.id)

      expect(result).toBeNull()
    })

    it('refuses to categorise a transfer between two on-budget accounts', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 50000,
        date: '2024-01-15',
      })

      expect(() => reassignTransaction(store, to.id, category.id)).toThrow(
        'exactly one account is off-budget'
      )
      expect(store.getTransaction(to.id)?.categoryId).toBeNull()
    })
  })

  describe('findTransferPartner', () => {
    it('finds the other leg of a transfer', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(findTransferPartner(store, from)?.id).toBe(to.id)
      expect(findTransferPartner(store, to)?.id).toBe(from.id)
    })

    it('returns null for a transaction that is not a transfer', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
      })

      expect(findTransferPartner(store, txn)).toBeNull()
    })

    it('returns the recorded partner, not a matching leg of another transfer', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const first = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })
      const second = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(findTransferPartner(store, first.from)?.id).toBe(first.to.id)
      expect(findTransferPartner(store, second.from)?.id).toBe(second.to.id)
    })

    it('returns null when the partner was never recorded', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      // A leg written before transfers recorded their partner's id
      store.saveTransaction({ ...from, transferId: null })

      expect(findTransferPartner(store, store.getTransaction(from.id)!)).toBeNull()
    })

    it('returns null when the partner row is gone', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })
      store.deleteTransaction(to.id)

      expect(findTransferPartner(store, from)).toBeNull()
    })

    it('finds a partner linked after the fact, whatever the dates', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const outflow = addTransaction(store, {
        accountId: account.id,
        amount: -10000,
        date: '2024-01-15',
      })
      const inflow = addTransaction(store, {
        accountId: savings.id,
        amount: 10000,
        date: '2024-01-17',
      })
      linkTransactions(store, outflow.id, inflow.id)

      const linkedOutflow = store.getTransaction(outflow.id)!
      expect(findTransferPartner(store, linkedOutflow)?.id).toBe(inflow.id)
    })
  })

  describe('linkTransactions', () => {
    let savings: ReturnType<typeof createAccount>

    beforeEach(() => {
      savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)
    })

    it('links two existing transactions as a transfer pair', () => {
      const outflow = addTransaction(store, {
        accountId: account.id,
        amount: -10000,
        date: '2024-01-15',
      })
      const inflow = addTransaction(store, {
        accountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      const linked = linkTransactions(store, outflow.id, inflow.id)

      expect(linked.first.transferAccountId).toBe(savings.id)
      expect(linked.second.transferAccountId).toBe(account.id)
      expect(store.getTransaction(outflow.id)?.transferAccountId).toBe(savings.id)
      expect(store.getTransaction(inflow.id)?.transferAccountId).toBe(account.id)
      expect(store.getTransaction(outflow.id)?.transferId).toBe(inflow.id)
      expect(store.getTransaction(inflow.id)?.transferId).toBe(outflow.id)
    })

    it('throws for a missing transaction', () => {
      const outflow = addTransaction(store, {
        accountId: account.id,
        amount: -10000,
        date: '2024-01-15',
      })

      expect(() => linkTransactions(store, outflow.id, 'non-existent')).toThrow(
        'Transaction not found: non-existent'
      )
    })

    it('throws when linking a transaction to itself', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -10000,
        date: '2024-01-15',
      })

      expect(() => linkTransactions(store, txn.id, txn.id)).toThrow(
        'Cannot link a transaction to itself'
      )
    })

    it('throws when both transactions are in the same account', () => {
      const outflow = addTransaction(store, {
        accountId: account.id,
        amount: -10000,
        date: '2024-01-15',
      })
      const inflow = addTransaction(store, {
        accountId: account.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(() => linkTransactions(store, outflow.id, inflow.id)).toThrow(
        'Cannot link two transactions in the same account'
      )
    })

    it('throws when both legs move money the same way', () => {
      const first = addTransaction(store, {
        accountId: account.id,
        amount: -10000,
        date: '2024-01-15',
      })
      const second = addTransaction(store, {
        accountId: savings.id,
        amount: -10000,
        date: '2024-01-15',
      })

      expect(() => linkTransactions(store, first.id, second.id)).toThrow(
        'A transfer needs one outflow and one inflow'
      )
    })

    it('throws when a transaction is already part of a transfer', () => {
      const { from } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })
      const inflow = addTransaction(store, {
        accountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(() => linkTransactions(store, from.id, inflow.id)).toThrow(
        'already part of a transfer'
      )
    })

    it('throws when the legs do not offset each other', () => {
      const outflow = addTransaction(store, {
        accountId: account.id,
        amount: -10000,
        date: '2024-01-15',
      })
      const inflow = addTransaction(store, {
        accountId: savings.id,
        amount: 9000,
        date: '2024-01-17',
      })

      expect(() => linkTransactions(store, outflow.id, inflow.id)).toThrow(
        'must offset exactly'
      )
    })

    // A shared date is not evidence of a transfer: linking an unrelated same-date pair
    // used to be accepted, which hid the inflow from Ready to Assign
    it('throws when a same-date pair does not offset', () => {
      const outflow = addTransaction(store, {
        accountId: account.id,
        amount: -10000,
        date: '2024-06-01',
      })
      const inflow = addTransaction(store, {
        accountId: savings.id,
        amount: 25000,
        date: '2024-06-01',
      })

      expect(() => linkTransactions(store, outflow.id, inflow.id)).toThrow(
        'must offset exactly'
      )
      expect(store.getTransaction(outflow.id)?.transferAccountId).toBeNull()
      expect(store.getTransaction(inflow.id)?.transferAccountId).toBeNull()
    })

    it('throws when the transactions belong to different budgets', () => {
      const otherBudget = createBudget({ name: 'Other' })
      const otherAccount = createAccount({
        budgetId: otherBudget.id,
        name: 'Other Checking',
        type: 'checking',
      })
      store.saveBudget(otherBudget)
      store.saveAccount(otherAccount)

      const outflow = addTransaction(store, {
        accountId: account.id,
        amount: -10000,
        date: '2024-01-15',
      })
      const inflow = addTransaction(store, {
        accountId: otherAccount.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(() => linkTransactions(store, outflow.id, inflow.id)).toThrow(
        'Cannot link transactions from different budgets'
      )
    })
  })

  describe('unlinkTransaction', () => {
    it('clears the link on both sides and keeps both rows', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      const result = unlinkTransaction(store, from.id)

      expect(result.partner?.id).toBe(to.id)
      expect(store.getTransaction(from.id)?.transferAccountId).toBeNull()
      expect(store.getTransaction(to.id)?.transferAccountId).toBeNull()
      expect(store.getTransaction(from.id)?.transferId).toBeNull()
      expect(store.getTransaction(to.id)?.transferId).toBeNull()
    })

    it('throws for a transaction that is not a transfer', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
      })

      expect(() => unlinkTransaction(store, txn.id)).toThrow('not part of a transfer')
    })

    it('throws for a missing transaction', () => {
      expect(() => unlinkTransaction(store, 'non-existent')).toThrow(
        'Transaction not found: non-existent'
      )
    })
  })

  describe('updateTransaction', () => {
    let savings: ReturnType<typeof createAccount>
    let brokerage: ReturnType<typeof createAccount>

    beforeEach(() => {
      savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      brokerage = createAccount({ budgetId: budget.id, name: 'Brokerage', type: 'tracking' })
      store.saveAccount(savings)
      store.saveAccount(brokerage)
    })

    function transfer() {
      return createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 50000,
        date: '2024-01-15',
      })
    }

    it('updates a plain transaction', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
      })

      const result = updateTransaction(store, txn.id, {
        amount: -7500,
        categoryId: category.id,
        memo: 'Corrected',
      })

      expect(result.partner).toBeNull()
      expect(store.getTransaction(txn.id)?.amount).toBe(-7500)
      expect(store.getTransaction(txn.id)?.categoryId).toBe(category.id)
      expect(store.getTransaction(txn.id)?.memo).toBe('Corrected')
    })

    it('throws for a missing transaction', () => {
      expect(() => updateTransaction(store, 'non-existent', { memo: 'x' })).toThrow(
        'Transaction not found: non-existent'
      )
    })

    // Editing one leg used to leave the pair inconsistent: money left one account
    // and a different amount arrived in the other
    it('mirrors an amount change onto the other leg', () => {
      const { from, to } = transfer()

      const result = updateTransaction(store, to.id, { amount: 90000 })

      expect(result.transaction.amount).toBe(90000)
      expect(result.partner?.amount).toBe(-90000)
      expect(store.getTransaction(from.id)?.amount).toBe(-90000)
      expect(store.getTransaction(to.id)?.amount).toBe(90000)
    })

    it('repoints the other leg when one leg moves to a different account', () => {
      const { from, to } = transfer()
      const cash = createAccount({ budgetId: budget.id, name: 'Cash', type: 'cash' })
      store.saveAccount(cash)

      updateTransaction(store, from.id, { accountId: cash.id })

      const moved = store.getTransaction(from.id)!
      expect(moved.accountId).toBe(cash.id)
      expect(store.getTransaction(to.id)?.transferAccountId).toBe(cash.id)
      expect(findTransferPartner(store, moved)?.id).toBe(to.id)
    })

    it('rejects a category on a transfer leg when both accounts are on-budget', () => {
      const { to } = transfer()

      expect(() => updateTransaction(store, to.id, { categoryId: category.id })).toThrow(
        'exactly one account is off-budget'
      )
      expect(store.getTransaction(to.id)?.categoryId).toBeNull()
    })

    it('allows a category on the on-budget leg of an off-budget transfer', () => {
      const { from } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: brokerage.id,
        amount: 30000,
        date: '2024-01-15',
      })

      const result = updateTransaction(store, from.id, { categoryId: category.id })

      expect(result.transaction.categoryId).toBe(category.id)
      expect(store.getTransaction(from.id)?.categoryId).toBe(category.id)
    })

    it('rejects a category on the off-budget leg of a transfer', () => {
      const { to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: brokerage.id,
        amount: 30000,
        date: '2024-01-15',
      })

      expect(() => updateTransaction(store, to.id, { categoryId: category.id })).toThrow(
        'on-budget leg'
      )
    })

    it('rejects an amount of zero on a transfer leg', () => {
      const { from } = transfer()

      expect(() => updateTransaction(store, from.id, { amount: 0 })).toThrow(
        'one outflow and one inflow'
      )
      expect(store.getTransaction(from.id)?.amount).toBe(-50000)
    })

    it('leaves the other leg alone for edits that cannot break the pair', () => {
      const { from, to } = transfer()

      updateTransaction(store, from.id, { memo: 'Payday', cleared: true, date: '2024-01-16' })

      expect(store.getTransaction(from.id)?.memo).toBe('Payday')
      expect(store.getTransaction(from.id)?.cleared).toBe(true)
      expect(store.getTransaction(from.id)?.date).toBe('2024-01-16')
      expect(store.getTransaction(to.id)?.memo).toBeNull()
      expect(store.getTransaction(to.id)?.date).toBe('2024-01-15')
      expect(findTransferPartner(store, store.getTransaction(from.id)!)?.id).toBe(to.id)
    })

    it('refuses a pair-changing edit when the other leg cannot be found', () => {
      const { from, to } = transfer()
      store.deleteTransaction(to.id)

      expect(() => updateTransaction(store, from.id, { amount: -10000 })).toThrow(
        'other leg'
      )
      expect(store.getTransaction(from.id)?.amount).toBe(-50000)
    })
  })

  describe('deleteTransactionWithTransfer', () => {
    it('deletes both legs when given either one', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      deleteTransactionWithTransfer(store, to.id)

      expect(store.getTransaction(from.id)).toBeNull()
      expect(store.getTransaction(to.id)).toBeNull()
    })

    it('deletes a plain transaction', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -5000,
        date: '2024-01-15',
      })

      deleteTransactionWithTransfer(store, txn.id)

      expect(store.getTransaction(txn.id)).toBeNull()
    })

    it('does nothing for a missing transaction', () => {
      expect(() => deleteTransactionWithTransfer(store, 'non-existent')).not.toThrow()
    })

    it('leaves unrelated transfers alone', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const first = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })
      const second = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 2500,
        date: '2024-01-15',
      })

      deleteTransactionWithTransfer(store, first.from.id)

      expect(store.getTransaction(second.from.id)).not.toBeNull()
      expect(store.getTransaction(second.to.id)).not.toBeNull()
    })
  })

  describe('two identical transfers between the same accounts on the same day', () => {
    let savings: ReturnType<typeof createAccount>

    beforeEach(() => {
      savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)
    })

    /**
     * Two $50 moves from Checking to Savings on the same day is an ordinary thing to
     * do, and nothing about the rows tells the two pairs apart. Each of these acts on
     * the second pair and expects the first to come back out of the store exactly as it
     * went in.
     */
    function twoIdenticalTransfers() {
      const first = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 5000,
        date: '2024-01-10',
      })
      const second = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 5000,
        date: '2024-01-10',
      })
      return {
        first,
        second,
        untouched: {
          from: store.getTransaction(first.from.id),
          to: store.getTransaction(first.to.id),
        },
      }
    }

    it('deletes only the pair it was given', () => {
      const { first, second, untouched } = twoIdenticalTransfers()

      deleteTransactionWithTransfer(store, second.from.id)

      expect(store.getTransaction(second.from.id)).toBeNull()
      expect(store.getTransaction(second.to.id)).toBeNull()
      expect(store.getTransaction(first.from.id)).toEqual(untouched.from)
      expect(store.getTransaction(first.to.id)).toEqual(untouched.to)
    })

    it('mirrors an amount change onto its own partner only', () => {
      const { first, second, untouched } = twoIdenticalTransfers()

      updateTransaction(store, second.from.id, { amount: -7500 })

      expect(store.getTransaction(second.from.id)?.amount).toBe(-7500)
      expect(store.getTransaction(second.to.id)?.amount).toBe(7500)
      expect(store.getTransaction(first.from.id)).toEqual(untouched.from)
      expect(store.getTransaction(first.to.id)).toEqual(untouched.to)
    })

    it('unlinks only the pair it was given', () => {
      const { first, second, untouched } = twoIdenticalTransfers()

      unlinkTransaction(store, second.from.id)

      expect(store.getTransaction(second.from.id)?.transferAccountId).toBeNull()
      expect(store.getTransaction(second.to.id)?.transferAccountId).toBeNull()
      expect(store.getTransaction(first.from.id)).toEqual(untouched.from)
      expect(store.getTransaction(first.to.id)).toEqual(untouched.to)
    })
  })

  describe('a transfer leg whose partner is not recorded', () => {
    let savings: ReturnType<typeof createAccount>

    beforeEach(() => {
      savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)
    })

    /**
     * What a row migrated from schema v1 looks like: still marked as a transfer by
     * transferAccountId, with no record of which row the other leg is.
     */
    function legacyLeg() {
      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 5000,
        date: '2024-01-10',
      })
      store.saveTransaction({ ...from, transferId: null })
      store.saveTransaction({ ...to, transferId: null })
      return { from: store.getTransaction(from.id)!, to: store.getTransaction(to.id)! }
    }

    it('refuses an amount change and says how to relink', () => {
      const { from, to } = legacyLeg()

      expect(() => updateTransaction(store, from.id, { amount: -7500 })).toThrow(
        `Transaction is part of a transfer whose other leg is not recorded: ${from.id}. ` +
          `Run "tx unlink ${from.id}" to clear this leg, then ` +
          `"tx link ${from.id} <otherId>" to link it to the right transaction.`
      )
      expect(store.getTransaction(from.id)).toEqual(from)
      expect(store.getTransaction(to.id)).toEqual(to)
    })

    it('refuses a move to another account', () => {
      const { from } = legacyLeg()
      const cash = createAccount({ budgetId: budget.id, name: 'Cash', type: 'cash' })
      store.saveAccount(cash)

      expect(() => updateTransaction(store, from.id, { accountId: cash.id })).toThrow(
        'other leg is not recorded'
      )
      expect(store.getTransaction(from.id)?.accountId).toBe(account.id)
    })

    it('refuses a category change', () => {
      const { from } = legacyLeg()

      expect(() => updateTransaction(store, from.id, { categoryId: category.id })).toThrow(
        'other leg is not recorded'
      )
      expect(store.getTransaction(from.id)?.categoryId).toBeNull()
    })

    it('allows an edit that cannot break the pair', () => {
      const { from, to } = legacyLeg()

      updateTransaction(store, from.id, { memo: 'Rent', date: '2024-01-11' })

      expect(store.getTransaction(from.id)?.memo).toBe('Rent')
      expect(store.getTransaction(to.id)).toEqual(to)
    })

    it('refuses to delete, since which row to delete with it is a guess', () => {
      const { from, to } = legacyLeg()

      expect(() => deleteTransactionWithTransfer(store, from.id)).toThrow(
        `Transaction is part of a transfer whose other leg is not recorded: ${from.id}. ` +
          `Run "tx unlink ${from.id}" to clear this leg, then ` +
          `"tx link ${from.id} <otherId>" to link it to the right transaction.`
      )
      expect(store.getTransaction(from.id)).toEqual(from)
      expect(store.getTransaction(to.id)).toEqual(to)
    })

    it('unlinks that leg alone, leaving the other where it is', () => {
      const { from, to } = legacyLeg()

      const result = unlinkTransaction(store, from.id)

      expect(result.partner).toBeNull()
      expect(store.getTransaction(from.id)?.transferAccountId).toBeNull()
      expect(store.getTransaction(to.id)).toEqual(to)
    })

    it('can be linked again by id once unlinked, and then edits as a pair', () => {
      const { from, to } = legacyLeg()

      unlinkTransaction(store, from.id)
      unlinkTransaction(store, to.id)
      linkTransactions(store, from.id, to.id)

      updateTransaction(store, from.id, { amount: -7500 })

      expect(store.getTransaction(to.id)?.amount).toBe(7500)
    })

    it('refuses a pair-changing edit when the partner row was deleted', () => {
      const { from, to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 5000,
        date: '2024-01-10',
      })
      store.deleteTransaction(to.id)

      expect(() => updateTransaction(store, from.id, { amount: -7500 })).toThrow(
        'other leg is not recorded'
      )
      expect(() => deleteTransactionWithTransfer(store, from.id)).toThrow(
        'other leg is not recorded'
      )
      expect(store.getTransaction(from.id)?.amount).toBe(-5000)
    })
  })

  describe('countsAsIncome', () => {
    it('counts an unlinked inflow', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(countsAsIncome(store, txn)).toBe(true)
    })

    it('does not count outflows', () => {
      const txn = addTransaction(store, {
        accountId: account.id,
        amount: -10000,
        date: '2024-01-15',
      })

      expect(countsAsIncome(store, txn)).toBe(false)
    })

    it('does not count the inflow leg of an on-budget transfer', () => {
      const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })
      store.saveAccount(savings)

      const { to } = createTransfer(store, {
        fromAccountId: account.id,
        toAccountId: savings.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(countsAsIncome(store, to)).toBe(false)
    })

    it('counts an inflow transferred in from an off-budget account', () => {
      const brokerage = createAccount({ budgetId: budget.id, name: 'Brokerage', type: 'tracking' })
      store.saveAccount(brokerage)

      const { to } = createTransfer(store, {
        fromAccountId: brokerage.id,
        toAccountId: account.id,
        amount: 10000,
        date: '2024-01-15',
      })

      expect(countsAsIncome(store, to)).toBe(true)
    })
  })
})
