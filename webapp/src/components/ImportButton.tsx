import { useRef, useState } from 'react'
import { useBudget, useToast } from '../contexts/index.ts'
import type { BudgetExportData } from '../types/export'

/**
 * Clears all budget data from the store except the budget and account.
 * This ensures a clean slate before importing new data.
 */
function clearExistingData(
  store: ReturnType<typeof useBudget>['store'],
  categoryGroups: ReturnType<typeof useBudget>['categoryGroups'],
  categories: ReturnType<typeof useBudget>['categories'],
  allTransactions: ReturnType<typeof useBudget>['allTransactions'],
  payees: ReturnType<typeof useBudget>['payees']
): void {
  // Delete transactions first (they reference categories and payees)
  for (const txn of allTransactions) {
    store.deleteTransaction(txn.id)
  }

  // Delete categories (which clears assignments/targets by orphaning them)
  for (const category of categories) {
    store.deleteCategory(category.id)
  }

  // Delete category groups
  for (const group of categoryGroups) {
    store.deleteCategoryGroup(group.id)
  }

  // Delete payees
  for (const payee of payees) {
    store.deletePayee(payee.id)
  }
}

/**
 * Validates that an item has required string fields.
 */
function hasRequiredStringFields(item: unknown, fields: string[]): boolean {
  if (typeof item !== 'object' || item === null) {
    return false
  }
  const obj = item as Record<string, unknown>
  return fields.every((field) => typeof obj[field] === 'string')
}

/**
 * Validates that an item has required number fields.
 */
function hasRequiredNumberFields(item: unknown, fields: string[]): boolean {
  if (typeof item !== 'object' || item === null) {
    return false
  }
  const obj = item as Record<string, unknown>
  return fields.every((field) => typeof obj[field] === 'number')
}

/**
 * Validates that the parsed JSON has the expected structure for budget data.
 * Validates both top-level structure and item structure within arrays.
 */
function validateBudgetData(data: unknown): data is BudgetExportData {
  if (typeof data !== 'object' || data === null) {
    return false
  }

  const obj = data as Record<string, unknown>

  // Check for version field (required)
  if (typeof obj.version !== 'string') {
    return false
  }

  // Check for budget (singular object, required)
  if (typeof obj.budget !== 'object' || obj.budget === null) {
    return false
  }
  const budget = obj.budget as Record<string, unknown>
  if (typeof budget.id !== 'string' || typeof budget.name !== 'string') {
    return false
  }

  // Check for required arrays
  const requiredArrays = ['accounts', 'categoryGroups', 'categories', 'transactions', 'payees', 'assignments']

  for (const field of requiredArrays) {
    if (!Array.isArray(obj[field])) {
      return false
    }
  }

  // targets is optional
  if (obj.targets !== undefined && !Array.isArray(obj.targets)) {
    return false
  }

  // Validate item structure in arrays (check first item if array is non-empty)
  const categoryGroups = obj.categoryGroups as unknown[]
  if (categoryGroups.length > 0) {
    const sample = categoryGroups[0]
    if (!hasRequiredStringFields(sample, ['id', 'name']) || !hasRequiredNumberFields(sample, ['sortOrder'])) {
      return false
    }
  }

  const categories = obj.categories as unknown[]
  if (categories.length > 0) {
    const sample = categories[0]
    if (!hasRequiredStringFields(sample, ['id', 'groupId', 'name']) || !hasRequiredNumberFields(sample, ['sortOrder'])) {
      return false
    }
  }

  const transactions = obj.transactions as unknown[]
  if (transactions.length > 0) {
    const sample = transactions[0]
    if (!hasRequiredStringFields(sample, ['id', 'date']) || !hasRequiredNumberFields(sample, ['amount'])) {
      return false
    }
  }

  const payees = obj.payees as unknown[]
  if (payees.length > 0) {
    const sample = payees[0]
    if (!hasRequiredStringFields(sample, ['id', 'name'])) {
      return false
    }
  }

  const assignments = obj.assignments as unknown[]
  if (assignments.length > 0) {
    const sample = assignments[0]
    if (!hasRequiredStringFields(sample, ['id', 'categoryId', 'month']) || !hasRequiredNumberFields(sample, ['amount'])) {
      return false
    }
  }

  // Validate targets if present
  if (obj.targets) {
    const targets = obj.targets as unknown[]
    if (targets.length > 0) {
      const sample = targets[0]
      if (!hasRequiredStringFields(sample, ['id', 'categoryId', 'type']) || !hasRequiredNumberFields(sample, ['amount'])) {
        return false
      }
    }
  }

  return true
}

/**
 * ImportButton - A button that opens a file picker for JSON budget files.
 *
 * Features:
 * - Hidden file input triggered by a visible button
 * - Accepts only .json files
 * - Validates imported data structure
 * - Hydrates the store with imported data
 * - Shows error/success messages
 */
export function ImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { addToast } = useToast()
  const { store, budget, accounts, categoryGroups, categories, allTransactions, payees, refresh } = useBudget()

  // Use the first (default Cash) account for all transactions
  const defaultAccountId = accounts[0]?.id
  const currentBudgetId = budget?.id

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsLoading(true)
    try {
      const text = await file.text()
      let data: unknown

      try {
        data = JSON.parse(text)
      } catch {
        addToast({ type: 'error', message: 'Invalid JSON file. Please select a valid budget export file.' })
        return
      }

      if (!validateBudgetData(data)) {
        addToast({
          type: 'error',
          message:
            'Invalid budget file format. The file is missing required fields (version, budget, accounts, categories, etc.).',
        })
        return
      }

      // Hydrate the store with imported data
      try {
        if (!defaultAccountId || !currentBudgetId) {
          addToast({ type: 'error', message: 'No budget or account available. Please refresh and try again.' })
          return
        }

        // Clear existing data before importing
        clearExistingData(store, categoryGroups, categories, allTransactions, payees)

        // Update budget name from imported data
        const existingBudget = store.getBudget(currentBudgetId)
        if (existingBudget && data.budget.name) {
          store.saveBudget({
            ...existingBudget,
            name: data.budget.name,
          })
        }

        // Skip importing accounts - UI uses single hidden Cash account

        // Import category groups - map to current budget
        for (const group of data.categoryGroups) {
          const g = group as Parameters<typeof store.saveCategoryGroup>[0]
          store.saveCategoryGroup({
            ...g,
            budgetId: currentBudgetId,
          })
        }

        // Import categories
        for (const category of data.categories) {
          store.saveCategory(category as Parameters<typeof store.saveCategory>[0])
        }

        // Import payees - map to current budget
        for (const payee of data.payees) {
          const p = payee as Parameters<typeof store.savePayee>[0]
          store.savePayee({
            ...p,
            budgetId: currentBudgetId,
          })
        }

        // Import transactions - map all to the default Cash account
        for (const transaction of data.transactions) {
          const txn = transaction as Parameters<typeof store.saveTransaction>[0]
          store.saveTransaction({
            ...txn,
            accountId: defaultAccountId, // Use single Cash account
          })
        }

        // Import assignments
        for (const assignment of data.assignments) {
          store.saveAssignment(assignment as Parameters<typeof store.saveAssignment>[0])
        }

        // Import targets (if present)
        if (data.targets) {
          for (const target of data.targets) {
            store.saveTarget(target as Parameters<typeof store.saveTarget>[0])
          }
        }

        // Refresh the UI
        refresh()

        addToast({
          type: 'success',
          message: `Imported ${data.transactions.length} transactions`,
        })
      } catch (err) {
        addToast({
          type: 'error',
          message: `Failed to import data: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    } catch (err) {
      addToast({
        type: 'error',
        message: `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    } finally {
      setIsLoading(false)
      // Reset the file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="import-button-container">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-label="Import budget file"
      />
      <button type="button" onClick={handleClick} className="import-button" disabled={isLoading}>
        {isLoading ? 'Importing...' : 'Import'}
      </button>
    </div>
  )
}
