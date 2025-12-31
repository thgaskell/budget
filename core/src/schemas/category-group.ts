/**
 * CategoryGroup entity - organizational container for related categories.
 */
export interface CategoryGroup {
  /** Unique identifier (UUID) */
  id: string
  /** Parent budget ID */
  budgetId: string
  /** Group name (e.g., "Housing", "Transportation") */
  name: string
  /** Display order */
  sortOrder: number
}

/**
 * Create a new CategoryGroup with a unique ID.
 */
export function createCategoryGroup(params: {
  budgetId: string
  name: string
  sortOrder?: number
}): CategoryGroup {
  return {
    id: crypto.randomUUID(),
    budgetId: params.budgetId,
    name: params.name,
    sortOrder: params.sortOrder ?? 0,
  }
}
