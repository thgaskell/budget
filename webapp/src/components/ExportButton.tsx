import { useBudget, useToast } from '../contexts/index.ts'
import type { StoreExportData } from '@budget/core'

/**
 * Format a date as YYYY-MM-DD for use in filenames.
 */
function formatDateForFilename(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Trigger a file download with the given content.
 */
function downloadJson(data: StoreExportData, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * ExportButton component - exports all budget data to a JSON file.
 */
export function ExportButton() {
  const { store, clearDirty } = useBudget()
  const { addToast } = useToast()

  const handleExport = () => {
    try {
      const data = store.toJSON()

      if (data.budgets.length === 0) {
        addToast({ type: 'error', message: 'No budget to export' })
        return
      }

      const dateStr = formatDateForFilename(new Date())
      const filename = `budget-export-${dateStr}.json`
      downloadJson(data, filename)
      clearDirty()
      addToast({ type: 'success', message: 'Budget exported successfully' })
    } catch (error) {
      addToast({ type: 'error', message: 'Failed to export budget' })
    }
  }

  return (
    <button
      onClick={handleExport}
      className="export-button"
    >
      Export
    </button>
  )
}
