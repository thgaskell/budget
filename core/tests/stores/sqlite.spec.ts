import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteStore } from '../../src/stores/sqlite.ts'
import { createBudget } from '../../src/schemas/budget.ts'
import { createAccount } from '../../src/schemas/account.ts'
import { createCategoryGroup } from '../../src/schemas/category-group.ts'
import { createCategory } from '../../src/schemas/category.ts'
import { createTransaction } from '../../src/schemas/transaction.ts'
import { createPayee } from '../../src/schemas/payee.ts'
import { createTarget } from '../../src/schemas/target.ts'
import { createAssignment } from '../../src/schemas/assignment.ts'

describe('SqliteStore', () => {
  let store: SqliteStore

  beforeEach(async () => {
    store = await SqliteStore.create()
  })

  afterEach(() => {
    store.close()
  })

  describe('Budget operations', () => {
    it('saves and retrieves a budget', () => {
      const budget = createBudget({ name: 'Test Budget', currency: 'EUR' })
      store.saveBudget(budget)

      const retrieved = store.getBudget(budget.id)
      expect(retrieved).toEqual(budget)
    })

    it('returns null for non-existent budget', () => {
      expect(store.getBudget('non-existent')).toBeNull()
    })

    it('lists all budgets', () => {
      const budget1 = createBudget({ name: 'Budget 1' })
      const budget2 = createBudget({ name: 'Budget 2' })
      store.saveBudget(budget1)
      store.saveBudget(budget2)

      const budgets = store.listBudgets()
      expect(budgets).toHaveLength(2)
    })

    it('deletes a budget', () => {
      const budget = createBudget({ name: 'Test Budget' })
      store.saveBudget(budget)
      store.deleteBudget(budget.id)

      expect(store.getBudget(budget.id)).toBeNull()
    })

    it('updates a budget on save', () => {
      const budget = createBudget({ name: 'Original' })
      store.saveBudget(budget)

      const updated = { ...budget, name: 'Updated' }
      store.saveBudget(updated)

      expect(store.getBudget(budget.id)?.name).toBe('Updated')
      expect(store.listBudgets()).toHaveLength(1)
    })
  })

  describe('Account operations', () => {
    it('saves and retrieves an account', () => {
      const budget = createBudget({ name: 'Test' })
      const account = createAccount({
        budgetId: budget.id,
        name: 'Checking',
        type: 'checking',
      })
      store.saveBudget(budget)
      store.saveAccount(account)

      expect(store.getAccount(account.id)).toEqual(account)
    })

    it('lists accounts by budget', () => {
      const budget = createBudget({ name: 'Test' })
      store.saveBudget(budget)

      const account1 = createAccount({ budgetId: budget.id, name: 'A1', type: 'checking' })
      const account2 = createAccount({ budgetId: budget.id, name: 'A2', type: 'savings' })

      store.saveAccount(account1)
      store.saveAccount(account2)

      const accounts = store.listAccounts(budget.id)
      expect(accounts).toHaveLength(2)
    })

    it('preserves onBudget boolean', () => {
      const budget = createBudget({ name: 'Test' })
      store.saveBudget(budget)

      const trackingAccount = createAccount({
        budgetId: budget.id,
        name: 'Investment',
        type: 'tracking',
      })
      store.saveAccount(trackingAccount)

      const retrieved = store.getAccount(trackingAccount.id)
      expect(retrieved?.onBudget).toBe(false)
    })
  })

  describe('Transaction operations', () => {
    it('saves and retrieves a transaction', () => {
      const txn = createTransaction({
        accountId: 'account-1',
        date: '2024-01-15',
        amount: -5000,
        categoryId: 'category-1',
        payeeId: 'payee-1',
        memo: 'Test memo',
        cleared: true,
      })
      store.saveTransaction(txn)

      const retrieved = store.getTransaction(txn.id)
      expect(retrieved).toEqual(txn)
    })

    it('filters transactions by date range', () => {
      const budget = createBudget({ name: 'Test' })
      const account = createAccount({ budgetId: budget.id, name: 'A1', type: 'checking' })
      store.saveBudget(budget)
      store.saveAccount(account)

      const txn1 = createTransaction({ accountId: account.id, date: '2024-01-05', amount: -100 })
      const txn2 = createTransaction({ accountId: account.id, date: '2024-01-15', amount: -200 })
      const txn3 = createTransaction({ accountId: account.id, date: '2024-01-25', amount: -300 })

      store.saveTransaction(txn1)
      store.saveTransaction(txn2)
      store.saveTransaction(txn3)

      const filtered = store.listTransactions(account.id, {
        from: '2024-01-10',
        to: '2024-01-20',
      })
      expect(filtered).toHaveLength(1)
      expect(filtered[0].amount).toBe(-200)
    })

    it('preserves cleared boolean', () => {
      const txn = createTransaction({
        accountId: 'account-1',
        date: '2024-01-15',
        amount: -5000,
        cleared: true,
      })
      store.saveTransaction(txn)

      expect(store.getTransaction(txn.id)?.cleared).toBe(true)
    })

    it('preserves null values', () => {
      const txn = createTransaction({
        accountId: 'account-1',
        date: '2024-01-15',
        amount: -5000,
      })
      store.saveTransaction(txn)

      const retrieved = store.getTransaction(txn.id)
      expect(retrieved?.categoryId).toBeNull()
      expect(retrieved?.payeeId).toBeNull()
      expect(retrieved?.memo).toBeNull()
      expect(retrieved?.transferAccountId).toBeNull()
    })

    it('lists all transactions for a budget', () => {
      const budget = createBudget({ name: 'Test' })
      const account1 = createAccount({ budgetId: budget.id, name: 'A1', type: 'checking' })
      const account2 = createAccount({ budgetId: budget.id, name: 'A2', type: 'savings' })

      store.saveBudget(budget)
      store.saveAccount(account1)
      store.saveAccount(account2)

      const txn1 = createTransaction({ accountId: account1.id, date: '2024-01-10', amount: -100 })
      const txn2 = createTransaction({ accountId: account2.id, date: '2024-01-15', amount: -200 })

      store.saveTransaction(txn1)
      store.saveTransaction(txn2)

      const allTxns = store.listAllTransactions(budget.id)
      expect(allTxns).toHaveLength(2)
    })
  })

  describe('Category operations', () => {
    it('saves and retrieves a category', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Groceries', sortOrder: 1 })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)

      expect(store.getCategory(category.id)).toEqual(category)
    })

    it('lists categories by budget ordered by group and sort order', () => {
      const budget = createBudget({ name: 'Test' })
      const group1 = createCategoryGroup({ budgetId: budget.id, name: 'Needs', sortOrder: 1 })
      const group2 = createCategoryGroup({ budgetId: budget.id, name: 'Wants', sortOrder: 2 })
      const cat1 = createCategory({ groupId: group1.id, name: 'Groceries', sortOrder: 1 })
      const cat2 = createCategory({ groupId: group2.id, name: 'Entertainment', sortOrder: 1 })

      store.saveBudget(budget)
      store.saveCategoryGroup(group1)
      store.saveCategoryGroup(group2)
      store.saveCategory(cat1)
      store.saveCategory(cat2)

      const categories = store.listCategories(budget.id)
      expect(categories).toHaveLength(2)
      expect(categories[0].name).toBe('Groceries')
      expect(categories[1].name).toBe('Entertainment')
    })
  })

  describe('CategoryGroup operations', () => {
    it('saves and retrieves a category group', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs', sortOrder: 1 })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)

      expect(store.getCategoryGroup(group.id)).toEqual(group)
    })

    it('lists category groups by budget ordered by sort order', () => {
      const budget = createBudget({ name: 'Test' })
      const group1 = createCategoryGroup({ budgetId: budget.id, name: 'Wants', sortOrder: 2 })
      const group2 = createCategoryGroup({ budgetId: budget.id, name: 'Needs', sortOrder: 1 })

      store.saveBudget(budget)
      store.saveCategoryGroup(group1)
      store.saveCategoryGroup(group2)

      const groups = store.listCategoryGroups(budget.id)
      expect(groups[0].name).toBe('Needs')
      expect(groups[1].name).toBe('Wants')
    })
  })

  describe('Payee operations', () => {
    it('saves and retrieves a payee', () => {
      const budget = createBudget({ name: 'Test' })
      const payee = createPayee({ budgetId: budget.id, name: 'Store' })

      store.saveBudget(budget)
      store.savePayee(payee)

      expect(store.getPayee(payee.id)).toEqual(payee)
    })

    it('lists payees by budget', () => {
      const budget = createBudget({ name: 'Test' })
      const payee1 = createPayee({ budgetId: budget.id, name: 'Store A' })
      const payee2 = createPayee({ budgetId: budget.id, name: 'Store B' })

      store.saveBudget(budget)
      store.savePayee(payee1)
      store.savePayee(payee2)

      const payees = store.listPayees(budget.id)
      expect(payees).toHaveLength(2)
    })
  })

  describe('Target operations', () => {
    it('saves and retrieves a target by category', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Savings' })
      const target = createTarget({
        categoryId: category.id,
        type: 'savings_balance',
        amount: 100000,
        targetDate: '2024-12-31',
      })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)
      store.saveTarget(target)

      expect(store.getTarget(category.id)).toEqual(target)
    })

    it('overwrites existing target for category', () => {
      const target1 = createTarget({
        categoryId: 'category-1',
        type: 'monthly_contribution',
        amount: 10000,
      })
      const target2 = createTarget({
        categoryId: 'category-1',
        type: 'savings_balance',
        amount: 50000,
      })

      store.saveTarget(target1)
      store.saveTarget(target2)

      expect(store.getTarget('category-1')?.type).toBe('savings_balance')
    })

    it('deletes a target', () => {
      const target = createTarget({
        categoryId: 'category-1',
        type: 'monthly_contribution',
        amount: 10000,
      })
      store.saveTarget(target)
      store.deleteTarget('category-1')

      expect(store.getTarget('category-1')).toBeNull()
    })
  })

  describe('Assignment operations', () => {
    it('saves and retrieves an assignment', () => {
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

      expect(store.getAssignment(category.id, '2024-01')).toEqual(assignment)
    })

    it('overwrites existing assignment for same category/month', () => {
      const assignment1 = createAssignment({
        categoryId: 'category-1',
        month: '2024-01',
        amount: 50000,
      })
      const assignment2 = createAssignment({
        categoryId: 'category-1',
        month: '2024-01',
        amount: 75000,
      })

      store.saveAssignment(assignment1)
      store.saveAssignment(assignment2)

      expect(store.getAssignment('category-1', '2024-01')?.amount).toBe(75000)
    })

    it('lists assignments for budget and month', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const cat1 = createCategory({ groupId: group.id, name: 'Groceries' })
      const cat2 = createCategory({ groupId: group.id, name: 'Rent' })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(cat1)
      store.saveCategory(cat2)

      const assign1 = createAssignment({ categoryId: cat1.id, month: '2024-01', amount: 50000 })
      const assign2 = createAssignment({ categoryId: cat2.id, month: '2024-01', amount: 100000 })
      const assign3 = createAssignment({ categoryId: cat1.id, month: '2024-02', amount: 55000 })

      store.saveAssignment(assign1)
      store.saveAssignment(assign2)
      store.saveAssignment(assign3)

      const janAssignments = store.listAssignments(budget.id, '2024-01')
      expect(janAssignments).toHaveLength(2)

      const febAssignments = store.listAssignments(budget.id, '2024-02')
      expect(febAssignments).toHaveLength(1)
    })

    it('deletes an assignment', () => {
      const assignment = createAssignment({
        categoryId: 'category-1',
        month: '2024-01',
        amount: 50000,
      })
      store.saveAssignment(assignment)
      store.deleteAssignment('category-1', '2024-01')

      expect(store.getAssignment('category-1', '2024-01')).toBeNull()
    })
  })
})
