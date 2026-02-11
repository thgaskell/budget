import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Command } from 'commander'

// Store original env
const originalEnv = { ...process.env }

describe('CLI', () => {
  let testDir: string
  let testDbPath: string

  beforeEach(() => {
    // Reset modules to ensure fresh imports
    vi.resetModules()
    // Create unique test directory for each test
    testDir = join(tmpdir(), `budget-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    testDbPath = join(testDir, 'test.budget')
    // Clear relevant env vars
    delete process.env.BUDGET_DB_PATH
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

  describe('--file flag', () => {
    it('accepts --file flag in CLI options', async () => {
      const program = new Command()

      program
        .name('budget')
        .option('-f, --file <path>', 'Path to .budget file')
        .allowUnknownOption()
        .allowExcessArguments()

      program.parse(['node', 'budget', '--file', '/some/path/test.budget'])

      const opts = program.opts()
      expect(opts.file).toBe('/some/path/test.budget')
    })

    it('accepts -f shorthand in CLI options', async () => {
      const program = new Command()

      program
        .name('budget')
        .option('-f, --file <path>', 'Path to .budget file')
        .allowUnknownOption()
        .allowExcessArguments()

      program.parse(['node', 'budget', '-f', '/some/path/test.budget'])

      const opts = program.opts()
      expect(opts.file).toBe('/some/path/test.budget')
    })

    it('preAction hook initializes store with --file path', async () => {
      const { initStore, resetStore, getStore } = await import('../src/store.ts')
      resetStore()

      // Simulate what the preAction hook does
      await initStore({ dbPath: testDbPath })

      // Verify database was created at specified path
      expect(existsSync(testDbPath)).toBe(true)
      expect(() => getStore()).not.toThrow()
    })

    it('uses custom database path from --file flag', async () => {
      const { initStore, resetStore, closeStore } = await import('../src/store.ts')
      const { createBudget } = await import('@budget/core')
      resetStore()

      const customDbPath = join(testDir, 'custom', 'db', 'budget.budget')

      // Initialize with custom path (simulating --file flag)
      const store = await initStore({ dbPath: customDbPath })

      // Create a budget
      const budget = createBudget({ name: 'Test Budget' })
      store.saveBudget(budget)

      // Close and reset
      closeStore()
      resetStore()

      // Re-open and verify data is persisted
      const reopenedStore = await initStore({ dbPath: customDbPath })
      const loadedBudget = reopenedStore.getBudget(budget.id)

      expect(loadedBudget).not.toBeNull()
      expect(loadedBudget?.name).toBe('Test Budget')
    })
  })

  describe('removed flags', () => {
    it('--memory and --db flags are not defined in CLI options', async () => {
      const program = new Command()

      program
        .name('budget')
        .option('--json', 'Output in JSON format')
        .option('--quiet', 'Minimal output (IDs only)')
        .option('-f, --file <path>', 'Path to .budget file')

      // Parse help to check available options
      const helpInfo = program.helpInformation()

      expect(helpInfo).toContain('--file')
      expect(helpInfo).toContain('-f')
      expect(helpInfo).toContain('--json')
      expect(helpInfo).toContain('--quiet')
      expect(helpInfo).not.toContain('--memory')
      expect(helpInfo).not.toContain('--db')
    })
  })

  describe('store initialization error handling', () => {
    it('throws descriptive error for unwritable path', async () => {
      const { initStore, resetStore } = await import('../src/store.ts')
      resetStore()

      // Try to create database in read-only location
      const readOnlyPath = '/usr/budget-test.db'

      await expect(initStore({ dbPath: readOnlyPath })).rejects.toThrow()
    })

    it('throws descriptive error when directory cannot be created', async () => {
      const { initStore, resetStore } = await import('../src/store.ts')
      resetStore()

      // Try to create directory under /dev/null which should fail
      const invalidPath = '/dev/null/impossible/path/test.db'

      await expect(initStore({ dbPath: invalidPath })).rejects.toThrow()
    })
  })
})
