import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '../../src/stores/memory.ts'
import { createBudget } from '../../src/schemas/budget.ts'
import { createAccount } from '../../src/schemas/account.ts'
import { createCategoryGroup } from '../../src/schemas/category-group.ts'
import { createCategory } from '../../src/schemas/category.ts'
import { createTransaction } from '../../src/schemas/transaction.ts'
import { createPayee } from '../../src/schemas/payee.ts'
import { createTarget } from '../../src/schemas/target.ts'
import { createAssignment } from '../../src/schemas/assignment.ts'

describe('MemoryStore', () => {
  let store: MemoryStore

  beforeEach(() => {
    store = new MemoryStore()
  })

  describe('Budget operations', () => {
    it('saves and retrieves a budget', () => {
      const budget = createBudget({ name: 'Test Budget' })
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
      expect(budgets).toContainEqual(budget1)
      expect(budgets).toContainEqual(budget2)
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
      const account = createAccount({
        budgetId: 'budget-1',
        name: 'Checking',
        type: 'checking',
      })
      store.saveAccount(account)

      expect(store.getAccount(account.id)).toEqual(account)
    })

    it('lists accounts by budget', () => {
      const account1 = createAccount({ budgetId: 'budget-1', name: 'A1', type: 'checking' })
      const account2 = createAccount({ budgetId: 'budget-1', name: 'A2', type: 'savings' })
      const account3 = createAccount({ budgetId: 'budget-2', name: 'A3', type: 'checking' })

      store.saveAccount(account1)
      store.saveAccount(account2)
      store.saveAccount(account3)

      const budget1Accounts = store.listAccounts('budget-1')
      expect(budget1Accounts).toHaveLength(2)
      expect(budget1Accounts).toContainEqual(account1)
      expect(budget1Accounts).toContainEqual(account2)

      const budget2Accounts = store.listAccounts('budget-2')
      expect(budget2Accounts).toHaveLength(1)
      expect(budget2Accounts).toContainEqual(account3)
    })

    it('deletes an account', () => {
      const account = createAccount({ budgetId: 'budget-1', name: 'Test', type: 'checking' })
      store.saveAccount(account)
      store.deleteAccount(account.id)

      expect(store.getAccount(account.id)).toBeNull()
    })
  })

  describe('Transaction operations', () => {
    it('saves and retrieves a transaction', () => {
      const txn = createTransaction({
        accountId: 'account-1',
        date: '2024-01-15',
        amount: -5000,
      })
      store.saveTransaction(txn)

      expect(store.getTransaction(txn.id)).toEqual(txn)
    })

    it('lists transactions by account', () => {
      const txn1 = createTransaction({ accountId: 'account-1', date: '2024-01-10', amount: -100 })
      const txn2 = createTransaction({ accountId: 'account-1', date: '2024-01-15', amount: -200 })
      const txn3 = createTransaction({ accountId: 'account-2', date: '2024-01-12', amount: -300 })

      store.saveTransaction(txn1)
      store.saveTransaction(txn2)
      store.saveTransaction(txn3)

      const account1Txns = store.listTransactions('account-1')
      expect(account1Txns).toHaveLength(2)
    })

    it('filters transactions by date range', () => {
      const txn1 = createTransaction({ accountId: 'account-1', date: '2024-01-05', amount: -100 })
      const txn2 = createTransaction({ accountId: 'account-1', date: '2024-01-15', amount: -200 })
      const txn3 = createTransaction({ accountId: 'account-1', date: '2024-01-25', amount: -300 })

      store.saveTransaction(txn1)
      store.saveTransaction(txn2)
      store.saveTransaction(txn3)

      const filtered = store.listTransactions('account-1', {
        from: '2024-01-10',
        to: '2024-01-20',
      })
      expect(filtered).toHaveLength(1)
      expect(filtered[0]).toEqual(txn2)
    })

    it('sorts transactions by date', () => {
      const txn1 = createTransaction({ accountId: 'account-1', date: '2024-01-15', amount: -200 })
      const txn2 = createTransaction({ accountId: 'account-1', date: '2024-01-05', amount: -100 })
      const txn3 = createTransaction({ accountId: 'account-1', date: '2024-01-25', amount: -300 })

      store.saveTransaction(txn1)
      store.saveTransaction(txn2)
      store.saveTransaction(txn3)

      const txns = store.listTransactions('account-1')
      expect(txns[0].date).toBe('2024-01-05')
      expect(txns[1].date).toBe('2024-01-15')
      expect(txns[2].date).toBe('2024-01-25')
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
      const category = createCategory({ groupId: 'group-1', name: 'Groceries' })
      store.saveCategory(category)

      expect(store.getCategory(category.id)).toEqual(category)
    })

    it('lists categories by budget', () => {
      const budget = createBudget({ name: 'Test' })
      const group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
      const category = createCategory({ groupId: group.id, name: 'Groceries' })

      store.saveBudget(budget)
      store.saveCategoryGroup(group)
      store.saveCategory(category)

      const categories = store.listCategories(budget.id)
      expect(categories).toHaveLength(1)
      expect(categories[0]).toEqual(category)
    })
  })

  describe('CategoryGroup operations', () => {
    it('saves and retrieves a category group', () => {
      const group = createCategoryGroup({ budgetId: 'budget-1', name: 'Needs' })
      store.saveCategoryGroup(group)

      expect(store.getCategoryGroup(group.id)).toEqual(group)
    })

    it('lists category groups by budget', () => {
      const group1 = createCategoryGroup({ budgetId: 'budget-1', name: 'Needs', sortOrder: 1 })
      const group2 = createCategoryGroup({ budgetId: 'budget-1', name: 'Wants', sortOrder: 2 })
      const group3 = createCategoryGroup({ budgetId: 'budget-2', name: 'Other' })

      store.saveCategoryGroup(group1)
      store.saveCategoryGroup(group2)
      store.saveCategoryGroup(group3)

      const groups = store.listCategoryGroups('budget-1')
      expect(groups).toHaveLength(2)
      expect(groups[0].name).toBe('Needs')
      expect(groups[1].name).toBe('Wants')
    })
  })

  describe('Payee operations', () => {
    it('saves and retrieves a payee', () => {
      const payee = createPayee({ budgetId: 'budget-1', name: 'Store' })
      store.savePayee(payee)

      expect(store.getPayee(payee.id)).toEqual(payee)
    })

    it('lists payees by budget', () => {
      const payee1 = createPayee({ budgetId: 'budget-1', name: 'Store A' })
      const payee2 = createPayee({ budgetId: 'budget-2', name: 'Store B' })

      store.savePayee(payee1)
      store.savePayee(payee2)

      const payees = store.listPayees('budget-1')
      expect(payees).toHaveLength(1)
      expect(payees[0]).toEqual(payee1)
    })
  })

  describe('Target operations', () => {
    it('saves and retrieves a target by category', () => {
      const target = createTarget({
        categoryId: 'category-1',
        type: 'monthly_contribution',
        amount: 10000,
      })
      store.saveTarget(target)

      expect(store.getTarget('category-1')).toEqual(target)
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

      expect(store.getTarget('category-1')).toEqual(target2)
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
      const assignment = createAssignment({
        categoryId: 'category-1',
        month: '2024-01',
        amount: 50000,
      })
      store.saveAssignment(assignment)

      expect(store.getAssignment('category-1', '2024-01')).toEqual(assignment)
    })

    it('retrieves null for non-existent assignment', () => {
      expect(store.getAssignment('category-1', '2024-01')).toBeNull()
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
