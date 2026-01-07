import { Command } from 'commander'
import { existsSync, unlinkSync, statSync, readFileSync } from 'fs'
import { SqliteStore } from '@budget/core'
import { getDefaultDbPath, getCurrentDbPath, clearActiveBudgetId } from '../config.ts'
import {
  outputSuccess,
  outputError,
  outputTable,
  colors,
  type OutputOptions,
} from '../output.ts'

/**
 * Schema version constant - increment when schema changes.
 */
const SCHEMA_VERSION = 1

/**
 * Tables in the database schema.
 */
const TABLES = [
  'budgets',
  'accounts',
  'transactions',
  'category_groups',
  'categories',
  'payees',
  'targets',
  'assignments',
  'month_summaries',
]

/**
 * Get table counts from the database.
 */
async function getTableCounts(dbPath: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}

  if (!existsSync(dbPath)) {
    return counts
  }

  const data = readFileSync(dbPath)
  const store = await SqliteStore.create(data)

  // Query each table for count
  // We need to access the internal db to run raw queries
  // Since SqliteStore doesn't expose raw query, we use the list methods
  // and count the results

  // For simplicity, we'll count via the store methods where possible
  const budgets = store.listBudgets()
  counts['budgets'] = budgets.length

  // For other tables, we need to count across all budgets
  let accountCount = 0
  let transactionCount = 0
  let categoryGroupCount = 0
  let categoryCount = 0
  let payeeCount = 0
  let assignmentCount = 0
  let monthSummaryCount = 0

  for (const budget of budgets) {
    const accounts = store.listAccounts(budget.id)
    accountCount += accounts.length

    for (const account of accounts) {
      const transactions = store.listTransactions(account.id)
      transactionCount += transactions.length
    }

    const groups = store.listCategoryGroups(budget.id)
    categoryGroupCount += groups.length

    const categories = store.listCategories(budget.id)
    categoryCount += categories.length

    const payees = store.listPayees(budget.id)
    payeeCount += payees.length

    const summaries = store.listMonthSummaries(budget.id)
    monthSummaryCount += summaries.length

    // Assignments are counted per budget via categories
    const assignments = store.listAllAssignmentsForBudget(budget.id)
    assignmentCount += assignments.length
  }

  counts['accounts'] = accountCount
  counts['transactions'] = transactionCount
  counts['category_groups'] = categoryGroupCount
  counts['categories'] = categoryCount
  counts['payees'] = payeeCount
  counts['targets'] = 0 // Targets are per-category, need to iterate
  counts['assignments'] = assignmentCount
  counts['month_summaries'] = monthSummaryCount

  store.close()

  return counts
}

/**
 * Format file size in human readable format.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}

/**
 * Register database management commands.
 */
export function registerDbCommands(program: Command): void {
  const db = program.command('db').description('Database management commands')

  // db info
  db.command('info')
    .description('Show database location, schema version, and table counts')
    .action(async () => {
      const options = program.opts() as OutputOptions
      try {
        const dbPath = getCurrentDbPath() || getDefaultDbPath()
        const exists = existsSync(dbPath)

        if (options.json) {
          const info: Record<string, unknown> = {
            path: dbPath,
            exists,
            schemaVersion: SCHEMA_VERSION,
          }

          if (exists) {
            const stats = statSync(dbPath)
            info.size = stats.size
            info.modified = stats.mtime.toISOString()
            info.tableCounts = await getTableCounts(dbPath)
          }

          console.log(JSON.stringify(info, null, 2))
        } else if (options.quiet) {
          console.log(dbPath)
        } else {
          console.log(colors.bold('Database Information'))
          console.log()
          console.log(`Location:       ${dbPath}`)
          console.log(`Exists:         ${exists ? colors.success('Yes') : colors.warning('No')}`)
          console.log(`Schema Version: ${SCHEMA_VERSION}`)

          if (exists) {
            const stats = statSync(dbPath)
            console.log(`File Size:      ${formatFileSize(stats.size)}`)
            console.log(`Last Modified:  ${stats.mtime.toISOString()}`)

            console.log()
            console.log(colors.bold('Table Counts'))

            const counts = await getTableCounts(dbPath)
            outputTable(
              ['Table', 'Records'],
              TABLES.map((table) => [table, counts[table] ?? 0]),
              { ...options, json: false, quiet: false }
            )
          }
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // db reset
  db.command('reset')
    .description('Delete the database file (requires confirmation)')
    .option('--force', 'Skip confirmation prompt')
    .action(async (opts: { force?: boolean }) => {
      const options = program.opts() as OutputOptions
      try {
        const dbPath = getCurrentDbPath() || getDefaultDbPath()

        if (!existsSync(dbPath)) {
          if (options.json) {
            console.log(JSON.stringify({ success: true, message: 'Database does not exist', path: dbPath }))
          } else if (!options.quiet) {
            console.log(colors.warning(`Database does not exist: ${dbPath}`))
          }
          return
        }

        if (!opts.force) {
          // In non-interactive mode (like tests), require --force
          throw new Error(
            'Database reset requires confirmation. Use --force to confirm deletion.'
          )
        }

        // Clear active budget config for this database before deleting
        clearActiveBudgetId()

        // Delete the database file
        unlinkSync(dbPath)

        outputSuccess(`Deleted database: ${dbPath}`, options, { path: dbPath })
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // db migrate
  db.command('migrate')
    .description('Run pending migrations and fix schema issues')
    .action(async () => {
      const options = program.opts() as OutputOptions
      try {
        const dbPath = getCurrentDbPath() || getDefaultDbPath()

        if (!existsSync(dbPath)) {
          if (options.json) {
            console.log(
              JSON.stringify({
                success: true,
                message: 'No database exists yet. A new database will be created with the current schema on first use.',
                path: dbPath,
              })
            )
          } else if (!options.quiet) {
            console.log(
              colors.info(
                'No database exists yet. A new database will be created with the current schema on first use.'
              )
            )
          }
          return
        }

        // Load the database - this triggers migrations in SqliteStore.create
        const data = readFileSync(dbPath)
        const store = await SqliteStore.create(data)

        // Export the migrated database back to disk
        const { writeFileSync } = await import('fs')
        const exportedData = store.export()
        writeFileSync(dbPath, Buffer.from(exportedData))

        store.close()

        outputSuccess(`Database migrated successfully: ${dbPath}`, options, {
          path: dbPath,
          schemaVersion: SCHEMA_VERSION,
        })
      } catch (error) {
        outputError(error as Error, options)
      }
    })
}
