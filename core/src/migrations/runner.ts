import type { Database } from 'sql.js'
import {
  type Migration,
  type SchemaVersion,
  type MigrationResult,
  type MigrationOptions,
  type MigrationLogEntry,
  MigrationValidationError,
  MigrationSchema,
  SchemaVersionRowSchema,
} from './types.ts'

// Import all migrations
import { migration as migration001 } from './001-initial.ts'

/**
 * All available migrations in order.
 */
export const migrations: Migration[] = [migration001]

/**
 * Validate that migrations are properly ordered and sequential.
 * Throws MigrationValidationError if validation fails.
 */
export function validateMigrations(migrationList: Migration[]): void {
  if (migrationList.length === 0) {
    return
  }

  // Validate each migration definition with zod
  for (const migration of migrationList) {
    const result = MigrationSchema.safeParse(migration)
    if (!result.success) {
      throw new MigrationValidationError(
        `Invalid migration definition: ${result.error.message}`
      )
    }
  }

  // Check for unique versions
  const versions = migrationList.map((m) => m.version)
  const uniqueVersions = new Set(versions)
  if (uniqueVersions.size !== versions.length) {
    throw new MigrationValidationError('Duplicate migration versions found')
  }

  // Check versions are sorted ascending
  const sorted = [...versions].sort((a, b) => a - b)
  if (!versions.every((v, i) => v === sorted[i])) {
    throw new MigrationValidationError('Migrations must be in ascending version order')
  }

  // Check for gaps - versions must be sequential starting from 1
  for (let i = 0; i < sorted.length; i++) {
    const expected = i + 1
    if (sorted[i] !== expected) {
      throw new MigrationValidationError(
        `Migration version gap detected: expected version ${expected}, found ${sorted[i]}`
      )
    }
  }
}

/**
 * Get the current schema version from the database.
 * Returns 0 if schema_version table doesn't exist (new database).
 */
export function getCurrentVersion(db: Database): number {
  // Check if schema_version table exists
  const stmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
  )
  const tableExists = stmt.step()
  stmt.free()

  if (!tableExists) {
    return 0
  }

  // Get the latest version
  const versionStmt = db.prepare('SELECT MAX(version) as version FROM schema_version')
  if (versionStmt.step()) {
    const row = versionStmt.getAsObject()
    versionStmt.free()
    // MAX() returns null for empty table
    const version = row.version
    return typeof version === 'number' ? version : 0
  }
  versionStmt.free()
  return 0
}

/**
 * Get all applied schema versions.
 */
export function getAppliedVersions(db: Database): SchemaVersion[] {
  // Check if schema_version table exists
  const stmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
  )
  const tableExists = stmt.step()
  stmt.free()

  if (!tableExists) {
    return []
  }

  const versions: SchemaVersion[] = []
  const versionStmt = db.prepare(
    'SELECT version, applied_at, description FROM schema_version ORDER BY version'
  )
  while (versionStmt.step()) {
    const row = versionStmt.getAsObject()
    // Validate row with zod
    const result = SchemaVersionRowSchema.safeParse(row)
    if (result.success) {
      versions.push({
        version: result.data.version,
        appliedAt: result.data.applied_at,
        description: result.data.description,
      })
    }
  }
  versionStmt.free()
  return versions
}

/**
 * Get pending migrations that need to be applied.
 * @param db - The database instance
 * @param migrationList - The list of migrations to check
 * @param targetVersion - Optional target version to migrate to (defaults to latest)
 */
export function getPendingMigrations(
  db: Database,
  migrationList: Migration[],
  targetVersion?: number
): Migration[] {
  const currentVersion = getCurrentVersion(db)
  const maxVersion = targetVersion ?? getLatestVersion(migrationList)
  return migrationList.filter((m) => m.version > currentVersion && m.version <= maxVersion)
}

/**
 * Get the latest migration version available.
 * @param migrationList - The list of migrations to check
 */
export function getLatestVersion(migrationList: Migration[]): number {
  if (migrationList.length === 0) {
    return 0
  }
  return migrationList[migrationList.length - 1].version
}

/**
 * Run pending migrations up to a target version.
 * Returns a MigrationResult with details about what was applied.
 *
 * All migrations are wrapped in a single transaction - either all succeed or none are applied.
 * This includes the schema_version table creation to ensure atomicity.
 *
 * @param db - The database instance
 * @param migrationList - The list of migrations to apply
 * @param options - Optional migration options
 * @param options.to - Target version to migrate to (defaults to latest)
 *
 * @example
 * ```typescript
 * // Migrate to latest
 * runMigrations(db, migrations)
 *
 * // Migrate only to version 2
 * runMigrations(db, migrations, { to: 2 })
 *
 * // Staged migration
 * runMigrations(db, migrations, { to: 3 })
 * // ... do intermediate work ...
 * runMigrations(db, migrations, { to: 5 })
 * ```
 */
export function runMigrations(
  db: Database,
  migrationList: Migration[],
  options?: MigrationOptions
): MigrationResult {
  // Validate migrations before running
  validateMigrations(migrationList)

  const targetVersion = options?.to
  const pending = getPendingMigrations(db, migrationList, targetVersion)
  const startVersion = getCurrentVersion(db)

  // Validate target version if specified
  if (targetVersion !== undefined) {
    if (targetVersion <= startVersion) {
      throw new MigrationValidationError(
        `Target version ${targetVersion} must be greater than current version ${startVersion}`
      )
    }
    if (targetVersion > getLatestVersion(migrationList)) {
      throw new MigrationValidationError(
        `Target version ${targetVersion} exceeds latest available version ${getLatestVersion(migrationList)}`
      )
    }
  }

  if (pending.length === 0) {
    return {
      applied: 0,
      currentVersion: startVersion,
      latestVersion: getLatestVersion(migrationList),
      log: [],
    }
  }

  const log: MigrationLogEntry[] = []
  let failedMigration: Migration | null = null

  // Wrap everything in a transaction - all migrations succeed or all fail
  db.run('BEGIN TRANSACTION')
  try {
    // Create schema_version table if needed (inside transaction)
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL,
        description TEXT NOT NULL
      )
    `)

    // Apply each pending migration
    for (const migration of pending) {
      const entry: MigrationLogEntry = {
        version: migration.version,
        description: migration.description,
        startedAt: new Date().toISOString(),
        status: 'started',
      }
      log.push(entry)

      try {
        failedMigration = migration
        migration.up(db)

        // Record the migration
        const appliedAt = new Date().toISOString()
        db.run(
          'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
          [migration.version, appliedAt, migration.description]
        )

        entry.completedAt = appliedAt
        entry.status = 'completed'
        failedMigration = null
      } catch (error) {
        entry.completedAt = new Date().toISOString()
        entry.status = 'failed'
        entry.error = error instanceof Error ? error.message : String(error)
        throw error
      }
    }

    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    const context = failedMigration
      ? ` (failed at version ${failedMigration.version}: ${failedMigration.description})`
      : ''
    throw new Error(
      `Migration failed${context}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const finalVersion = getCurrentVersion(db)

  return {
    applied: pending.length,
    currentVersion: finalVersion,
    latestVersion: getLatestVersion(migrationList),
    log,
  }
}
