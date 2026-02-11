import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const TEST_CONFIG_DIR = '/tmp/budget-config-test'

// Store original env
const originalEnv = { ...process.env }

describe('Config Module', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.BUDGET_CONFIG_DIR = TEST_CONFIG_DIR
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true })
    }
  })

  describe('getDefaultCurrency', () => {
    it('returns USD when no config exists', async () => {
      const { getDefaultCurrency } = await import('../src/config.ts')
      expect(getDefaultCurrency()).toBe('USD')
    })

    it('returns configured currency', async () => {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true })
      writeFileSync(
        join(TEST_CONFIG_DIR, 'config.json'),
        JSON.stringify({ defaultCurrency: 'EUR' })
      )
      const { getDefaultCurrency } = await import('../src/config.ts')
      expect(getDefaultCurrency()).toBe('EUR')
    })
  })

  describe('setDefaultCurrency', () => {
    it('persists currency to config file', async () => {
      const { setDefaultCurrency, getDefaultCurrency } = await import('../src/config.ts')
      setDefaultCurrency('GBP')
      expect(getDefaultCurrency()).toBe('GBP')
    })
  })
})
