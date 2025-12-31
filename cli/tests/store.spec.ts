import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Store original env
const originalEnv = { ...process.env }

describe('Store Module', () => {
  let testDir: string
  let testDbPath: string

  beforeEach(() => {
    // Reset modules to ensure fresh imports
    vi.resetModules()
    // Create unique test directory for each test
    testDir = join(tmpdir(), `budget-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    testDbPath = join(testDir, 'test.sqlite')
    // Clear relevant env vars
    delete process.env.BUDGET_DB_PATH
    delete process.env.BUDGET_CONFIG_DIR
  })

  afterEach(async () => {
    // Import and reset store
    try {
      const { resetStore, closeStore } = await import('../src/store.ts')
      closeStore()
      resetStore()
    } catch {
      // Ignore errors during cleanup
    }
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
    // Restore original env
    process.env = { ...originalEnv }
  })

  describe('initStore', () => {
    it('creates directory if it does not exist', async () => {
      const { initStore, resetStore } = await import('../src/store.ts')
      resetStore()

      expect(existsSync(testDir)).toBe(false)

      await initStore({ dbPath: testDbPath })

      expect(existsSync(testDir)).toBe(true)
    })

    it('creates database file when initializing new store', async () => {
      const { initStore, resetStore } = await import('../src/store.ts')
      resetStore()

      expect(existsSync(testDbPath)).toBe(false)

      await initStore({ dbPath: testDbPath })

      expect(existsSync(testDbPath)).toBe(true)
    })

    it('uses custom dbPath option when provided', async () => {
      const { initStore, resetStore } = await import('../src/store.ts')
      resetStore()

      const customPath = join(testDir, 'custom', 'path', 'budget.db')

      await initStore({ dbPath: customPath })

      expect(existsSync(customPath)).toBe(true)
    })

    it('returns the same store on subsequent calls', async () => {
      const { initStore, resetStore } = await import('../src/store.ts')
      resetStore()

      const store1 = await initStore({ dbPath: testDbPath })
      const store2 = await initStore({ dbPath: testDbPath })

      expect(store1).toBe(store2)
    })

    it('throws error when directory cannot be created', async () => {
      const { initStore, resetStore } = await import('../src/store.ts')
      resetStore()

      // Use a path that should fail (trying to create dir under a file)
      const invalidDir = '/dev/null/cannot/create'
      const invalidPath = join(invalidDir, 'test.db')

      await expect(initStore({ dbPath: invalidPath })).rejects.toThrow()
    })

    it('throws error when database file is not writable', async () => {
      const { initStore, resetStore } = await import('../src/store.ts')
      resetStore()

      // Try to write to a read-only location
      const readOnlyPath = '/usr/test.db'

      await expect(initStore({ dbPath: readOnlyPath })).rejects.toThrow()
    })
  })

  describe('getStore', () => {
    it('throws error if store not initialized', async () => {
      const { getStore, resetStore } = await import('../src/store.ts')
      resetStore()

      expect(() => getStore()).toThrow('Store not initialized')
    })

    it('returns store after initialization', async () => {
      const { initStore, getStore, resetStore } = await import('../src/store.ts')
      resetStore()

      await initStore({ dbPath: testDbPath })

      expect(() => getStore()).not.toThrow()
      expect(getStore()).toBeDefined()
    })
  })

  describe('resetStore', () => {
    it('clears the store so getStore throws again', async () => {
      const { initStore, getStore, resetStore } = await import('../src/store.ts')
      resetStore()

      await initStore({ dbPath: testDbPath })
      expect(() => getStore()).not.toThrow()

      resetStore()
      expect(() => getStore()).toThrow('Store not initialized')
    })
  })

  describe('saveStore and closeStore', () => {
    it('saves data to disk and can be loaded again', async () => {
      const { initStore, getStore, closeStore, resetStore } = await import('../src/store.ts')
      const { createBudget } = await import('@budget/core')
      resetStore()

      // Initialize and add data
      await initStore({ dbPath: testDbPath })
      const store = getStore()
      const budget = createBudget({ name: 'Test Budget' })
      store.saveBudget(budget)

      // Close and reset
      closeStore()
      resetStore()

      // Re-initialize from the saved file
      const reopenedStore = await initStore({ dbPath: testDbPath })
      const loadedBudget = reopenedStore.getBudget(budget.id)

      expect(loadedBudget).not.toBeNull()
      expect(loadedBudget?.name).toBe('Test Budget')
    })
  })
})
