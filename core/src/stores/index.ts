export type { Store, TransactionQueryOptions, StoreExportData } from './types.ts'
export { MemoryStore } from './memory.ts'
export { SqliteStore } from './sqlite.ts'

// Re-export migration utilities for consumers
export type { Migration, SchemaVersion, MigrationResult, MigrationOptions, MigrationLogEntry } from '../migrations/index.ts'
export { MigrationValidationError } from '../migrations/index.ts'
export {
  migrations,
  validateMigrations,
  getCurrentVersion,
  getAppliedVersions,
  getPendingMigrations,
  runMigrations,
  getLatestVersion,
} from '../migrations/index.ts'
