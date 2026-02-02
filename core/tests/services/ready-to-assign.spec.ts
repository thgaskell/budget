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
import { getReadyToAssign } from '../../src/services/ready-to-assign.ts'

describe.each([
  ['MemoryStore', async () => new MemoryStore()],
  ['SqliteStore', async () => {
    const store = await SqliteStore.create()
    store.migrate()
    return store
  }],
])('Ready to Assign with %s', (_, createStore) => {
  let store: Store

  beforeEach(async () => {
    store = await createStore()
  })

  it('returns zero for budget with no accounts', () => {
    const budget = createBudget({ name: 'Test' })
    store.saveBudget(budget)

    const rta = getReadyToAssign(store, budget.id, '2024-01')

    expect(rta).toBe(0)
  })

  it('returns account balance when nothing assigned', () => {
    const budget = createBudget({ name: 'Test' })
    const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })

    store.saveBudget(budget)
    store.saveAccount(account)
    store.saveTransaction(
      createTransaction({
        accountId: account.id,
        date: '2024-01-01',
        amount: 500000, // $5000 income
      })
    )

    const rta = getReadyToAssign(store, budget.id, '2024-01')

    expect(rta).toBe(500000)
  })

  it('subtracts assigned amounts from account balance', () => {
    const budget = createBudget({ name: 'Test' })
    const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })
    const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
    const category = createCategory({ groupId: group.id, name: 'Groceries' })

    store.saveBudget(budget)
    store.saveAccount(account)
    store.saveCategoryGroup(group)
    store.saveCategory(category)

    store.saveTransaction(
      createTransaction({
        accountId: account.id,
        date: '2024-01-01',
        amount: 500000, // $5000 income
      })
    )

    store.saveAssignment(
      createAssignment({
        categoryId: category.id,
        month: '2024-01',
        amount: 200000, // $2000 assigned
      })
    )

    const rta = getReadyToAssign(store, budget.id, '2024-01')

    expect(rta).toBe(300000) // $3000 remaining
  })

  it('reaches zero when fully assigned (zero-based budget)', () => {
    const budget = createBudget({ name: 'Test' })
    const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })
    const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
    const cat1 = createCategory({ groupId: group.id, name: 'Groceries' })
    const cat2 = createCategory({ groupId: group.id, name: 'Rent' })

    store.saveBudget(budget)
    store.saveAccount(account)
    store.saveCategoryGroup(group)
    store.saveCategory(cat1)
    store.saveCategory(cat2)

    store.saveTransaction(
      createTransaction({
        accountId: account.id,
        date: '2024-01-01',
        amount: 500000, // $5000
      })
    )

    store.saveAssignment(createAssignment({ categoryId: cat1.id, month: '2024-01', amount: 200000 }))
    store.saveAssignment(createAssignment({ categoryId: cat2.id, month: '2024-01', amount: 300000 }))

    const rta = getReadyToAssign(store, budget.id, '2024-01')

    expect(rta).toBe(0)
  })

  it('can go negative when over-assigned', () => {
    const budget = createBudget({ name: 'Test' })
    const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })
    const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
    const category = createCategory({ groupId: group.id, name: 'Groceries' })

    store.saveBudget(budget)
    store.saveAccount(account)
    store.saveCategoryGroup(group)
    store.saveCategory(category)

    store.saveTransaction(
      createTransaction({
        accountId: account.id,
        date: '2024-01-01',
        amount: 100000, // $1000
      })
    )

    store.saveAssignment(
      createAssignment({
        categoryId: category.id,
        month: '2024-01',
        amount: 150000, // $1500 assigned (more than available!)
      })
    )

    const rta = getReadyToAssign(store, budget.id, '2024-01')

    expect(rta).toBe(-50000) // -$500 over-assigned
  })

  it('excludes tracking accounts from calculation', () => {
    const budget = createBudget({ name: 'Test' })
    const checking = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })
    const investment = createAccount({ budgetId: budget.id, name: 'Investment', type: 'tracking' })

    store.saveBudget(budget)
    store.saveAccount(checking)
    store.saveAccount(investment)

    store.saveTransaction(
      createTransaction({
        accountId: checking.id,
        date: '2024-01-01',
        amount: 100000, // $1000 in checking
      })
    )
    store.saveTransaction(
      createTransaction({
        accountId: investment.id,
        date: '2024-01-01',
        amount: 500000, // $5000 in investment (tracking, shouldn't count)
      })
    )

    const rta = getReadyToAssign(store, budget.id, '2024-01')

    expect(rta).toBe(100000) // Only checking counts
  })

  it('includes multiple on-budget accounts', () => {
    const budget = createBudget({ name: 'Test' })
    const checking = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })
    const savings = createAccount({ budgetId: budget.id, name: 'Savings', type: 'savings' })

    store.saveBudget(budget)
    store.saveAccount(checking)
    store.saveAccount(savings)

    store.saveTransaction(
      createTransaction({
        accountId: checking.id,
        date: '2024-01-01',
        amount: 100000,
      })
    )
    store.saveTransaction(
      createTransaction({
        accountId: savings.id,
        date: '2024-01-01',
        amount: 50000,
      })
    )

    const rta = getReadyToAssign(store, budget.id, '2024-01')

    expect(rta).toBe(150000)
  })

  it('categorized expenses do NOT affect Ready to Assign', () => {
    const budget = createBudget({ name: 'Test' })
    const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })
    const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
    const category = createCategory({ groupId: group.id, name: 'Groceries' })

    store.saveBudget(budget)
    store.saveAccount(account)
    store.saveCategoryGroup(group)
    store.saveCategory(category)

    // Income
    store.saveTransaction(
      createTransaction({
        accountId: account.id,
        date: '2024-01-01',
        amount: 500000, // $5000 income
      })
    )
    // Categorized spending (should NOT affect RTA - only affects category Available)
    store.saveTransaction(
      createTransaction({
        accountId: account.id,
        date: '2024-01-15',
        amount: -100000, // $1000 expense in Groceries category
        categoryId: category.id,
      })
    )

    // Assign the full original income
    store.saveAssignment(
      createAssignment({
        categoryId: category.id,
        month: '2024-01',
        amount: 500000, // $5000 assigned
      })
    )

    const rta = getReadyToAssign(store, budget.id, '2024-01')

    // RTA = Income ($5000) - Assigned ($5000) = $0
    // Expenses do NOT reduce RTA - they only reduce category Available
    expect(rta).toBe(0)
  })

  it('Ready to Assign unchanged after multiple categorized expenses', () => {
    const budget = createBudget({ name: 'Test' })
    const account = createAccount({ budgetId: budget.id, name: 'Checking', type: 'checking' })
    const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
    const rent = createCategory({ groupId: group.id, name: 'Rent' })
    const groceries = createCategory({ groupId: group.id, name: 'Groceries' })

    store.saveBudget(budget)
    store.saveAccount(account)
    store.saveCategoryGroup(group)
    store.saveCategory(rent)
    store.saveCategory(groceries)

    // Income: $7500
    store.saveTransaction(
      createTransaction({
        accountId: account.id,
        date: '2024-01-01',
        amount: 750000,
      })
    )

    // Assign $1500 to Rent, $500 to Groceries (total $2000 assigned)
    store.saveAssignment(
      createAssignment({
        categoryId: rent.id,
        month: '2024-01',
        amount: 150000,
      })
    )
    store.saveAssignment(
      createAssignment({
        categoryId: groceries.id,
        month: '2024-01',
        amount: 50000,
      })
    )

    // RTA before expenses = $7500 - $2000 = $5500
    expect(getReadyToAssign(store, budget.id, '2024-01')).toBe(550000)

    // Pay rent: -$1500
    store.saveTransaction(
      createTransaction({
        accountId: account.id,
        date: '2024-01-15',
        amount: -150000,
        categoryId: rent.id,
      })
    )

    // RTA after rent expense should STILL be $5500
    expect(getReadyToAssign(store, budget.id, '2024-01')).toBe(550000)

    // Buy groceries: -$400
    store.saveTransaction(
      createTransaction({
        accountId: account.id,
        date: '2024-01-16',
        amount: -40000,
        categoryId: groceries.id,
      })
    )

    // RTA after groceries expense should STILL be $5500
    expect(getReadyToAssign(store, budget.id, '2024-01')).toBe(550000)
  })
})
