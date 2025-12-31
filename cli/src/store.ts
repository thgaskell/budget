import { SqliteStore, type Store } from '@budget/core'
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { getDefaultDbPath, loadConfig, setCurrentDbPath, resetCurrentDbPath } from './config.ts'

let store: Store | null = null
let dbPath: string | null = null

/**
 * Options for initializing the store.
 */
export interface StoreOptions {
  dbPath?: string
}

/**
 * Validate that a path is writable (either file exists and is writable, or directory is writable).
 */
function validateDbPath(path: string): void {
  const dir = dirname(path)

  if (existsSync(path)) {
    // File exists - check if we can write to it
    try {
      accessSync(path, constants.W_OK)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Cannot write to database at ${path}: ${message}`)
    }
  } else if (existsSync(dir)) {
    // File doesn't exist but directory does - check if directory is writable
    try {
      accessSync(dir, constants.W_OK)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Cannot create database at ${path}: ${message}`)
    }
  }
  // If neither exists, we'll try to create the directory and let that fail with a meaningful error
}

/**
 * Initialize the store based on options.
 * Should be called once at CLI startup.
 */
export async function initStore(options: StoreOptions = {}): Promise<Store> {
  if (store) {
    return store
  }

  const config = loadConfig()
  dbPath = options.dbPath || config.dbPath || getDefaultDbPath()

  // Validate path is writable before proceeding
  validateDbPath(dbPath)

  // Set the current database path context for config isolation
  setCurrentDbPath(dbPath)

  // Ensure directory exists
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Cannot create directory for database at ${dbPath}: ${message}`)
    }
  }

  // Load existing data if file exists, or create new database
  if (existsSync(dbPath)) {
    let data: Buffer
    try {
      data = readFileSync(dbPath)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Cannot read database file at ${dbPath}: ${message}`)
    }

    try {
      store = await SqliteStore.create(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Database file at ${dbPath} is corrupted or invalid: ${message}`)
    }
  } else {
    // Create new empty database and save it immediately
    try {
      store = await SqliteStore.create()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Cannot create new database: ${message}`)
    }

    // Save the empty database to disk immediately
    try {
      const sqliteStore = store as SqliteStore
      const data = sqliteStore.export()
      writeFileSync(dbPath, Buffer.from(data))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Cannot save database to ${dbPath}: ${message}`)
    }
  }

  return store
}

/**
 * Get the current store.
 * Must call initStore first.
 */
export function getStore(): Store {
  if (!store) {
    throw new Error('Store not initialized. Call initStore() first.')
  }
  return store
}

/**
 * Save the store to disk.
 */
export function saveStore(): void {
  if (store && dbPath) {
    const sqliteStore = store as SqliteStore
    const data = sqliteStore.export()
    writeFileSync(dbPath, Buffer.from(data))
  }
}

/**
 * Close and save the store.
 */
export function closeStore(): void {
  saveStore()

  if (store) {
    const sqliteStore = store as SqliteStore
    sqliteStore.close()
  }

  store = null
}

/**
 * Reset the store (for testing).
 */
export function resetStore(): void {
  store = null
  dbPath = null
  resetCurrentDbPath()
}

/**
 * Set a custom store (for testing).
 */
export function setStore(newStore: Store): void {
  store = newStore
}
