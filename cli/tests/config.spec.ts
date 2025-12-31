import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

// Store original env
const originalEnv = { ...process.env }

// Temp directory for testing file-based config
const TEST_CONFIG_DIR = '/tmp/budget-config-test-' + Date.now()

describe('Config Module', () => {
  beforeEach(() => {
    // Reset modules to ensure fresh imports
    vi.resetModules()
    // Clear relevant env vars
    delete process.env.BUDGET_DB_PATH
    delete process.env.BUDGET_CONFIG_DIR
  })

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv }
  })

  describe('getDefaultDbPath', () => {
    it('returns $HOME/.budget/budget.sqlite by default', async () => {
      const { getDefaultDbPath } = await import('../src/config.ts')
      const expected = join(homedir(), '.budget', 'budget.sqlite')
      expect(getDefaultDbPath()).toBe(expected)
    })

    it('returns BUDGET_DB_PATH env var when set', async () => {
      process.env.BUDGET_DB_PATH = '/custom/path/my.db'
      const { getDefaultDbPath } = await import('../src/config.ts')
      expect(getDefaultDbPath()).toBe('/custom/path/my.db')
    })

    it('respects BUDGET_DB_PATH over default path', async () => {
      const customPath = '/tmp/test-budget.sqlite'
      process.env.BUDGET_DB_PATH = customPath
      const { getDefaultDbPath } = await import('../src/config.ts')
      expect(getDefaultDbPath()).toBe(customPath)
      expect(getDefaultDbPath()).not.toContain('.budget')
    })
  })

  describe('getConfigDir', () => {
    it('returns $HOME/.config/budget by default', async () => {
      const { getConfigDir } = await import('../src/config.ts')
      const expected = join(homedir(), '.config', 'budget')
      expect(getConfigDir()).toBe(expected)
    })

    it('returns BUDGET_CONFIG_DIR env var when set', async () => {
      process.env.BUDGET_CONFIG_DIR = '/custom/config/dir'
      const { getConfigDir } = await import('../src/config.ts')
      expect(getConfigDir()).toBe('/custom/config/dir')
    })
  })

  describe('getConfigPath', () => {
    it('returns config.json in config directory', async () => {
      const { getConfigPath, getConfigDir } = await import('../src/config.ts')
      expect(getConfigPath()).toBe(join(getConfigDir(), 'config.json'))
    })
  })

  describe('loadConfig', () => {
    it('returns default config with dbPath when no config file exists', async () => {
      // Use a non-existent config directory
      process.env.BUDGET_CONFIG_DIR = '/nonexistent/path/that/does/not/exist'
      const { loadConfig, getDefaultDbPath } = await import('../src/config.ts')
      const config = loadConfig()
      expect(config.defaultStore).toBe('sqlite')
      expect(config.dbPath).toBe(getDefaultDbPath())
    })
  })

  describe('database-specific config isolation', () => {
    beforeEach(() => {
      // Create test config directory
      if (!existsSync(TEST_CONFIG_DIR)) {
        mkdirSync(TEST_CONFIG_DIR, { recursive: true })
      }
      process.env.BUDGET_CONFIG_DIR = TEST_CONFIG_DIR
    })

    afterEach(() => {
      // Clean up test config directory
      if (existsSync(TEST_CONFIG_DIR)) {
        rmSync(TEST_CONFIG_DIR, { recursive: true, force: true })
      }
    })

    it('stores activeBudgetId per database path', async () => {
      const {
        setCurrentDbPath,
        resetCurrentDbPath,
        setActiveBudgetId,
        getActiveBudgetId,
      } = await import('../src/config.ts')

      const db1 = '/tmp/db1.sqlite'
      const db2 = '/tmp/db2.sqlite'
      const budget1 = 'budget-uuid-1'
      const budget2 = 'budget-uuid-2'

      // Set active budget for db1
      setCurrentDbPath(db1)
      setActiveBudgetId(budget1)

      // Set active budget for db2
      setCurrentDbPath(db2)
      setActiveBudgetId(budget2)

      // Verify db1 has its own active budget
      setCurrentDbPath(db1)
      expect(getActiveBudgetId()).toBe(budget1)

      // Verify db2 has its own active budget
      setCurrentDbPath(db2)
      expect(getActiveBudgetId()).toBe(budget2)

      resetCurrentDbPath()
    })

    it('different databases have independent active budgets', async () => {
      const {
        setCurrentDbPath,
        resetCurrentDbPath,
        setActiveBudgetId,
        getActiveBudgetId,
        clearActiveBudgetId,
      } = await import('../src/config.ts')

      const db1 = '/tmp/isolation-test-db1.sqlite'
      const db2 = '/tmp/isolation-test-db2.sqlite'

      // Set budget in db1
      setCurrentDbPath(db1)
      setActiveBudgetId('budget-for-db1')

      // Check db2 has no active budget
      setCurrentDbPath(db2)
      expect(getActiveBudgetId()).toBeUndefined()

      // Set budget in db2
      setActiveBudgetId('budget-for-db2')
      expect(getActiveBudgetId()).toBe('budget-for-db2')

      // Clear db2, verify db1 is unaffected
      clearActiveBudgetId()
      expect(getActiveBudgetId()).toBeUndefined()

      setCurrentDbPath(db1)
      expect(getActiveBudgetId()).toBe('budget-for-db1')

      resetCurrentDbPath()
    })

    it('accepts explicit dbPath parameter', async () => {
      const {
        resetCurrentDbPath,
        setActiveBudgetId,
        getActiveBudgetId,
      } = await import('../src/config.ts')

      const db1 = '/tmp/explicit-db1.sqlite'
      const db2 = '/tmp/explicit-db2.sqlite'

      // Set budget using explicit path (no currentDbPath set)
      resetCurrentDbPath()
      setActiveBudgetId('explicit-budget-1', db1)
      setActiveBudgetId('explicit-budget-2', db2)

      // Get budget using explicit path
      expect(getActiveBudgetId(db1)).toBe('explicit-budget-1')
      expect(getActiveBudgetId(db2)).toBe('explicit-budget-2')
    })

    it('normalizes relative paths to absolute paths', async () => {
      const {
        setCurrentDbPath,
        resetCurrentDbPath,
        setActiveBudgetId,
        getActiveBudgetId,
      } = await import('../src/config.ts')

      // Use relative path
      setCurrentDbPath('./relative/path.sqlite')
      setActiveBudgetId('relative-budget')

      // Should be able to retrieve with resolved absolute path
      const absolutePath = resolve('./relative/path.sqlite')
      expect(getActiveBudgetId(absolutePath)).toBe('relative-budget')

      resetCurrentDbPath()
    })

    it('getCurrentDbPath returns the set path', async () => {
      const {
        setCurrentDbPath,
        getCurrentDbPath,
        resetCurrentDbPath,
      } = await import('../src/config.ts')

      const testPath = '/tmp/test-db-path.sqlite'
      setCurrentDbPath(testPath)
      expect(getCurrentDbPath()).toBe(resolve(testPath))

      resetCurrentDbPath()
      expect(getCurrentDbPath()).toBeNull()
    })
  })
})
