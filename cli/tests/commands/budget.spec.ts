import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryStore, createBudget } from '@budget/core'
import { setStore, resetStore } from '../../src/store.ts'
import * as configModule from '../../src/config.ts'

// Mock the config module
vi.mock('../../src/config.ts', async () => {
  let activeBudgetId: string | undefined
  let currentDbPath: string | null = null

  return {
    loadConfig: vi.fn(() => ({
      defaultStore: 'memory' as const,
    })),
    saveConfig: vi.fn(),
    getActiveBudgetId: vi.fn(() => activeBudgetId),
    setActiveBudgetId: vi.fn((id: string) => {
      activeBudgetId = id
    }),
    clearActiveBudgetId: vi.fn(() => {
      activeBudgetId = undefined
    }),
    requireActiveBudgetId: vi.fn(() => {
      if (!activeBudgetId) {
        throw new Error('No active budget')
      }
      return activeBudgetId
    }),
    getDefaultDbPath: vi.fn(() => '/tmp/budget.db'),
    getConfigDir: vi.fn(() => '/tmp/.config/budget'),
    getConfigPath: vi.fn(() => '/tmp/.config/budget/config.json'),
    setCurrentDbPath: vi.fn((path: string) => {
      currentDbPath = path
    }),
    getCurrentDbPath: vi.fn(() => currentDbPath),
    resetCurrentDbPath: vi.fn(() => {
      currentDbPath = null
    }),
  }
})

describe('Budget Commands', () => {
  let store: MemoryStore

  beforeEach(() => {
    store = new MemoryStore()
    setStore(store)
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetStore()
  })

  describe('budget create', () => {
    it('creates a new budget', () => {
      const budget = createBudget({ name: 'Test Budget' })
      store.saveBudget(budget)

      expect(store.getBudget(budget.id)).not.toBeNull()
      expect(store.getBudget(budget.id)?.name).toBe('Test Budget')
    })

    it('creates budget with custom currency', () => {
      const budget = createBudget({ name: 'Euro Budget', currency: 'EUR' })
      store.saveBudget(budget)

      expect(store.getBudget(budget.id)?.currency).toBe('EUR')
    })
  })

  describe('budget list', () => {
    it('returns empty list when no budgets', () => {
      expect(store.listBudgets()).toHaveLength(0)
    })

    it('lists all budgets', () => {
      store.saveBudget(createBudget({ name: 'Budget 1' }))
      store.saveBudget(createBudget({ name: 'Budget 2' }))

      const budgets = store.listBudgets()
      expect(budgets).toHaveLength(2)
    })
  })

  describe('budget use', () => {
    it('sets active budget by ID', () => {
      const budget = createBudget({ name: 'My Budget' })
      store.saveBudget(budget)

      // Simulate setting active budget
      configModule.setActiveBudgetId(budget.id)
      expect(configModule.getActiveBudgetId()).toBe(budget.id)
    })
  })

  describe('budget show', () => {
    it('returns budget details', () => {
      const budget = createBudget({ name: 'My Budget', currency: 'USD' })
      store.saveBudget(budget)

      const retrieved = store.getBudget(budget.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved?.name).toBe('My Budget')
      expect(retrieved?.currency).toBe('USD')
    })
  })

  describe('budget delete', () => {
    it('deletes a budget', () => {
      const budget = createBudget({ name: 'Delete Me' })
      store.saveBudget(budget)

      expect(store.getBudget(budget.id)).not.toBeNull()

      store.deleteBudget(budget.id)

      expect(store.getBudget(budget.id)).toBeNull()
    })
  })
})
