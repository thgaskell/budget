import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  MemoryStore,
  createBudget,
  createCategory,
  createCategoryGroup,
} from '@budget/core'
import { setStore, resetStore } from '../../src/store.ts'

describe('Category Commands', () => {
  let store: MemoryStore
  let budgetId: string
  let groupId: string

  beforeEach(() => {
    store = new MemoryStore()
    setStore(store)

    const budget = createBudget({ name: 'Test Budget' })
    store.saveBudget(budget)
    budgetId = budget.id

    const group = createCategoryGroup({ budgetId, name: 'Expenses' })
    store.saveCategoryGroup(group)
    groupId = group.id
  })

  afterEach(() => {
    resetStore()
  })

  describe('category add', () => {
    it('creates a category in a group', () => {
      const category = createCategory({ groupId, name: 'Groceries' })
      store.saveCategory(category)

      expect(store.getCategory(category.id)).not.toBeNull()
      expect(store.getCategory(category.id)?.name).toBe('Groceries')
      expect(store.getCategory(category.id)?.groupId).toBe(groupId)
    })

    it('creates multiple categories', () => {
      store.saveCategory(createCategory({ groupId, name: 'Groceries', sortOrder: 0 }))
      store.saveCategory(createCategory({ groupId, name: 'Utilities', sortOrder: 1 }))
      store.saveCategory(createCategory({ groupId, name: 'Rent', sortOrder: 2 }))

      const categories = store.listCategories(budgetId)
      expect(categories).toHaveLength(3)
    })
  })

  describe('category list', () => {
    it('lists categories grouped by group', () => {
      const group2 = createCategoryGroup({ budgetId, name: 'Income' })
      store.saveCategoryGroup(group2)

      store.saveCategory(createCategory({ groupId, name: 'Groceries' }))
      store.saveCategory(createCategory({ groupId, name: 'Utilities' }))
      store.saveCategory(createCategory({ groupId: group2.id, name: 'Salary' }))

      const categories = store.listCategories(budgetId)
      expect(categories).toHaveLength(3)
    })
  })

  describe('category delete', () => {
    it('deletes a category', () => {
      const category = createCategory({ groupId, name: 'Delete Me' })
      store.saveCategory(category)

      expect(store.getCategory(category.id)).not.toBeNull()

      store.deleteCategory(category.id)

      expect(store.getCategory(category.id)).toBeNull()
    })
  })
})

describe('Group Commands', () => {
  let store: MemoryStore
  let budgetId: string

  beforeEach(() => {
    store = new MemoryStore()
    setStore(store)

    const budget = createBudget({ name: 'Test Budget' })
    store.saveBudget(budget)
    budgetId = budget.id
  })

  afterEach(() => {
    resetStore()
  })

  describe('group add', () => {
    it('creates a category group', () => {
      const group = createCategoryGroup({ budgetId, name: 'Expenses' })
      store.saveCategoryGroup(group)

      expect(store.getCategoryGroup(group.id)).not.toBeNull()
      expect(store.getCategoryGroup(group.id)?.name).toBe('Expenses')
    })

    it('creates multiple groups', () => {
      store.saveCategoryGroup(createCategoryGroup({ budgetId, name: 'Expenses', sortOrder: 0 }))
      store.saveCategoryGroup(createCategoryGroup({ budgetId, name: 'Income', sortOrder: 1 }))
      store.saveCategoryGroup(createCategoryGroup({ budgetId, name: 'Savings', sortOrder: 2 }))

      const groups = store.listCategoryGroups(budgetId)
      expect(groups).toHaveLength(3)
    })
  })

  describe('group list', () => {
    it('lists groups for budget', () => {
      store.saveCategoryGroup(createCategoryGroup({ budgetId, name: 'Expenses' }))
      store.saveCategoryGroup(createCategoryGroup({ budgetId, name: 'Income' }))

      const groups = store.listCategoryGroups(budgetId)
      expect(groups).toHaveLength(2)
    })
  })

  describe('group delete', () => {
    it('deletes a group', () => {
      const group = createCategoryGroup({ budgetId, name: 'Delete Me' })
      store.saveCategoryGroup(group)

      expect(store.getCategoryGroup(group.id)).not.toBeNull()

      store.deleteCategoryGroup(group.id)

      expect(store.getCategoryGroup(group.id)).toBeNull()
    })

    it('deleting a group does not automatically delete categories', () => {
      const group = createCategoryGroup({ budgetId, name: 'Expenses' })
      store.saveCategoryGroup(group)

      const category = createCategory({ groupId: group.id, name: 'Groceries' })
      store.saveCategory(category)

      store.deleteCategoryGroup(group.id)

      // Category still exists (in real CLI, we'd delete it first)
      expect(store.getCategory(category.id)).not.toBeNull()
    })
  })
})
