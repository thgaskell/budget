import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react'
import {
  MemoryStore,
  createBudget,
  createAccount,
  createCategory,
  createCategoryGroup,
  createPayee,
  getReadyToAssign,
  addTransaction as addTransactionService,
  deleteTransactionWithTransfer,
  assignToCategory as assignToCategoryService,
  recalculateFromMonth,
  getMonthData,
  getLastAssignmentsBeforeMonth,
  getMonthStart,
  getMonthEnd,
  type Store,
  type Budget,
  type Account,
  type Category,
  type CategoryGroup,
  type Transaction,
  type Payee,
  type Assignment,
  type CreateTransactionInput,
  type MonthData,
} from '@budget/core'

/**
 * Budget context value - provides access to store and reactive data.
 */
interface BudgetContextValue {
  /** The underlying store instance */
  store: Store
  /** Current budget (null during initialization) */
  budget: Budget | null
  /** Accounts in the current budget */
  accounts: Account[]
  /** Category groups in the current budget */
  categoryGroups: CategoryGroup[]
  /** Categories in the current budget */
  categories: Category[]
  /** All transactions in the current budget */
  allTransactions: Transaction[]
  /** Transactions filtered by selected month */
  transactions: Transaction[]
  /** Payees in the current budget */
  payees: Payee[]
  /** Assignments for the selected month */
  assignments: Assignment[]
  /** Last known assignment for each category before the selected month (for showing inherited values) */
  previousMonthAssignments: Assignment[]
  /** Amount available to assign for the selected month */
  readyToAssign: number
  /** Current (real) month in YYYY-MM format */
  currentMonth: string
  /** Selected month for display in YYYY-MM format */
  selectedMonth: string
  /** Month data with carryover calculations */
  monthData: MonthData | null
  /** Whether unsaved changes exist since last export */
  isDirty: boolean
  /** Change the selected month */
  setSelectedMonth: (month: string) => void
  /** Force a refresh of data from the store */
  refresh: () => void
  /** Clear the dirty flag (called after export) */
  clearDirty: () => void

  // Transaction CRUD
  addTransaction: (input: CreateTransactionInput) => Transaction
  updateTransaction: (transaction: Transaction) => void
  deleteTransaction: (transactionId: string) => void

  // Category CRUD
  addCategory: (groupId: string, name: string) => Category
  updateCategory: (category: Category) => void
  deleteCategory: (categoryId: string) => void

  // CategoryGroup CRUD
  addCategoryGroup: (name: string) => CategoryGroup
  updateCategoryGroup: (group: CategoryGroup) => void
  deleteCategoryGroup: (groupId: string) => void

  // Assignment
  assignToCategory: (categoryId: string, amount: number) => void

  // Payee
  addPayee: (name: string) => Payee
}

const BudgetContext = createContext<BudgetContextValue | null>(null)

/**
 * Get current month in YYYY-MM format.
 */
function getCurrentMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

interface BudgetProviderProps {
  children: ReactNode
}

/**
 * BudgetProvider - wraps the app to provide access to budget data.
 *
 * On initial load:
 * - Creates a MemoryStore instance
 * - Creates a default budget named "My Budget"
 * - Creates a default Cash account
 */
export function BudgetProvider({ children }: BudgetProviderProps) {
  // Store is created once and persists for the session
  const [store] = useState(() => new MemoryStore())

  // Reactive state
  const [budget, setBudget] = useState<Budget | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [payees, setPayees] = useState<Payee[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [previousMonthAssignments, setPreviousMonthAssignments] = useState<Assignment[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // Dirty tracking for export reminder (beforeunload warning)
  const [isDirty, setIsDirty] = useState(false)

  const currentMonth = useMemo(() => getCurrentMonth(), [])
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)

  // Initialize default budget and account on first load
  useEffect(() => {
    // Check if we already have a budget
    const existingBudgets = store.listBudgets()
    if (existingBudgets.length > 0) {
      setBudget(existingBudgets[0])
      return
    }

    // Create default budget
    const newBudget = createBudget({ name: 'Budget' })
    store.saveBudget(newBudget)

    // Create default Cash account
    const cashAccount = createAccount({
      budgetId: newBudget.id,
      name: 'Cash',
      type: 'cash',
    })
    store.saveAccount(cashAccount)

    setBudget(newBudget)
  }, [store])

  // Refresh data from store when budget changes or refresh is triggered
  useEffect(() => {
    if (!budget) return

    // Reload budget in case name or other properties changed
    // Also handles the case where budget was replaced by import (different ID)
    let activeBudget = store.getBudget(budget.id)
    if (!activeBudget) {
      // Budget no longer exists (e.g., after import) - switch to first available
      const budgets = store.listBudgets()
      if (budgets.length > 0) {
        activeBudget = budgets[0]
        setBudget(activeBudget)
        return // Will re-run with new budget
      }
      return
    }
    if (activeBudget.name !== budget.name) {
      setBudget(activeBudget)
    }

    setAccounts(store.listAccounts(activeBudget.id))
    setCategoryGroups(store.listCategoryGroups(activeBudget.id))
    setCategories(store.listCategories(activeBudget.id))
    setAllTransactions(store.listAllTransactions(activeBudget.id))
    setPayees(store.listPayees(activeBudget.id))
    setAssignments(store.listAssignments(activeBudget.id, selectedMonth))
    // Get the last known assignment for each category before this month
    const lastAssignments = getLastAssignmentsBeforeMonth(store, activeBudget.id, selectedMonth)
    setPreviousMonthAssignments(Array.from(lastAssignments.values()))
  }, [store, budget, selectedMonth, refreshKey])

  // Filter transactions by selected month
  const transactions = useMemo(() => {
    const monthStart = getMonthStart(selectedMonth)
    const monthEnd = getMonthEnd(selectedMonth)
    return allTransactions.filter((txn) => txn.date >= monthStart && txn.date <= monthEnd)
  }, [allTransactions, selectedMonth])

  // Calculate ready to assign for selected month
  const readyToAssign = useMemo(() => {
    if (!budget) return 0
    return getReadyToAssign(store, budget.id, selectedMonth)
  }, [store, budget, selectedMonth, refreshKey])

  // Get month data with carryover calculations
  const monthData = useMemo(() => {
    if (!budget) return null
    return getMonthData(store, budget.id, selectedMonth)
  }, [store, budget, selectedMonth, refreshKey])

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  // Mark data as dirty (called on any mutation)
  const markDirty = useCallback(() => {
    setIsDirty(true)
  }, [])

  // Clear dirty flag (called after export)
  const clearDirty = useCallback(() => {
    setIsDirty(false)
  }, [])

  // Transaction CRUD
  const addTransaction = useCallback(
    (input: CreateTransactionInput): Transaction => {
      const txn = addTransactionService(store, input)
      // Recalculate month summaries from the transaction's month
      if (budget) {
        const txnMonth = txn.date.substring(0, 7) // YYYY-MM
        recalculateFromMonth(store, budget.id, txnMonth)
      }
      markDirty()
      refresh()
      return txn
    },
    [store, budget, markDirty, refresh]
  )

  const updateTransaction = useCallback(
    (transaction: Transaction): void => {
      // Get the original transaction to compare months
      const original = store.getTransaction(transaction.id)
      store.saveTransaction(transaction)
      // Recalculate from the earlier of the two months
      if (budget) {
        const originalMonth = original?.date.substring(0, 7) ?? transaction.date.substring(0, 7)
        const newMonth = transaction.date.substring(0, 7)
        const earlierMonth = originalMonth < newMonth ? originalMonth : newMonth
        recalculateFromMonth(store, budget.id, earlierMonth)
      }
      markDirty()
      refresh()
    },
    [store, budget, markDirty, refresh]
  )

  const deleteTransaction = useCallback(
    (transactionId: string): void => {
      const txn = store.getTransaction(transactionId)
      deleteTransactionWithTransfer(store, transactionId)
      // Recalculate from the transaction's month
      if (budget && txn) {
        const txnMonth = txn.date.substring(0, 7)
        recalculateFromMonth(store, budget.id, txnMonth)
      }
      markDirty()
      refresh()
    },
    [store, budget, markDirty, refresh]
  )

  // Category CRUD
  const addCategory = useCallback(
    (groupId: string, name: string): Category => {
      const category = createCategory({
        groupId,
        name,
        sortOrder: categories.filter((c) => c.groupId === groupId).length,
      })
      store.saveCategory(category)
      markDirty()
      refresh()
      return category
    },
    [store, categories, markDirty, refresh]
  )

  const updateCategory = useCallback(
    (category: Category): void => {
      store.saveCategory(category)
      markDirty()
      refresh()
    },
    [store, markDirty, refresh]
  )

  const deleteCategory = useCallback(
    (categoryId: string): void => {
      store.deleteCategory(categoryId)
      markDirty()
      refresh()
    },
    [store, markDirty, refresh]
  )

  // CategoryGroup CRUD
  const addCategoryGroup = useCallback(
    (name: string): CategoryGroup => {
      if (!budget) throw new Error('No budget')
      const group = createCategoryGroup({
        budgetId: budget.id,
        name,
        sortOrder: categoryGroups.length,
      })
      store.saveCategoryGroup(group)
      markDirty()
      refresh()
      return group
    },
    [store, budget, categoryGroups, markDirty, refresh]
  )

  const updateCategoryGroup = useCallback(
    (group: CategoryGroup): void => {
      store.saveCategoryGroup(group)
      markDirty()
      refresh()
    },
    [store, markDirty, refresh]
  )

  const deleteCategoryGroup = useCallback(
    (groupId: string): void => {
      // Also delete all categories in the group
      const groupCategories = categories.filter((c) => c.groupId === groupId)
      for (const cat of groupCategories) {
        store.deleteCategory(cat.id)
      }
      store.deleteCategoryGroup(groupId)
      markDirty()
      refresh()
    },
    [store, categories, markDirty, refresh]
  )

  // Assignment - now uses selectedMonth instead of currentMonth
  const assignToCategory = useCallback(
    (categoryId: string, amount: number): void => {
      assignToCategoryService(store, categoryId, selectedMonth, amount)
      // Recalculate month summaries from this month forward
      if (budget) {
        recalculateFromMonth(store, budget.id, selectedMonth)
      }
      markDirty()
      refresh()
    },
    [store, budget, selectedMonth, markDirty, refresh]
  )

  // Payee
  const addPayee = useCallback(
    (name: string): Payee => {
      if (!budget) throw new Error('No budget')
      const payee = createPayee({ budgetId: budget.id, name })
      store.savePayee(payee)
      markDirty()
      refresh()
      return payee
    },
    [store, budget, markDirty, refresh]
  )

  const value: BudgetContextValue = {
    store,
    budget,
    accounts,
    categoryGroups,
    categories,
    allTransactions,
    transactions,
    payees,
    assignments,
    previousMonthAssignments,
    readyToAssign,
    currentMonth,
    selectedMonth,
    monthData,
    isDirty,
    setSelectedMonth,
    refresh,
    clearDirty,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addCategory,
    updateCategory,
    deleteCategory,
    addCategoryGroup,
    updateCategoryGroup,
    deleteCategoryGroup,
    assignToCategory,
    addPayee,
  }

  return (
    <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>
  )
}

/**
 * useBudget - access budget data from the context.
 *
 * @throws Error if used outside of BudgetProvider
 */
export function useBudget(): BudgetContextValue {
  const context = useContext(BudgetContext)
  if (!context) {
    throw new Error('useBudget must be used within a BudgetProvider')
  }
  return context
}
