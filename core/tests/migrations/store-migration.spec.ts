import { describe, it, expect } from 'vitest'
import { SqliteStore, MemoryStore, getLatestVersion, migrations } from '../../src/stores/index.ts'

/**
 * Helper to dump store state for inspection.
 */
function dumpStoreState(
  store: SqliteStore | MemoryStore,
  label: string
): { schemaVersion: number; budgetCount: number } {
  const budgets = store.listBudgets()
  const schemaVersion = store.getSchemaVersion()

  console.log(`\n=== ${label} ===`)
  console.log(`Schema Version: ${schemaVersion}`)
  console.log(`Budgets: ${budgets.length}`)

  for (const budget of budgets) {
    console.log(`  - "${budget.name}" (id: ${budget.id}, currency: ${budget.currency})`)
  }

  return { schemaVersion, budgetCount: budgets.length }
}

describe('Store Migration Validation', () => {
  describe('SqliteStore - Full Migration Flow', () => {
    it('Step 1-4: Create, dump, migrate, dump', async () => {
      console.log('\n' + '='.repeat(60))
      console.log('SqliteStore Migration Flow')
      console.log('='.repeat(60))

      // STEP 1: Create a store and explicitly migrate
      console.log('\n📦 STEP 1: Create SqliteStore')
      const store1 = await SqliteStore.create()

      // Check version BEFORE migration
      console.log(`\n   Schema version before migrate(): ${store1.getSchemaVersion()}`)
      console.log(`   Needs migration: ${store1.needsMigration()}`)
      console.log(`   Pending migrations: ${store1.getPendingMigrations().length}`)

      // Explicitly migrate
      console.log('\n   Calling store.migrate()...')
      const result = store1.migrate()
      console.log(`   Applied ${result.applied} migrations`)

      // Now add data
      store1.saveBudget({ id: 'budget-001', name: 'Personal Budget', currency: 'USD' })
      store1.saveBudget({ id: 'budget-002', name: 'Business Budget', currency: 'EUR' })

      store1.saveAccount({
        id: 'acc-001',
        budgetId: 'budget-001',
        name: 'Checking Account',
        type: 'checking',
        onBudget: true,
      })

      // STEP 2: Dump the initial store
      console.log('\n📋 STEP 2: Dump store state after migration')
      const initialState = dumpStoreState(store1, 'SqliteStore - AFTER MIGRATION')

      // Show applied versions
      console.log('\nApplied Migrations:')
      for (const v of store1.getAppliedVersions()) {
        console.log(`  ✓ v${v.version}: ${v.description}`)
      }

      expect(initialState.schemaVersion).toBe(1)
      expect(initialState.budgetCount).toBe(2)

      // Export the database binary
      const exportedData = store1.export()
      console.log(`\n💾 Exported database: ${exportedData.length} bytes`)
      store1.close()

      // STEP 3: Load existing data (already migrated)
      console.log('\n🔄 STEP 3: Load exported data into new SqliteStore')

      const store2 = await SqliteStore.create(exportedData)

      console.log(`\n   Schema version: ${store2.getSchemaVersion()}`)
      console.log(`   Needs migration: ${store2.needsMigration()}`)

      // No migration needed - already at latest
      expect(store2.needsMigration()).toBe(false)

      // STEP 4: Dump the loaded store
      console.log('\n📋 STEP 4: Dump loaded store state')
      const loadedState = dumpStoreState(store2, 'SqliteStore - AFTER RELOAD')

      console.log('\nApplied Migrations:')
      for (const v of store2.getAppliedVersions()) {
        console.log(`  ✓ v${v.version}: ${v.description}`)
      }

      // Verify data survived
      expect(loadedState.schemaVersion).toBe(1)
      expect(loadedState.budgetCount).toBe(2)

      const budget1 = store2.getBudget('budget-001')
      expect(budget1?.name).toBe('Personal Budget')

      store2.close()

      console.log('\n✅ SqliteStore migration flow complete')
    })

    it('demonstrates createUnmigrated for manual migration control', async () => {
      console.log('\n' + '='.repeat(60))
      console.log('SqliteStore createUnmigrated Flow')
      console.log('='.repeat(60))

      // Create store using createUnmigrated (no auto-migration)
      console.log('\n📦 Creating SqliteStore with createUnmigrated...')
      const store = await SqliteStore.createUnmigrated()

      console.log(`\n📋 BEFORE migrate():`)
      console.log(`   Schema Version: ${store.getSchemaVersion()}`)
      console.log(`   Latest Available: ${store.getLatestSchemaVersion()}`)
      console.log(`   Needs Migration: ${store.needsMigration()}`)
      console.log(`   Pending Migrations: ${store.getPendingMigrations().length}`)

      for (const m of store.getPendingMigrations()) {
        console.log(`     → v${m.version}: ${m.description}`)
      }

      expect(store.getSchemaVersion()).toBe(0)
      expect(store.needsMigration()).toBe(true)
      expect(store.getPendingMigrations().length).toBe(1)

      // Explicitly run migration
      console.log(`\n⚡ Calling store.migrate()...`)
      const result = store.migrate()
      console.log(`   Applied ${result.applied} migration(s)`)

      // Check state AFTER migration
      console.log(`\n📋 AFTER migrate():`)
      console.log(`   Schema Version: ${store.getSchemaVersion()}`)
      console.log(`   Needs Migration: ${store.needsMigration()}`)

      console.log(`\nApplied Migrations:`)
      for (const v of store.getAppliedVersions()) {
        console.log(`   ✓ v${v.version}: ${v.description}`)
      }

      expect(store.getSchemaVersion()).toBe(1)
      expect(store.needsMigration()).toBe(false)

      // Add some data
      store.saveBudget({ id: 'test-budget', name: 'Test Budget', currency: 'USD' })
      const budget = store.getBudget('test-budget')
      expect(budget?.name).toBe('Test Budget')

      store.close()

      console.log('\n✅ createUnmigrated flow complete')
    })
  })

  describe('MemoryStore - Schema Version', () => {
    it('Step 1-4: Create, dump, (no migration needed), dump', () => {
      console.log('\n' + '='.repeat(60))
      console.log('MemoryStore Schema Version')
      console.log('='.repeat(60))

      // STEP 1: Create a memory store with data
      console.log('\n📦 STEP 1: Create MemoryStore with data')
      const store = new MemoryStore()

      store.saveBudget({ id: 'mem-budget-001', name: 'Memory Budget', currency: 'GBP' })

      // STEP 2: Dump the initial store
      console.log('\n📋 STEP 2: Dump initial store state')
      const initialState = dumpStoreState(store, 'MemoryStore - INITIAL STATE')

      console.log(`\nNote: MemoryStore always uses latest schema (v${getLatestVersion(migrations)})`)
      console.log('      No migrations needed - data is ephemeral')

      expect(initialState.schemaVersion).toBe(getLatestVersion(migrations))

      // STEP 3: MemoryStore doesn't persist, so "migration" is N/A
      console.log('\n🔄 STEP 3: Migration not applicable')
      console.log('   MemoryStore is session-scoped and always current')

      // STEP 4: Dump again (same state)
      console.log('\n📋 STEP 4: Dump store state')
      const finalState = dumpStoreState(store, 'MemoryStore - FINAL STATE')

      expect(finalState.schemaVersion).toBe(getLatestVersion(migrations))

      console.log('\n✅ MemoryStore schema version check complete')
    })
  })

  describe('Comparison Summary', () => {
    it('shows schema version behavior for both store types', async () => {
      console.log('\n' + '='.repeat(60))
      console.log('Store Type Comparison')
      console.log('='.repeat(60))

      // Create SqliteStore and migrate
      const sqliteStore = await SqliteStore.create()
      sqliteStore.migrate()

      const memoryStore = new MemoryStore()

      // Add identical data to both
      const budget = { id: 'test-budget', name: 'Test Budget', currency: 'USD' }
      sqliteStore.saveBudget(budget)
      memoryStore.saveBudget(budget)

      console.log('\n┌─────────────────┬─────────────────┬─────────────────┐')
      console.log('│ Property        │ SqliteStore     │ MemoryStore     │')
      console.log('├─────────────────┼─────────────────┼─────────────────┤')
      console.log(`│ Schema Version  │ ${String(sqliteStore.getSchemaVersion()).padEnd(15)} │ ${String(memoryStore.getSchemaVersion()).padEnd(15)} │`)
      console.log(`│ Persists Data   │ ${'Yes'.padEnd(15)} │ ${'No'.padEnd(15)} │`)
      console.log(`│ Runs Migrations │ ${'Explicit'.padEnd(15)} │ ${'N/A'.padEnd(15)} │`)
      console.log(`│ Tracks History  │ ${'Yes'.padEnd(15)} │ ${'No'.padEnd(15)} │`)
      console.log('└─────────────────┴─────────────────┴─────────────────┘')

      expect(sqliteStore.getSchemaVersion()).toBe(1)
      expect(memoryStore.getSchemaVersion()).toBe(1)

      sqliteStore.close()
    })
  })
})
