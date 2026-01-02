import { useState, useCallback, useMemo, useRef, memo } from 'react'
import {
  formatCurrency,
  type Category,
  type CategoryGroup,
  type Assignment,
  type Transaction,
  type MonthData,
} from '@budget/core'
import { ConfirmationDialog } from './ConfirmationDialog'
import './BudgetTable.css'

/**
 * Validate currency input string.
 * Returns an error message if invalid, or null if valid.
 */
function validateCurrencyInput(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') {
    return 'Amount is required'
  }
  // Remove currency symbols, commas, and whitespace
  const cleaned = trimmed.replace(/[$,\s]/g, '')
  const dollars = parseFloat(cleaned)
  if (isNaN(dollars)) {
    return 'Please enter a valid number'
  }
  if (dollars < 0) {
    return 'Amount cannot be negative'
  }
  return null
}

/**
 * Parse currency input string to cents.
 */
function parseCurrencyInput(value: string): number {
  // Remove currency symbols, commas, and whitespace
  const cleaned = value.replace(/[$,\s]/g, '')
  const dollars = parseFloat(cleaned)
  if (isNaN(dollars)) return 0
  return Math.round(dollars * 100)
}

interface CategoryRowData {
  category: Category
  assigned: number
  spent: number
  remaining: number
  /** True if assigned value is inherited from previous month (not explicitly set) */
  isInherited: boolean
}

interface EditingState {
  categoryId: string
  value: string
  error: string | null
}

interface BudgetTableProps {
  categoryGroups: CategoryGroup[]
  categories: Category[]
  transactions: Transaction[]
  assignments: Assignment[]
  previousMonthAssignments: Assignment[]
  readyToAssign: number
  monthData: MonthData | null
  currentMonth: string
  onAssign: (categoryId: string, amount: number) => void
  onAddCategory: (groupId: string, name: string) => void
  onEditCategory: (category: Category) => void
  onDeleteCategory: (categoryId: string) => void
  onAddCategoryGroup: (name: string) => void
  onEditCategoryGroup: (group: CategoryGroup) => void
  onDeleteCategoryGroup: (groupId: string) => void
}

export function BudgetTable({
  categoryGroups,
  categories,
  transactions,
  assignments,
  previousMonthAssignments,
  readyToAssign,
  monthData,
  currentMonth: _currentMonth,
  onAssign,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onAddCategoryGroup,
  onEditCategoryGroup,
  onDeleteCategoryGroup,
}: BudgetTableProps) {
  void _currentMonth // May be used for future features
  // State for collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // State for inline editing
  const [editing, setEditing] = useState<EditingState | null>(null)

  // Ref to track the element that triggered inline editing for focus restoration
  const editTriggerRef = useRef<HTMLElement | null>(null)

  // State for adding new category
  const [addingCategoryToGroup, setAddingCategoryToGroup] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')

  // State for adding new group
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // State for editing category name
  const [editingCategoryName, setEditingCategoryName] = useState<{ id: string; name: string } | null>(null)

  // State for editing group name
  const [editingGroupName, setEditingGroupName] = useState<{ id: string; name: string } | null>(null)

  // State for delete confirmations
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<{ id: string; name: string } | null>(null)
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<{ id: string; name: string } | null>(null)

  // Build category row data using monthData which includes carryover
  const getCategoryRowData = useCallback(
    (category: Category): CategoryRowData => {
      const catData = monthData?.categoryData[category.id]
      const currentAssignment = assignments.find((a) => a.categoryId === category.id)
      const prevAssignment = previousMonthAssignments.find((a) => a.categoryId === category.id)

      // Determine if we're showing an inherited value
      // Inherited = no current month assignment, but previous month has one
      const hasCurrentAssignment = currentAssignment !== undefined
      const isInherited = !hasCurrentAssignment && prevAssignment !== undefined

      // The displayed assigned value: current if set, otherwise previous month's
      const displayedAssigned = hasCurrentAssignment
        ? (currentAssignment?.amount ?? 0)
        : (prevAssignment?.amount ?? 0)

      if (catData) {
        // Use monthData which includes opening balance (carryover) from previous months
        // Activity is negative for spending, so we negate it to show as positive "spent"
        const spent = catData.activity < 0 ? Math.abs(catData.activity) : 0
        return {
          category,
          assigned: isInherited ? displayedAssigned : catData.assigned,
          spent,
          remaining: catData.closingBalance, // This includes carryover!
          isInherited,
        }
      }
      // Fallback if monthData not available
      let spent = 0
      for (const tx of transactions) {
        if (tx.categoryId === category.id && tx.amount < 0) {
          spent += Math.abs(tx.amount)
        }
      }
      return {
        category,
        assigned: displayedAssigned,
        spent,
        remaining: displayedAssigned - spent,
        isInherited,
      }
    },
    [monthData, assignments, previousMonthAssignments, transactions]
  )

  // Get categories for a group
  const getCategoriesForGroup = useCallback(
    (groupId: string): Category[] => {
      return categories.filter((c) => c.groupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder)
    },
    [categories]
  )

  // Calculate group totals
  const getGroupTotals = useCallback(
    (groupId: string) => {
      const groupCategories = getCategoriesForGroup(groupId)
      let assigned = 0
      let spent = 0
      let remaining = 0
      for (const cat of groupCategories) {
        const data = getCategoryRowData(cat)
        assigned += data.assigned
        spent += data.spent
        remaining += data.remaining
      }
      return { assigned, spent, remaining }
    },
    [getCategoriesForGroup, getCategoryRowData]
  )

  // Toggle group collapse
  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }, [])

  // Handle starting edit
  const startEditing = useCallback((categoryId: string, currentAmount: number, triggerElement?: HTMLElement) => {
    if (triggerElement) {
      editTriggerRef.current = triggerElement
    }
    setEditing({
      categoryId,
      value: (currentAmount / 100).toFixed(2),
      error: null,
    })
  }, [])

  // Handle edit input change
  const handleEditChange = useCallback(
    (value: string) => {
      if (editing) {
        const error = validateCurrencyInput(value)
        setEditing({ ...editing, value, error })
      }
    },
    [editing]
  )

  // Handle saving edit
  const saveEdit = useCallback(() => {
    if (!editing) return

    // Validate before saving
    const error = validateCurrencyInput(editing.value)
    if (error) {
      setEditing({ ...editing, error })
      return
    }

    const newAmount = parseCurrencyInput(editing.value)
    onAssign(editing.categoryId, newAmount)
    setEditing(null)
    // Return focus to the element that triggered editing
    setTimeout(() => editTriggerRef.current?.focus(), 0)
  }, [editing, onAssign])

  // Handle cancel edit
  const cancelEdit = useCallback(() => {
    setEditing(null)
    // Return focus to the element that triggered editing
    setTimeout(() => editTriggerRef.current?.focus(), 0)
  }, [])

  // Handle key down in edit input
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        saveEdit()
      } else if (e.key === 'Escape') {
        cancelEdit()
      }
    },
    [saveEdit, cancelEdit]
  )

  // Handle adding category
  const handleAddCategory = useCallback(
    (groupId: string) => {
      if (newCategoryName.trim()) {
        onAddCategory(groupId, newCategoryName.trim())
        setNewCategoryName('')
        setAddingCategoryToGroup(null)
      }
    },
    [newCategoryName, onAddCategory]
  )

  // Handle adding group
  const handleAddGroup = useCallback(() => {
    if (newGroupName.trim()) {
      onAddCategoryGroup(newGroupName.trim())
      setNewGroupName('')
      setAddingGroup(false)
    }
  }, [newGroupName, onAddCategoryGroup])

  // Handle saving category name edit
  const handleSaveCategoryName = useCallback(() => {
    if (editingCategoryName && editingCategoryName.name.trim()) {
      const category = categories.find((c) => c.id === editingCategoryName.id)
      if (category) {
        onEditCategory({ ...category, name: editingCategoryName.name.trim() })
      }
      setEditingCategoryName(null)
    }
  }, [editingCategoryName, categories, onEditCategory])

  // Handle saving group name edit
  const handleSaveGroupName = useCallback(() => {
    if (editingGroupName && editingGroupName.name.trim()) {
      const group = categoryGroups.find((g) => g.id === editingGroupName.id)
      if (group) {
        onEditCategoryGroup({ ...group, name: editingGroupName.name.trim() })
      }
      setEditingGroupName(null)
    }
  }, [editingGroupName, categoryGroups, onEditCategoryGroup])

  // Sorted groups
  const sortedGroups = useMemo(() => {
    return [...categoryGroups].sort((a, b) => a.sortOrder - b.sortOrder)
  }, [categoryGroups])

  // Calculate uncategorized spending (transactions without a category)
  const uncategorizedSpending = useMemo(() => {
    let spent = 0
    for (const tx of transactions) {
      if (!tx.categoryId && tx.amount < 0) {
        spent += Math.abs(tx.amount)
      }
    }
    return spent
  }, [transactions])

  // Determine Ready to Assign status
  const readyToAssignStatus = readyToAssign > 0 ? 'positive' : readyToAssign < 0 ? 'negative' : 'zero'

  return (
    <div className="budget-table-container">
      {/* Ready to Assign Header */}
      <div className={`ready-to-assign ready-to-assign--${readyToAssignStatus}`}>
        <span className="ready-to-assign__label">
          {readyToAssign < 0 ? 'Overbudget' : 'Ready to Assign'}
        </span>
        <span className="ready-to-assign__amount">{formatCurrency(readyToAssign)}</span>
      </div>

      {/* Budget Table */}
      <table className="budget-table">
        <thead>
          <tr>
            <th className="budget-table__header budget-table__header--name">Category</th>
            <th className="budget-table__header budget-table__header--amount">Assigned</th>
            <th className="budget-table__header budget-table__header--amount">Spent</th>
            <th className="budget-table__header budget-table__header--amount">Remaining</th>
            <th className="budget-table__header budget-table__header--actions"></th>
          </tr>
        </thead>
        <tbody>
          {/* Uncategorized spending row - only shows when there's uncategorized spending */}
          {uncategorizedSpending > 0 && (
            <tr className="budget-table__uncategorized-row">
              <td className="budget-table__cell budget-table__cell--uncategorized-name">
                Uncategorized
              </td>
              <td className="budget-table__cell budget-table__cell--amount">
                {formatCurrency(0)}
              </td>
              <td className="budget-table__cell budget-table__cell--amount">
                {formatCurrency(uncategorizedSpending)}
              </td>
              <td className="budget-table__cell budget-table__cell--amount budget-table__cell--negative">
                {formatCurrency(-uncategorizedSpending)}
              </td>
              <td className="budget-table__cell budget-table__cell--actions"></td>
            </tr>
          )}

          {sortedGroups.map((group) => {
            const groupCategories = getCategoriesForGroup(group.id)
            const groupTotals = getGroupTotals(group.id)
            const isCollapsed = collapsedGroups.has(group.id)

            return (
              <GroupSection
                key={group.id}
                group={group}
                isCollapsed={isCollapsed}
                onToggle={() => toggleGroup(group.id)}
                categories={groupCategories}
                getCategoryRowData={getCategoryRowData}
                groupTotals={groupTotals}
                editing={editing}
                onStartEditing={startEditing}
                onEditChange={handleEditChange}
                onSaveEdit={saveEdit}
                onKeyDown={handleKeyDown}
                addingCategory={addingCategoryToGroup === group.id}
                newCategoryName={newCategoryName}
                onStartAddCategory={() => setAddingCategoryToGroup(group.id)}
                onCancelAddCategory={() => {
                  setAddingCategoryToGroup(null)
                  setNewCategoryName('')
                }}
                onNewCategoryNameChange={setNewCategoryName}
                onAddCategory={() => handleAddCategory(group.id)}
                editingCategoryName={editingCategoryName}
                onStartEditCategoryName={(id, name) => setEditingCategoryName({ id, name })}
                onEditCategoryNameChange={(name) =>
                  setEditingCategoryName((prev) => (prev ? { ...prev, name } : null))
                }
                onSaveEditCategoryName={handleSaveCategoryName}
                onCancelEditCategoryName={() => setEditingCategoryName(null)}
                onDeleteCategory={(id, name) => setDeleteCategoryConfirm({ id, name })}
                editingGroupName={editingGroupName?.id === group.id ? editingGroupName : null}
                onStartEditGroupName={() => setEditingGroupName({ id: group.id, name: group.name })}
                onEditGroupNameChange={(name) => setEditingGroupName({ id: group.id, name })}
                onSaveEditGroupName={handleSaveGroupName}
                onCancelEditGroupName={() => setEditingGroupName(null)}
                onDeleteGroup={() => {
                  setDeleteGroupConfirm({ id: group.id, name: group.name })
                }}
              />
            )
          })}
        </tbody>
      </table>

      {/* Add Group Button/Input */}
      <div className="add-group-row">
        {addingGroup ? (
          <div className="add-group-input-row">
            <input
              type="text"
              className="add-group-input"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddGroup()
                if (e.key === 'Escape') {
                  setAddingGroup(false)
                  setNewGroupName('')
                }
              }}
              placeholder="New group name..."
              aria-label="New group name"
              autoFocus
            />
            <button className="add-group-save-btn" onClick={handleAddGroup}>
              Add
            </button>
            <button
              className="add-group-cancel-btn"
              onClick={() => {
                setAddingGroup(false)
                setNewGroupName('')
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button className="add-group-btn" onClick={() => setAddingGroup(true)}>
            + Add Category Group
          </button>
        )}
      </div>

      {/* Delete Group Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteGroupConfirm !== null}
        title="Delete Category Group"
        message={`Delete "${deleteGroupConfirm?.name}" and all its categories? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteGroupConfirm) {
            onDeleteCategoryGroup(deleteGroupConfirm.id)
          }
          setDeleteGroupConfirm(null)
        }}
        onCancel={() => setDeleteGroupConfirm(null)}
      />

      {/* Delete Category Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteCategoryConfirm !== null}
        title="Delete Category"
        message={`Delete category "${deleteCategoryConfirm?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteCategoryConfirm) {
            onDeleteCategory(deleteCategoryConfirm.id)
          }
          setDeleteCategoryConfirm(null)
        }}
        onCancel={() => setDeleteCategoryConfirm(null)}
      />
    </div>
  )
}

interface CategoryRowProps {
  category: Category
  data: CategoryRowData
  editing: EditingState | null
  editingCategoryName: { id: string; name: string } | null
  onStartEditing: (categoryId: string, currentAmount: number, triggerElement?: HTMLElement) => void
  onEditChange: (value: string) => void
  onSaveEdit: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onStartEditCategoryName: (id: string, name: string) => void
  onEditCategoryNameChange: (name: string) => void
  onSaveEditCategoryName: () => void
  onCancelEditCategoryName: () => void
  onDeleteCategory: (categoryId: string, categoryName: string) => void
}

/**
 * Memoized CategoryRow component for performance optimization.
 * Only re-renders when its props change, preventing unnecessary updates
 * when other categories in the same group are edited.
 */
const CategoryRow = memo(function CategoryRow({
  category,
  data,
  editing,
  editingCategoryName,
  onStartEditing,
  onEditChange,
  onSaveEdit,
  onKeyDown,
  onStartEditCategoryName,
  onEditCategoryNameChange,
  onSaveEditCategoryName,
  onCancelEditCategoryName,
  onDeleteCategory,
}: CategoryRowProps) {
  const isEditing = editing?.categoryId === category.id
  const isEditingName = editingCategoryName?.id === category.id

  return (
    <tr className="budget-table__category-row">
      <td className={`budget-table__cell budget-table__cell--category-name${isEditingName ? ' budget-table__cell--editing' : ''}`}>
        {isEditingName ? (
          <input
            type="text"
            className="budget-table__edit-input budget-table__edit-input--name"
            value={editingCategoryName.name}
            onChange={(e) => onEditCategoryNameChange(e.target.value)}
            onBlur={onSaveEditCategoryName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEditCategoryName()
              if (e.key === 'Escape') onCancelEditCategoryName()
            }}
            autoFocus
          />
        ) : (
          <span
            className="budget-table__category-name-text"
            onClick={() => onStartEditCategoryName(category.id, category.name)}
          >
            {category.name}
          </span>
        )}
      </td>
      <td
        className={`budget-table__cell budget-table__cell--amount budget-table__cell--editable${isEditing ? ' budget-table__cell--editing' : ''}${isEditing && editing?.error ? ' budget-table__cell--has-error' : ''}`}
        onClick={(e) => !isEditing && onStartEditing(category.id, data.assigned, e.currentTarget)}
        tabIndex={isEditing ? undefined : 0}
        onKeyDown={(e) => {
          if (!isEditing && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onStartEditing(category.id, data.assigned, e.currentTarget)
          }
        }}
        role="button"
        aria-label={`Edit assigned amount for ${category.name}`}
      >
        {isEditing && editing ? (
          <div className="budget-table__edit-wrapper">
            <input
              type="number"
              min="0"
              className={`budget-table__edit-input${editing.error ? ' input--error' : ''}`}
              value={editing.value}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={onSaveEdit}
              onKeyDown={onKeyDown}
              aria-invalid={!!editing.error}
              aria-describedby={editing.error ? `edit-error-${category.id}` : undefined}
              autoFocus
            />
            {editing.error && (
              <span id={`edit-error-${category.id}`} className="error-message" role="alert">
                {editing.error}
              </span>
            )}
          </div>
        ) : (
          <span className={data.isInherited ? 'budget-table__inherited-value' : undefined}>
            {formatCurrency(data.assigned)}
          </span>
        )}
      </td>
      <td className="budget-table__cell budget-table__cell--amount">{formatCurrency(data.spent)}</td>
      <td
        className={`budget-table__cell budget-table__cell--amount ${
          data.remaining < 0
            ? 'budget-table__cell--negative'
            : data.remaining > 0
              ? 'budget-table__cell--positive'
              : ''
        }`}
      >
        {formatCurrency(data.remaining)}
      </td>
      <td className="budget-table__cell budget-table__cell--actions">
        <button
          className="budget-table__action-btn budget-table__action-btn--delete"
          onClick={() => onDeleteCategory(category.id, category.name)}
          title="Delete category"
          aria-label="Delete category"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </td>
    </tr>
  )
})

interface GroupSectionProps {
  group: CategoryGroup
  isCollapsed: boolean
  onToggle: () => void
  categories: Category[]
  getCategoryRowData: (category: Category) => CategoryRowData
  groupTotals: { assigned: number; spent: number; remaining: number }
  editing: EditingState | null
  onStartEditing: (categoryId: string, currentAmount: number, triggerElement?: HTMLElement) => void
  onEditChange: (value: string) => void
  onSaveEdit: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  addingCategory: boolean
  newCategoryName: string
  onStartAddCategory: () => void
  onCancelAddCategory: () => void
  onNewCategoryNameChange: (name: string) => void
  onAddCategory: () => void
  editingCategoryName: { id: string; name: string } | null
  onStartEditCategoryName: (id: string, name: string) => void
  onEditCategoryNameChange: (name: string) => void
  onSaveEditCategoryName: () => void
  onCancelEditCategoryName: () => void
  onDeleteCategory: (categoryId: string, categoryName: string) => void
  editingGroupName: { id: string; name: string } | null
  onStartEditGroupName: () => void
  onEditGroupNameChange: (name: string) => void
  onSaveEditGroupName: () => void
  onCancelEditGroupName: () => void
  onDeleteGroup: () => void
}

function GroupSection({
  group,
  isCollapsed,
  onToggle,
  categories,
  getCategoryRowData,
  groupTotals,
  editing,
  onStartEditing,
  onEditChange,
  onSaveEdit,
  onKeyDown,
  addingCategory,
  newCategoryName,
  onStartAddCategory,
  onCancelAddCategory,
  onNewCategoryNameChange,
  onAddCategory,
  editingCategoryName,
  onStartEditCategoryName,
  onEditCategoryNameChange,
  onSaveEditCategoryName,
  onCancelEditCategoryName,
  onDeleteCategory,
  editingGroupName,
  onStartEditGroupName,
  onEditGroupNameChange,
  onSaveEditGroupName,
  onCancelEditGroupName,
  onDeleteGroup,
}: GroupSectionProps) {
  return (
    <>
      {/* Group Header Row */}
      <tr className="budget-table__group-row">
        <td className={`budget-table__cell budget-table__cell--group-name${editingGroupName ? ' budget-table__cell--editing' : ''}`} onClick={onToggle}>
          <span className="budget-table__collapse-icon">{isCollapsed ? '+' : '-'}</span>
          {editingGroupName ? (
            <input
              type="text"
              className="budget-table__edit-input budget-table__edit-input--name"
              value={editingGroupName.name}
              onChange={(e) => onEditGroupNameChange(e.target.value)}
              onBlur={onSaveEditGroupName}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') onSaveEditGroupName()
                if (e.key === 'Escape') onCancelEditGroupName()
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span
              className="budget-table__group-name-text"
              onClick={(e) => {
                e.stopPropagation()
                onStartEditGroupName()
              }}
            >
              {group.name}
            </span>
          )}
        </td>
        <td className="budget-table__cell budget-table__cell--amount budget-table__cell--group-total">
          {formatCurrency(groupTotals.assigned)}
        </td>
        <td className="budget-table__cell budget-table__cell--amount budget-table__cell--group-total">
          {formatCurrency(groupTotals.spent)}
        </td>
        <td
          className={`budget-table__cell budget-table__cell--amount budget-table__cell--group-total ${
            groupTotals.remaining < 0 ? 'budget-table__cell--negative' : ''
          }`}
        >
          {formatCurrency(groupTotals.remaining)}
        </td>
        <td className="budget-table__cell budget-table__cell--actions">
          <button
            className="budget-table__action-btn"
            onClick={(e) => {
              e.stopPropagation()
              onStartAddCategory()
            }}
            title="Add category"
            aria-label="Add category"
          >
            +
          </button>
          <button
            className="budget-table__action-btn budget-table__action-btn--delete"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteGroup()
            }}
            title="Delete group"
            aria-label="Delete group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </td>
      </tr>

      {/* Category Rows */}
      {!isCollapsed &&
        categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            data={getCategoryRowData(category)}
            editing={editing}
            editingCategoryName={editingCategoryName}
            onStartEditing={onStartEditing}
            onEditChange={onEditChange}
            onSaveEdit={onSaveEdit}
            onKeyDown={onKeyDown}
            onStartEditCategoryName={onStartEditCategoryName}
            onEditCategoryNameChange={onEditCategoryNameChange}
            onSaveEditCategoryName={onSaveEditCategoryName}
            onCancelEditCategoryName={onCancelEditCategoryName}
            onDeleteCategory={onDeleteCategory}
          />
        ))}

      {/* Add Category Row */}
      {!isCollapsed && addingCategory && (
        <tr className="budget-table__add-category-row">
          <td className="budget-table__cell" colSpan={5}>
            <input
              type="text"
              className="budget-table__add-category-input"
              value={newCategoryName}
              onChange={(e) => onNewCategoryNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAddCategory()
                if (e.key === 'Escape') onCancelAddCategory()
              }}
              placeholder="New category name..."
              autoFocus
            />
            <button className="budget-table__add-category-btn" onClick={onAddCategory}>
              Add
            </button>
            <button className="budget-table__cancel-category-btn" onClick={onCancelAddCategory}>
              Cancel
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

export default BudgetTable
