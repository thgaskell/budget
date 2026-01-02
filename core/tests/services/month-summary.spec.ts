import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryStore } from '../../src/stores/memory.ts'
import { createBudget } from '../../src/schemas/budget.ts'
import { createAccount } from '../../src/schemas/account.ts'
import { createCategory } from '../../src/schemas/category.ts'
import { createCategoryGroup } from '../../src/schemas/category-group.ts'
import { createTransaction } from '../../src/schemas/transaction.ts'
import { createAssignment } from '../../src/schemas/assignment.ts'
import {
  calculateMonthSummary,
  getOrCalculateMonthSummary,
  recalculateFromMonth,
  getMonthReadyToAssign,
  getCategoryAvailableForMonth,
  getMonthData,
  getLastAssignmentsBeforeMonth,
} from '../../src/services/month-summary.ts'

describe('month-summary service', () => {
  let store: MemoryStore
  let budgetId: string
  let accountId: string
  let categoryGroupId: string
  let categoryId: string

  beforeEach(() => {
    store = new MemoryStore()

    // Create budget
    const budget = createBudget({ name: 'Test Budget' })
    store.saveBudget(budget)
    budgetId = budget.id

    // Create account
    const account = createAccount({
      budgetId,
      name: 'Checking',
      type: 'checking',
    })
    store.saveAccount(account)
    accountId = account.id

    // Create category group
    const group = createCategoryGroup({
      budgetId,
      name: 'Bills',
      sortOrder: 0,
    })
    store.saveCategoryGroup(group)
    categoryGroupId = group.id

    // Create category
    const category = createCategory({
      groupId: categoryGroupId,
      name: 'Rent',
      sortOrder: 0,
    })
    store.saveCategory(category)
    categoryId = category.id
  })

  describe('calculateMonthSummary', () => {
    it('calculates closing RTA for first month with no previous data', () => {
      // Add income transaction
      const income = createTransaction({
        accountId,
        amount: 100000, // $1000
        date: '2025-12-15',
        categoryId: null,
        payeeId: null,
        memo: 'Paycheck',
      })
      store.saveTransaction(income)

      // Add assignment
      const assignment = createAssignment({
        categoryId,
        month: '2025-12',
        amount: 50000, // $500
      })
      store.saveAssignment(assignment)

      const summary = calculateMonthSummary(store, budgetId, '2025-12', null)

      // Closing RTA = 0 (opening) + 100000 (inflows) - 50000 (assignments)
      expect(summary.closingRTA).toBe(50000)
      expect(summary.month).toBe('2025-12')
      expect(summary.budgetId).toBe(budgetId)
    })

    it('calculates closing RTA with carryover from previous month', () => {
      // Previous month summary
      const previousSummary = {
        id: 'prev-id',
        budgetId,
        month: '2025-11',
        closingRTA: 20000, // $200 carryover
        categoryBalances: { [categoryId]: 10000 },
        updatedAt: new Date().toISOString(),
      }

      // Add income transaction for December
      const income = createTransaction({
        accountId,
        amount: 100000,
        date: '2025-12-15',
        categoryId: null,
        payeeId: null,
        memo: 'Paycheck',
      })
      store.saveTransaction(income)

      // Add assignment for December
      const assignment = createAssignment({
        categoryId,
        month: '2025-12',
        amount: 80000,
      })
      store.saveAssignment(assignment)

      const summary = calculateMonthSummary(store, budgetId, '2025-12', previousSummary)

      // Closing RTA = 20000 (carryover) + 100000 (inflows) - 80000 (assignments) = 40000
      expect(summary.closingRTA).toBe(40000)
    })

    it('calculates category balances with carryover', () => {
      // Previous month had $100 remaining in category
      const previousSummary = {
        id: 'prev-id',
        budgetId,
        month: '2025-11',
        closingRTA: 0,
        categoryBalances: { [categoryId]: 10000 }, // $100 remaining
        updatedAt: new Date().toISOString(),
      }

      // Add assignment for December
      const assignment = createAssignment({
        categoryId,
        month: '2025-12',
        amount: 50000, // $500 assigned
      })
      store.saveAssignment(assignment)

      // Add expense in December
      const expense = createTransaction({
        accountId,
        amount: -30000, // -$300 expense
        date: '2025-12-20',
        categoryId,
        payeeId: null,
        memo: 'December rent',
      })
      store.saveTransaction(expense)

      const summary = calculateMonthSummary(store, budgetId, '2025-12', previousSummary)

      // Category balance = 10000 (carryover) + 50000 (assigned) - 30000 (expense) = 30000
      expect(summary.categoryBalances[categoryId]).toBe(30000)
    })
  })

  describe('getOrCalculateMonthSummary', () => {
    it('returns cached summary if available', () => {
      const cachedSummary = {
        id: 'cached-id',
        budgetId,
        month: '2025-12',
        closingRTA: 50000,
        categoryBalances: {},
        updatedAt: new Date().toISOString(),
      }
      store.saveMonthSummary(cachedSummary)

      const result = getOrCalculateMonthSummary(store, budgetId, '2025-12')

      expect(result.id).toBe('cached-id')
      expect(result.closingRTA).toBe(50000)
    })

    it('calculates and caches summary if not available', () => {
      // Add income
      const income = createTransaction({
        accountId,
        amount: 100000,
        date: '2025-12-15',
        categoryId: null,
        payeeId: null,
        memo: 'Paycheck',
      })
      store.saveTransaction(income)

      const result = getOrCalculateMonthSummary(store, budgetId, '2025-12')

      expect(result.closingRTA).toBe(100000)

      // Verify it was cached
      const cached = store.getMonthSummary(budgetId, '2025-12')
      expect(cached).not.toBeNull()
      expect(cached?.closingRTA).toBe(100000)
    })
  })

  describe('recalculateFromMonth', () => {
    it('recalculates multiple months forward', () => {
      // Set up November
      const novIncome = createTransaction({
        accountId,
        amount: 100000,
        date: '2025-11-15',
        categoryId: null,
        payeeId: null,
        memo: 'November paycheck',
      })
      store.saveTransaction(novIncome)

      const novAssignment = createAssignment({
        categoryId,
        month: '2025-11',
        amount: 60000,
      })
      store.saveAssignment(novAssignment)

      // Set up December
      const decIncome = createTransaction({
        accountId,
        amount: 100000,
        date: '2025-12-15',
        categoryId: null,
        payeeId: null,
        memo: 'December paycheck',
      })
      store.saveTransaction(decIncome)

      const decAssignment = createAssignment({
        categoryId,
        month: '2025-12',
        amount: 80000,
      })
      store.saveAssignment(decAssignment)

      // First calculate December to create a summary
      getOrCalculateMonthSummary(store, budgetId, '2025-12')

      // Now recalculate from November
      recalculateFromMonth(store, budgetId, '2025-11')

      // Check November
      const novSummary = store.getMonthSummary(budgetId, '2025-11')
      expect(novSummary).not.toBeNull()
      // Nov RTA = 0 + 100000 - 60000 = 40000
      expect(novSummary?.closingRTA).toBe(40000)

      // Check December (should include November carryover)
      const decSummary = store.getMonthSummary(budgetId, '2025-12')
      expect(decSummary).not.toBeNull()
      // Dec RTA = 40000 (carryover) + 100000 - 80000 = 60000
      expect(decSummary?.closingRTA).toBe(60000)
    })
  })

  describe('getMonthReadyToAssign', () => {
    it('returns ready to assign for a month', () => {
      const income = createTransaction({
        accountId,
        amount: 100000,
        date: '2025-12-15',
        categoryId: null,
        payeeId: null,
        memo: 'Paycheck',
      })
      store.saveTransaction(income)

      const assignment = createAssignment({
        categoryId,
        month: '2025-12',
        amount: 30000,
      })
      store.saveAssignment(assignment)

      const rta = getMonthReadyToAssign(store, budgetId, '2025-12')
      expect(rta).toBe(70000)
    })
  })

  describe('getCategoryAvailableForMonth', () => {
    it('returns category available balance for a month', () => {
      const assignment = createAssignment({
        categoryId,
        month: '2025-12',
        amount: 50000,
      })
      store.saveAssignment(assignment)

      const expense = createTransaction({
        accountId,
        amount: -20000,
        date: '2025-12-20',
        categoryId,
        payeeId: null,
        memo: 'Expense',
      })
      store.saveTransaction(expense)

      const available = getCategoryAvailableForMonth(store, budgetId, categoryId, '2025-12')
      expect(available).toBe(30000)
    })
  })

  describe('getMonthData', () => {
    it('returns complete month data including carryover info', () => {
      // Set up previous month
      const prevSummary = {
        id: 'prev-id',
        budgetId,
        month: '2025-11',
        closingRTA: 25000,
        categoryBalances: { [categoryId]: 15000 },
        updatedAt: new Date().toISOString(),
      }
      store.saveMonthSummary(prevSummary)

      // Add income for December
      const income = createTransaction({
        accountId,
        amount: 100000,
        date: '2025-12-15',
        categoryId: null,
        payeeId: null,
        memo: 'Paycheck',
      })
      store.saveTransaction(income)

      // Add assignment for December
      const assignment = createAssignment({
        categoryId,
        month: '2025-12',
        amount: 50000,
      })
      store.saveAssignment(assignment)

      // Add expense in December
      const expense = createTransaction({
        accountId,
        amount: -20000,
        date: '2025-12-20',
        categoryId,
        payeeId: null,
        memo: 'Expense',
      })
      store.saveTransaction(expense)

      const monthData = getMonthData(store, budgetId, '2025-12')

      expect(monthData.month).toBe('2025-12')
      expect(monthData.openingRTA).toBe(25000)
      // Closing = 25000 + 100000 - 50000 = 75000
      expect(monthData.closingRTA).toBe(75000)

      const catData = monthData.categoryData[categoryId]
      expect(catData.openingBalance).toBe(15000)
      expect(catData.assigned).toBe(50000)
      expect(catData.activity).toBe(-20000)
      // Closing = 15000 + 50000 - 20000 = 45000
      expect(catData.closingBalance).toBe(45000)
    })
  })

  describe('getLastAssignmentsBeforeMonth', () => {
    it('returns empty map when no prior assignments exist', () => {
      const result = getLastAssignmentsBeforeMonth(store, budgetId, '2025-12')

      expect(result.size).toBe(0)
    })

    it('returns empty map when all assignments are at or after the boundary month', () => {
      // Create assignment exactly at the boundary month
      const boundaryAssignment = createAssignment({
        categoryId,
        month: '2025-12',
        amount: 50000,
      })
      store.saveAssignment(boundaryAssignment)

      // Create assignment after the boundary month
      const futureAssignment = createAssignment({
        categoryId,
        month: '2026-01',
        amount: 60000,
      })
      store.saveAssignment(futureAssignment)

      const result = getLastAssignmentsBeforeMonth(store, budgetId, '2025-12')

      expect(result.size).toBe(0)
    })

    it('finds single assignment before target month', () => {
      const assignment = createAssignment({
        categoryId,
        month: '2025-11',
        amount: 50000,
      })
      store.saveAssignment(assignment)

      const result = getLastAssignmentsBeforeMonth(store, budgetId, '2025-12')

      expect(result.size).toBe(1)
      expect(result.get(categoryId)).toBeDefined()
      expect(result.get(categoryId)?.month).toBe('2025-11')
      expect(result.get(categoryId)?.amount).toBe(50000)
    })

    it('finds most recent assignment when multiple exist across different months', () => {
      // Create assignments for Jan, Feb, and March
      const janAssignment = createAssignment({
        categoryId,
        month: '2025-01',
        amount: 10000,
      })
      store.saveAssignment(janAssignment)

      const febAssignment = createAssignment({
        categoryId,
        month: '2025-02',
        amount: 20000,
      })
      store.saveAssignment(febAssignment)

      const marAssignment = createAssignment({
        categoryId,
        month: '2025-03',
        amount: 30000,
      })
      store.saveAssignment(marAssignment)

      // Query for April - should return March assignment (most recent before April)
      const result = getLastAssignmentsBeforeMonth(store, budgetId, '2025-04')

      expect(result.size).toBe(1)
      expect(result.get(categoryId)?.month).toBe('2025-03')
      expect(result.get(categoryId)?.amount).toBe(30000)
    })

    it('correctly excludes boundary month from results', () => {
      // Create assignment for November and December
      const novAssignment = createAssignment({
        categoryId,
        month: '2025-11',
        amount: 50000,
      })
      store.saveAssignment(novAssignment)

      const decAssignment = createAssignment({
        categoryId,
        month: '2025-12',
        amount: 60000,
      })
      store.saveAssignment(decAssignment)

      // Query for December - should return November (excludes December)
      const result = getLastAssignmentsBeforeMonth(store, budgetId, '2025-12')

      expect(result.size).toBe(1)
      expect(result.get(categoryId)?.month).toBe('2025-11')
      expect(result.get(categoryId)?.amount).toBe(50000)
    })

    it('handles multiple categories with different assignment histories', () => {
      // Create a second category
      const category2 = createCategory({
        groupId: categoryGroupId,
        name: 'Utilities',
        sortOrder: 1,
      })
      store.saveCategory(category2)
      const category2Id = category2.id

      // Create a third category
      const category3 = createCategory({
        groupId: categoryGroupId,
        name: 'Groceries',
        sortOrder: 2,
      })
      store.saveCategory(category3)
      const category3Id = category3.id

      // Category 1: assignments in Jan and Feb
      store.saveAssignment(createAssignment({
        categoryId,
        month: '2025-01',
        amount: 10000,
      }))
      store.saveAssignment(createAssignment({
        categoryId,
        month: '2025-02',
        amount: 20000,
      }))

      // Category 2: only assignment in January
      store.saveAssignment(createAssignment({
        categoryId: category2Id,
        month: '2025-01',
        amount: 15000,
      }))

      // Category 3: no assignments before March (only assignment AT March)
      store.saveAssignment(createAssignment({
        categoryId: category3Id,
        month: '2025-03',
        amount: 25000,
      }))

      // Query for March
      const result = getLastAssignmentsBeforeMonth(store, budgetId, '2025-03')

      // Should find 2 categories (cat1 and cat2)
      expect(result.size).toBe(2)

      // Category 1 should return Feb assignment (most recent)
      expect(result.get(categoryId)?.month).toBe('2025-02')
      expect(result.get(categoryId)?.amount).toBe(20000)

      // Category 2 should return Jan assignment
      expect(result.get(category2Id)?.month).toBe('2025-01')
      expect(result.get(category2Id)?.amount).toBe(15000)

      // Category 3 should not be in the result (only has assignment AT boundary)
      expect(result.has(category3Id)).toBe(false)
    })

    it('handles gaps in assignment history correctly', () => {
      // Create assignments with a gap: Jan, March (no Feb)
      const janAssignment = createAssignment({
        categoryId,
        month: '2025-01',
        amount: 10000,
      })
      store.saveAssignment(janAssignment)

      // Skip February intentionally

      const marAssignment = createAssignment({
        categoryId,
        month: '2025-03',
        amount: 30000,
      })
      store.saveAssignment(marAssignment)

      // Query for February - should return January (most recent before Feb)
      const resultFeb = getLastAssignmentsBeforeMonth(store, budgetId, '2025-02')
      expect(resultFeb.size).toBe(1)
      expect(resultFeb.get(categoryId)?.month).toBe('2025-01')
      expect(resultFeb.get(categoryId)?.amount).toBe(10000)

      // Query for April - should return March (most recent before April)
      const resultApr = getLastAssignmentsBeforeMonth(store, budgetId, '2025-04')
      expect(resultApr.size).toBe(1)
      expect(resultApr.get(categoryId)?.month).toBe('2025-03')
      expect(resultApr.get(categoryId)?.amount).toBe(30000)
    })

    it('returns assignments from far in the past when no recent ones exist', () => {
      // Create assignment from a year ago
      const oldAssignment = createAssignment({
        categoryId,
        month: '2024-01',
        amount: 40000,
      })
      store.saveAssignment(oldAssignment)

      // Query for December 2025 - should still find the old assignment
      const result = getLastAssignmentsBeforeMonth(store, budgetId, '2025-12')

      expect(result.size).toBe(1)
      expect(result.get(categoryId)?.month).toBe('2024-01')
      expect(result.get(categoryId)?.amount).toBe(40000)
    })
  })
})
