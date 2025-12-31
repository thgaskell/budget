import { describe, expect, it } from 'vitest'
import { createAssignment, getMonth } from '../../src/schemas/assignment.ts'

describe('Assignment', () => {
  describe('createAssignment', () => {
    it('creates an assignment with generated UUID', () => {
      const assignment = createAssignment({
        categoryId: 'category-1',
        month: '2024-01',
        amount: 50000,
      })

      expect(assignment.id).toBeDefined()
      expect(assignment.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(assignment.categoryId).toBe('category-1')
      expect(assignment.month).toBe('2024-01')
      expect(assignment.amount).toBe(50000)
    })
  })

  describe('getMonth', () => {
    it('extracts month from Date object', () => {
      const date = new Date('2024-03-15')
      expect(getMonth(date)).toBe('2024-03')
    })

    it('extracts month from ISO string', () => {
      expect(getMonth('2024-03-15')).toBe('2024-03')
    })

    it('pads single-digit months', () => {
      expect(getMonth('2024-01-15')).toBe('2024-01')
      expect(getMonth('2024-09-15')).toBe('2024-09')
    })

    it('handles December correctly', () => {
      expect(getMonth('2024-12-31')).toBe('2024-12')
    })
  })
})
