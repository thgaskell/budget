import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '../../src/stores/memory.ts'
import { SqliteStore } from '../../src/stores/sqlite.ts'
import type { Store } from '../../src/stores/types.ts'
import { createBudget } from '../../src/schemas/budget.ts'
import { createAccount } from '../../src/schemas/account.ts'
import { createCategoryGroup } from '../../src/schemas/category-group.ts'
import { createCategory } from '../../src/schemas/category.ts'
import { createTransaction } from '../../src/schemas/transaction.ts'
import { createAssignment } from '../../src/schemas/assignment.ts'
import { getAccountBalances, getCategoryBalances } from '../../src/services/balance.ts'

describe.each([
  ['MemoryStore', async () => new MemoryStore()],
  ['SqliteStore', async () => await SqliteStore.create()],
])('Balance Service with %s', (_, createStore) => {
  let store: Store

  beforeEach(async () => {
    store = await createStore()
  })

  describe('getAccountBalances', () => {
    it('returns zero balances for account with no transactions', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Checking',
        type: 'checking',
      })
      store.saveAccount(account)

      const balances = getAccountBalances(store, account.id)

      expect(balances.cleared).toBe(0)
      expect(balances.uncleared).toBe(0)
      expect(balances.working).toBe(0)
    })

    it('calculates cleared balance from cleared transactions', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Checking',
        type: 'checking',
      })
      store.saveAccount(account)

      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-01-15',
          amount: 100000, // $1000 deposit
          cleared: true,
        })
      )
      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-01-16',
          amount: -25000, // $250 expense
          cleared: true,
        })
      )

      const balances = getAccountBalances(store, account.id)

      expect(balances.cleared).toBe(75000) // $750
      expect(balances.uncleared).toBe(0)
      expect(balances.working).toBe(75000)
    })

    it('calculates uncleared balance from uncleared transactions', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Checking',
        type: 'checking',
      })
      store.saveAccount(account)

      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-01-15',
          amount: 100000,
          cleared: false,
        })
      )

      const balances = getAccountBalances(store, account.id)

      expect(balances.cleared).toBe(0)
      expect(balances.uncleared).toBe(100000)
      expect(balances.working).toBe(100000)
    })

    it('calculates working balance as cleared + uncleared', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Checking',
        type: 'checking',
      })
      store.saveAccount(account)

      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-01-15',
          amount: 100000,
          cleared: true,
        })
      )
      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-01-16',
          amount: 50000,
          cleared: false,
        })
      )

      const balances = getAccountBalances(store, account.id)

      expect(balances.cleared).toBe(100000)
      expect(balances.uncleared).toBe(50000)
      expect(balances.working).toBe(150000)
    })

    it('handles negative balances (credit card)', () => {
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Credit Card',
        type: 'credit',
      })
      store.saveAccount(account)

      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-01-15',
          amount: -50000, // $500 charge
          cleared: true,
        })
      )

      const balances = getAccountBalances(store, account.id)

      expect(balances.cleared).toBe(-50000)
      expect(balances.working).toBe(-50000)
    })
  })

  describe('getCategoryBalances', () => {
    it('returns zero balances for category with no activity', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Groceries' })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)

      const balances = getCategoryBalances(store, category.id, '2024-01')

      expect(balances.assigned).toBe(0)
      expect(balances.activity).toBe(0)
      expect(balances.available).toBe(0)
    })

    it('returns assigned amount from assignment', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Groceries' })
      const assignment = createAssignment({
        categoryId: category.id,
        month: '2024-01',
        amount: 50000,
      })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)
      store.saveAssignment(assignment)

      const balances = getCategoryBalances(store, category.id, '2024-01')

      expect(balances.assigned).toBe(50000)
      expect(balances.activity).toBe(0)
      expect(balances.available).toBe(50000)
    })

    it('calculates activity from transactions', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Groceries' })
      const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)
      store.saveAccount(account)

      // Spending in January
      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-01-10',
          amount: -15000, // $150
          categoryId: category.id,
        })
      )
      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-01-20',
          amount: -10000, // $100
          categoryId: category.id,
        })
      )

      const balances = getCategoryBalances(store, category.id, '2024-01')

      expect(balances.activity).toBe(-25000) // -$250 spent
    })

    it('calculates available as assigned + activity', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Groceries' })
      const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })
      const assignment = createAssignment({
        categoryId: category.id,
        month: '2024-01',
        amount: 50000, // $500 assigned
      })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)
      store.saveAccount(account)
      store.saveAssignment(assignment)

      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-01-15',
          amount: -20000, // $200 spent
          categoryId: category.id,
        })
      )

      const balances = getCategoryBalances(store, category.id, '2024-01')

      expect(balances.assigned).toBe(50000)
      expect(balances.activity).toBe(-20000)
      expect(balances.available).toBe(30000) // $300 remaining
    })

    it('only includes transactions from the specified month', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Groceries' })
      const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)
      store.saveAccount(account)

      // December transaction (should not be included in January)
      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2023-12-15',
          amount: -10000,
          categoryId: category.id,
        })
      )
      // January transaction
      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-01-15',
          amount: -20000,
          categoryId: category.id,
        })
      )
      // February transaction (should not be included in January)
      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-02-15',
          amount: -30000,
          categoryId: category.id,
        })
      )

      const balances = getCategoryBalances(store, category.id, '2024-01')

      expect(balances.activity).toBe(-20000) // Only January
    })

    it('shows overspending with negative available', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Groceries' })
      const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })
      const assignment = createAssignment({
        categoryId: category.id,
        month: '2024-01',
        amount: 30000, // $300 assigned
      })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)
      store.saveAccount(account)
      store.saveAssignment(assignment)

      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-01-15',
          amount: -50000, // $500 spent (overspent!)
          categoryId: category.id,
        })
      )

      const balances = getCategoryBalances(store, category.id, '2024-01')

      expect(balances.available).toBe(-20000) // -$200 overspent
    })

    // Carryover tests
    it('carries over positive balance from prior month', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Groceries' })
      const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)
      store.saveAccount(account)

      // December: Assign $500, spend $400 -> $100 remaining
      store.saveAssignment(
        createAssignment({
          categoryId: category.id,
          month: '2024-12',
          amount: 50000, // $500
        })
      )
      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-12-15',
          amount: -40000, // $400 spent
          categoryId: category.id,
        })
      )

      // January: No new assignment, no spending
      const janBalances = getCategoryBalances(store, category.id, '2025-01')

      // Carryover from December: $100
      expect(janBalances.assigned).toBe(0) // No assignment in January
      expect(janBalances.activity).toBe(0) // No activity in January
      expect(janBalances.available).toBe(10000) // $100 carryover from December
    })

    it('carries over negative balance (debt) from prior month', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Dining' })
      const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)
      store.saveAccount(account)

      // December: Assign $200, spend $250 -> -$50 overspent
      store.saveAssignment(
        createAssignment({
          categoryId: category.id,
          month: '2024-12',
          amount: 20000, // $200
        })
      )
      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-12-15',
          amount: -25000, // $250 spent (overspent!)
          categoryId: category.id,
        })
      )

      // January: No new assignment
      const janBalances = getCategoryBalances(store, category.id, '2025-01')

      expect(janBalances.assigned).toBe(0)
      expect(janBalances.activity).toBe(0)
      expect(janBalances.available).toBe(-5000) // -$50 debt carried over
    })

    it('accumulates carryover across multiple months', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Savings' })
      const category = createCategory({ groupId: group.id, name: 'Vacation' })
      const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)
      store.saveAccount(account)

      // Oct, Nov, Dec: Assign $100 each month, no spending
      store.saveAssignment(
        createAssignment({
          categoryId: category.id,
          month: '2024-10',
          amount: 10000,
        })
      )
      store.saveAssignment(
        createAssignment({
          categoryId: category.id,
          month: '2024-11',
          amount: 10000,
        })
      )
      store.saveAssignment(
        createAssignment({
          categoryId: category.id,
          month: '2024-12',
          amount: 10000,
        })
      )

      // January: Check accumulated balance
      const janBalances = getCategoryBalances(store, category.id, '2025-01')

      expect(janBalances.assigned).toBe(0) // No assignment in January
      expect(janBalances.activity).toBe(0) // No activity in January
      expect(janBalances.available).toBe(30000) // $300 accumulated ($100 x 3 months)
    })

    it('combines carryover with current month assignment and activity', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Groceries' })
      const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)
      store.saveAccount(account)

      // December: Assign $500, spend $400 -> $100 remaining
      store.saveAssignment(
        createAssignment({
          categoryId: category.id,
          month: '2024-12',
          amount: 50000,
        })
      )
      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2024-12-15',
          amount: -40000,
          categoryId: category.id,
        })
      )

      // January: Assign $500, spend $300
      store.saveAssignment(
        createAssignment({
          categoryId: category.id,
          month: '2025-01',
          amount: 50000,
        })
      )
      store.saveTransaction(
        createTransaction({
          accountId: account.id,
          date: '2025-01-15',
          amount: -30000,
          categoryId: category.id,
        })
      )

      const janBalances = getCategoryBalances(store, category.id, '2025-01')

      expect(janBalances.assigned).toBe(50000) // $500 assigned in January
      expect(janBalances.activity).toBe(-30000) // $300 spent in January
      // Available = Dec carryover ($100) + Jan assigned ($500) - Jan spent ($300) = $300
      expect(janBalances.available).toBe(30000)
    })
  })
})
