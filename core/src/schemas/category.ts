/**
 * Category entity - a virtual "envelope" for money allocation.
 * Computed values (assigned, activity, available) are calculated per period by services.
 */
export interface Category {
  /** Unique identifier (UUID) */
  id: string
  /** Parent category group ID */
  groupId: string
  /** Category name */
  name: string
  /** Display order within group */
  sortOrder: number
}

/**
 * Create a new Category with a unique ID.
 */
export function createCategory(params: {
  groupId: string
  name: string
  sortOrder?: number
}): Category {
  return {
    id: crypto.randomUUID(),
    groupId: params.groupId,
    name: params.name,
    sortOrder: params.sortOrder ?? 0,
  }
}
