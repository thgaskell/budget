import { z } from 'zod'
import type { Database } from 'sql.js'

/**
 * Zod schema for validating migration definitions.
 */
export const MigrationSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().min(1),
})

/**
 * Migration definition.
 * Each migration has a version number, description, and up function.
 */
export interface Migration {
  version: number
  description: string
  up(db: Database): void
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
