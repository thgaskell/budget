import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'

/**
 * Per-database configuration.
 */
export interface DatabaseConfig {
  /** Active budget ID for this database */
  activeBudgetId?: string
}

/**
 * CLI configuration interface.
 */
export interface Config {
  /** Default store type */
  defaultStore: 'memory' | 'sqlite'
  /** Path to SQLite database file */
  dbPath?: string
  /** Per-database configuration keyed by absolute path */
  databases?: Record<string, DatabaseConfig>
  /** @deprecated Use databases[path].activeBudgetId instead - kept for migration */
  activeBudgetId?: string
}

const DEFAULT_CONFIG: Config = {
  defaultStore: 'sqlite',
}

/** Current database path context for the CLI session */
let currentDbPath: string | null = null

/**
 * Set the current database path context.
 * This should be called after initStore to establish the database context.
 */
export function setCurrentDbPath(dbPath: string): void {
  currentDbPath = resolve(dbPath)
}

/**
 * Get the current database path context.
 */
export function getCurrentDbPath(): string | null {
  return currentDbPath
}

/**
 * Reset the current database path (for testing).
 */
export function resetCurrentDbPath(): void {
  currentDbPath = null
}

/**
 * Get the config directory path.
 */
export function getConfigDir(): string {
  const configDir = process.env.BUDGET_CONFIG_DIR || join(homedir(), '.config', 'budget')
  return configDir
}

/**
 * Get the config file path.
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

/**
 * Get the default database path.
 * Uses ~/.budget/budget.sqlite for persistent storage.
 */
export function getDefaultDbPath(): string {
  return process.env.BUDGET_DB_PATH || join(homedir(), '.budget', 'budget.sqlite')
}

/**
 * Load configuration from disk.
 */
export function loadConfig(): Config {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG, dbPath: getDefaultDbPath() }
  }

  try {
    const content = readFileSync(configPath, 'utf-8')
    const loaded = JSON.parse(content) as Partial<Config>
    return {
      ...DEFAULT_CONFIG,
      dbPath: getDefaultDbPath(),
      ...loaded,
    }
  } catch {
    return { ...DEFAULT_CONFIG, dbPath: getDefaultDbPath() }
  }
}

/**
 * Save configuration to disk.
 */
export function saveConfig(config: Config): void {
  const configPath = getConfigPath()
  const configDir = dirname(configPath)

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2))
}

/**
 * Normalize a database path to an absolute path for config storage.
 */
function normalizeDbPath(dbPath?: string): string {
  const path = dbPath || currentDbPath || getDefaultDbPath()
  return resolve(path)
}

/**
 * Get the active budget ID from config for the current or specified database.
 */
export function getActiveBudgetId(dbPath?: string): string | undefined {
  const config = loadConfig()
  const normalizedPath = normalizeDbPath(dbPath)

  // Check database-specific config first
  if (config.databases?.[normalizedPath]?.activeBudgetId) {
    return config.databases[normalizedPath].activeBudgetId
  }

  // Fall back to legacy global activeBudgetId for default database only
  // This provides backward compatibility during migration
  const defaultPath = resolve(getDefaultDbPath())
  if (normalizedPath === defaultPath && config.activeBudgetId) {
    return config.activeBudgetId
  }

  return undefined
}

/**
 * Set the active budget ID in config for the current or specified database.
 */
export function setActiveBudgetId(budgetId: string, dbPath?: string): void {
  const config = loadConfig()
  const normalizedPath = normalizeDbPath(dbPath)

  // Initialize databases object if needed
  if (!config.databases) {
    config.databases = {}
  }

  // Set the active budget for this database
  config.databases[normalizedPath] = {
    ...config.databases[normalizedPath],
    activeBudgetId: budgetId,
  }

  // Migrate legacy activeBudgetId to database-specific storage
  const defaultPath = resolve(getDefaultDbPath())
  if (normalizedPath === defaultPath && config.activeBudgetId) {
    delete config.activeBudgetId
  }

  saveConfig(config)
}

/**
 * Clear the active budget ID from config for the current or specified database.
 */
export function clearActiveBudgetId(dbPath?: string): void {
  const config = loadConfig()
  const normalizedPath = normalizeDbPath(dbPath)

  // Clear database-specific config
  if (config.databases?.[normalizedPath]) {
    delete config.databases[normalizedPath].activeBudgetId
    // Remove empty database entry
    if (Object.keys(config.databases[normalizedPath]).length === 0) {
      delete config.databases[normalizedPath]
    }
  }

  // Also clear legacy activeBudgetId for default database
  const defaultPath = resolve(getDefaultDbPath())
  if (normalizedPath === defaultPath && config.activeBudgetId) {
    delete config.activeBudgetId
  }

  saveConfig(config)
}

/**
 * Require an active budget ID, throwing if not set.
 */
export function requireActiveBudgetId(dbPath?: string): string {
  const budgetId = getActiveBudgetId(dbPath)
  if (!budgetId) {
    throw new Error('No active budget. Use "budget use <id|name>" to select a budget.')
  }
  return budgetId
}
