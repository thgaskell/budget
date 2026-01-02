/**
 * Export data format for budget data.
 * This structure is used for both export and import operations.
 */

export interface ExportBudget {
  id: string
  name: string
  currency: string
}

export interface ExportAccount {
  id: string
  budgetId: string
  name: string
  type: 'checking' | 'savings' | 'credit' | 'cash' | 'tracking'
  onBudget: boolean
}

export interface ExportCategoryGroup {
  id: string
  budgetId: string
  name: string
  sortOrder: number
}

export interface ExportCategory {
  id: string
  groupId: string
  name: string
  sortOrder: number
}

export interface ExportTransaction {
  id: string
  accountId: string
  categoryId: string | null
  payeeId: string | null
  date: string
  amount: number
  cleared: boolean
  memo: string | null
  transferAccountId: string | null
}

export interface ExportPayee {
  id: string
  budgetId: string
  name: string
}

export interface ExportAssignment {
  id: string
  categoryId: string
  month: string
  amount: number
}

export interface ExportTarget {
  id: string
  categoryId: string
  type: 'spending_limit' | 'savings_balance' | 'monthly_contribution'
  amount: number
  targetDate: string | null
}

export interface BudgetExportData {
  version: string
  exportedAt: string
  budget: ExportBudget
  accounts: ExportAccount[]
  categoryGroups: ExportCategoryGroup[]
  categories: ExportCategory[]
  transactions: ExportTransaction[]
  payees: ExportPayee[]
  assignments: ExportAssignment[]
  targets: ExportTarget[]
}
