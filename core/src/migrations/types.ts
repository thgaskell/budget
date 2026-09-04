import { z } from 'zod'
import type { Database } from 'sql.js'

const CallableSchema = z.custom<(...args: never[]) => unknown>(
  (value) => typeof value === 'function',
  { message: 'Expected a function' }
)

/**
 * Zod schema for validating migration definitions.
 */
export const MigrationSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().min(1),
  up: CallableSchema,
  // Every schema version must be able to upgrade an exported file, not just a database
  upgradeJson: CallableSchema,
})

/**
 * One budget's slice of an export document, at an unspecified schema version.
 *
 * The entities are `unknown` on purpose: a document being upgraded is by definition not
 * yet in the current shape, so only the migration that knows a given version may say
 * what its rows look like. `StoreExportData` is assignable to this.
 */
export interface JsonBudgetData {
  budget: unknown
  accounts: unknown[]
  categoryGroups: unknown[]
  categories: unknown[]
  payees: unknown[]
  transactions: unknown[]
  targets: unknown[]
  assignments: unknown[]
  monthSummaries: unknown[]
}

/**
 * An exported JSON document at an unspecified schema version.
 */
export interface JsonExportData {
  version: string
  schemaVersion: number
  exportedAt: string
  budgets: JsonBudgetData[]
}

/**
 * Migration definition.
 *
 * Each migration has a version number, description, and the two halves of the same
 * schema change: `up` for a sql.js database and `upgradeJson` for an exported JSON
 * document. Both are required, so a new schema version cannot ship a SQL migration
 * that leaves exported files behind - omitting `upgradeJson` is a type error here and
 * a `MigrationValidationError` from `validateMigrations()`.
 */
export interface Migration {
  version: number
  description: string
  up(db: Database): void
  /**
   * Upgrade an export document from version `this.version - 1` to `this.version`.
   *
   * Must not mutate `data` - return new objects for whatever changed and share the
   * rest. The caller stamps `schemaVersion`, so a counterpart only handles content.
   */
  upgradeJson(data: JsonExportData): JsonExportData
}

/**
 * Zod schema for validating schema version records from the database.
 */
export const SchemaVersionSchema = z.object({
  version: z.number().int().positive(),
  appliedAt: z.string(),
  description: z.string(),
})

/**
 * Record of an applied migration.
 */
export type SchemaVersion = z.infer<typeof SchemaVersionSchema>

/**
 * Zod schema for validating database row when reading schema_version.
 */
export const SchemaVersionRowSchema = z.object({
  version: z.number().int().positive(),
  applied_at: z.string(),
  description: z.string(),
})

/**
 * Options for running migrations.
 */
export interface MigrationOptions {
  /**
   * Target version to migrate to.
   * If not specified, migrates to the latest version.
   * Must be greater than the current version.
   */
  to?: number
}

/**
 * Log entry for a migration operation.
 */
export interface MigrationLogEntry {
  version: number
  description: string
  startedAt: string
  completedAt?: string
  status: 'started' | 'completed' | 'failed'
  error?: string
}

/**
 * Result of running migrations.
 */
export interface MigrationResult {
  applied: number
  currentVersion: number
  latestVersion: number
  /** Transaction log of migration operations */
  log: MigrationLogEntry[]
}

/**
 * Error thrown when migrations are invalid.
 */
export class MigrationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationValidationError'
  }
}
