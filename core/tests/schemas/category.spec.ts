import { describe, expect, it } from 'vitest'
import { createCategory } from '../../src/schemas/category.ts'
import { createCategoryGroup } from '../../src/schemas/category-group.ts'

describe('CategoryGroup', () => {
  describe('createCategoryGroup', () => {
    it('creates a category group with generated UUID', () => {
      const group = createCategoryGroup({
        budgetId: 'budget-1',
        name: 'Housing',
      })

      expect(group.id).toBeDefined()
      expect(group.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(group.budgetId).toBe('budget-1')
      expect(group.name).toBe('Housing')
    })

    it('defaults sortOrder to 0', () => {
      const group = createCategoryGroup({
        budgetId: 'budget-1',
        name: 'Housing',
      })

      expect(group.sortOrder).toBe(0)
    })

    it('accepts custom sortOrder', () => {
      const group = createCategoryGroup({
        budgetId: 'budget-1',
        name: 'Transportation',
        sortOrder: 5,
      })

      expect(group.sortOrder).toBe(5)
    })
  })
})

describe('Category', () => {
  describe('createCategory', () => {
    it('creates a category with generated UUID', () => {
      const category = createCategory({
        groupId: 'group-1',
        name: 'Rent',
      })

      expect(category.id).toBeDefined()
      expect(category.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(category.groupId).toBe('group-1')
      expect(category.name).toBe('Rent')
    })

    it('defaults sortOrder to 0', () => {
      const category = createCategory({
        groupId: 'group-1',
        name: 'Rent',
      })

      expect(category.sortOrder).toBe(0)
    })

    it('accepts custom sortOrder', () => {
      const category = createCategory({
        groupId: 'group-1',
        name: 'Utilities',
        sortOrder: 2,
      })

      expect(category.sortOrder).toBe(2)
    })
  })
})
