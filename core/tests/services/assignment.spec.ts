import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '../../src/stores/memory.ts'
import { SqliteStore } from '../../src/stores/sqlite.ts'
import type { Store } from '../../src/stores/types.ts'
import { createBudget } from '../../src/schemas/budget.ts'
import { createCategoryGroup } from '../../src/schemas/category-group.ts'
import { createCategory } from '../../src/schemas/category.ts'
import {
  assignToCategory,
  moveBetweenCategories,
  clearCategoryAssignments,
} from '../../src/services/assignment.ts'

describe.each([
  ['MemoryStore', async () => new MemoryStore()],
  ['SqliteStore', async () => {
    const store = await SqliteStore.create()
    store.migrate()
    return store
  }],
])('Assignment Service with %s', (_, createStore) => {
  let store: Store
  let budget: ReturnType<typeof createBudget>
  let group: ReturnType<typeof createCategoryGroup>
  let category1: ReturnType<typeof createCategory>
  let category2: ReturnType<typeof createCategory>

  beforeEach(async () => {
    store = await createStore()
    budget = createBudget({ name: 'Test' })
    group = createCategoryGroup({ budgetId: budget.id, name: 'Needs' })
    category1 = createCategory({ groupId: group.id, name: 'Groceries' })
    category2 = createCategory({ groupId: group.id, name: 'Rent' })

    store.saveBudget(budget)
    store.saveCategoryGroup(group)
    store.saveCategory(category1)
    store.saveCategory(category2)
  })

  describe('assignToCategory', () => {
    it('creates a new assignment', () => {
      const assignment = assignToCategory(store, category1.id, '2024-01', 50000)

      expect(assignment.categoryId).toBe(category1.id)
      expect(assignment.month).toBe('2024-01')
      expect(assignment.amount).toBe(50000)
      expect(store.getAssignment(category1.id, '2024-01')).toEqual(assignment)
    })

    it('updates existing assignment amount', () => {
      assignToCategory(store, category1.id, '2024-01', 50000)
      const updated = assignToCategory(store, category1.id, '2024-01', 75000)

      expect(updated.amount).toBe(75000)
      expect(store.getAssignment(category1.id, '2024-01')?.amount).toBe(75000)
    })

    it('preserves id when updating', () => {
      const original = assignToCategory(store, category1.id, '2024-01', 50000)
      const updated = assignToCategory(store, category1.id, '2024-01', 75000)

      expect(updated.id).toBe(original.id)
    })

    it('handles zero amount', () => {
      const assignment = assignToCategory(store, category1.id, '2024-01', 0)

      expect(assignment.amount).toBe(0)
    })

    it('handles negative amount (unassign)', () => {
      // First assign some money
      assignToCategory(store, category1.id, '2024-01', 50000)

      // Then create a negative assignment (reduce to below zero - indicates moving away)
      const assignment = assignToCategory(store, category1.id, '2024-01', -10000)

      expect(assignment.amount).toBe(-10000)
    })
  })

  describe('moveBetweenCategories', () => {
    it('moves money from one category to another', () => {
      // Start with $500 in Groceries
      assignToCategory(store, category1.id, '2024-01', 50000)

      // Move $200 to Rent
      const { from, to } = moveBetweenCategories(
        store,
        category1.id,
        category2.id,
        '2024-01',
        20000
      )

      expect(from.amount).toBe(30000) // $300 remaining
      expect(to.amount).toBe(20000) // $200 moved

      expect(store.getAssignment(category1.id, '2024-01')?.amount).toBe(30000)
      expect(store.getAssignment(category2.id, '2024-01')?.amount).toBe(20000)
    })

    it('creates assignments if they do not exist', () => {
      const { from, to } = moveBetweenCategories(
        store,
        category1.id,
        category2.id,
        '2024-01',
        20000
      )

      expect(from.amount).toBe(-20000) // Negative because nothing was there
      expect(to.amount).toBe(20000)
    })

    it('handles moving to already-funded category', () => {
      assignToCategory(store, category1.id, '2024-01', 50000)
      assignToCategory(store, category2.id, '2024-01', 100000)

      const { from, to } = moveBetweenCategories(
        store,
        category1.id,
        category2.id,
        '2024-01',
        20000
      )

      expect(from.amount).toBe(30000)
      expect(to.amount).toBe(120000)
    })

    it('allows moving entire amount', () => {
      assignToCategory(store, category1.id, '2024-01', 50000)

      const { from, to } = moveBetweenCategories(
        store,
        category1.id,
        category2.id,
        '2024-01',
        50000
      )

      expect(from.amount).toBe(0)
      expect(to.amount).toBe(50000)
    })
  })

  describe('clearCategoryAssignments', () => {
    it('deletes assignments for specified months', () => {
      assignToCategory(store, category1.id, '2024-01', 50000)
      assignToCategory(store, category1.id, '2024-02', 55000)
      assignToCategory(store, category1.id, '2024-03', 60000)

      clearCategoryAssignments(store, category1.id, ['2024-01', '2024-02'])

      expect(store.getAssignment(category1.id, '2024-01')).toBeNull()
      expect(store.getAssignment(category1.id, '2024-02')).toBeNull()
      expect(store.getAssignment(category1.id, '2024-03')?.amount).toBe(60000)
    })

    it('handles empty months array', () => {
      assignToCategory(store, category1.id, '2024-01', 50000)

      clearCategoryAssignments(store, category1.id, [])

      expect(store.getAssignment(category1.id, '2024-01')?.amount).toBe(50000)
    })

    it('handles non-existent assignments', () => {
      // Should not throw
      clearCategoryAssignments(store, category1.id, ['2024-01', '2024-02'])

      expect(store.getAssignment(category1.id, '2024-01')).toBeNull()
    })
  })
})
