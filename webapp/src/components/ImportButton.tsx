import { useRef, useState } from 'react'
import { useBudget, useToast } from '../contexts/index.ts'
import type { StoreExportData } from '@budget/core'

/**
 * Validates that the parsed JSON has the expected structure for StoreExportData.
 */
function validateExportData(data: unknown): data is StoreExportData {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    typeof obj.version === 'string' &&
    typeof obj.schemaVersion === 'number' &&
    Array.isArray(obj.budgets)
  )
}

/**
 * ImportButton - A button that opens a file picker for JSON budget files.
 *
 * Features:
 * - Hidden file input triggered by a visible button
 * - Accepts only .json files
 * - Validates imported data structure
 * - Uses store.fromJSON() for unified import
 * - Shows error/success messages
 */
export function ImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { addToast } = useToast()
  const { store, refresh } = useBudget()

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

      if (!validateExportData(data)) {
        addToast({
          type: 'error',
          message: 'Invalid budget file format. Expected version, schemaVersion, and budgets fields.',
        })
        return
      }

      try {
        store.fromJSON(data)
        refresh()

        const txCount = data.budgets.reduce((sum, b) => sum + b.transactions.length, 0)
        addToast({
          type: 'success',
          message: `Imported ${txCount} transactions`,
        })
      } catch (err) {
        addToast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to import',
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
