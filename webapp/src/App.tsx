import { useState, useEffect, useRef } from 'react'
import { useBudget, ToastProvider } from './contexts/index.ts'
import { getPreviousMonth, getNextMonth } from '@budget/core'
import { BudgetTable } from './components/BudgetTable'
import { TransactionList } from './components/TransactionList'
import { TransactionModal } from './components/TransactionModal'
import { MonthNavigation } from './components/MonthNavigation'
import { ExportButton } from './components/ExportButton'
import { ImportButton } from './components/ImportButton'
import { ConfirmationDialog } from './components/ConfirmationDialog'
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal'
import type { Transaction } from '@budget/core'
import './App.css'

function App() {
  const {
    budget,
    currentMonth,
    selectedMonth,
    setSelectedMonth,
    transactions,
    categories,
    categoryGroups,
    payees,
    accounts,
    assignments,
    previousMonthAssignments,
    readyToAssign,
    monthData,
    isDirty,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addCategory,
    updateCategory,
    deleteCategory,
    addCategoryGroup,
    updateCategoryGroup,
    deleteCategoryGroup,
    assignToCategory,
    addPayee,
  } = useBudget()

  const [showModal, setShowModal] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)

  // Track the element that triggered the modal for focus restoration
  const modalTriggerRef = useRef<HTMLElement | null>(null)

  // Warn user before leaving if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        // Trigger browser's native "Leave site?" dialog
        e.preventDefault()
        // For older browsers
        e.returnValue = ''
        return ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  const handleAddClick = () => {
    modalTriggerRef.current = document.activeElement as HTMLElement
    setEditingTransaction(null)
    setShowModal(true)
  }

  const handleEditClick = (transaction: Transaction) => {
    modalTriggerRef.current = document.activeElement as HTMLElement
    setEditingTransaction(transaction)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingTransaction(null)
    // Return focus to the element that triggered the modal
    setTimeout(() => modalTriggerRef.current?.focus(), 0)
  }

  const handleSaveTransaction = (transaction: Transaction) => {
    if (editingTransaction) {
      updateTransaction(transaction)
    } else {
      // Get the first account (default)
      const accountId = accounts[0]?.id
      if (!accountId) return

      addTransaction({
        accountId,
        amount: transaction.amount,
        date: transaction.date,
        categoryId: transaction.categoryId,
        payeeId: transaction.payeeId,
        memo: transaction.memo,
        cleared: transaction.cleared,
      })
    }
    handleCloseModal()
  }

  const handleDeleteClick = (transactionId: string) => {
    setPendingDeleteId(transactionId)
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    if (pendingDeleteId) {
      deleteTransaction(pendingDeleteId)
    }
    setShowDeleteConfirm(false)
    setPendingDeleteId(null)
  }

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false)
    setPendingDeleteId(null)
  }

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      switch (e.key) {
        case 'Escape':
          if (showShortcutsModal) {
            setShowShortcutsModal(false)
          } else if (showModal) {
            setShowModal(false)
            setEditingTransaction(null)
          }
          break
        case '?':
          setShowShortcutsModal(true)
          break
        case 'n':
          setEditingTransaction(null)
          setShowModal(true)
          break
        case 't':
          setSelectedMonth(currentMonth)
          break
        case 'ArrowLeft':
          setSelectedMonth(getPreviousMonth(selectedMonth))
          break
        case 'ArrowRight':
          setSelectedMonth(getNextMonth(selectedMonth))
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showModal, showShortcutsModal, currentMonth, selectedMonth, setSelectedMonth])

  if (!budget) {
    return <div>Loading...</div>
  }

  return (
    <ToastProvider>
      <div className="app">
        <header className="app-header">
          <div className="header-content">
            <div className="header-left">
              <h1>{budget.name}</h1>
            </div>
            <div className="header-center">
              <MonthNavigation
                currentMonth={currentMonth}
                selectedMonth={selectedMonth}
                onMonthChange={setSelectedMonth}
              />
            </div>
            <div className="header-right">
              <ImportButton />
              <ExportButton />
            </div>
          </div>
        </header>

        <main className="app-main">
          <section className="budget-section">
            <BudgetTable
              categoryGroups={categoryGroups}
              categories={categories}
              transactions={transactions}
              assignments={assignments}
              previousMonthAssignments={previousMonthAssignments}
              readyToAssign={readyToAssign}
              monthData={monthData}
              currentMonth={selectedMonth}
              onAssign={assignToCategory}
              onAddCategory={addCategory}
              onEditCategory={updateCategory}
              onDeleteCategory={deleteCategory}
              onAddCategoryGroup={addCategoryGroup}
              onEditCategoryGroup={updateCategoryGroup}
              onDeleteCategoryGroup={deleteCategoryGroup}
            />
          </section>

          <section className="transactions-section">
            <TransactionList
              transactions={transactions}
              categories={categories}
              payees={payees}
              onAddTransaction={handleAddClick}
              onEditTransaction={handleEditClick}
              onDeleteTransaction={handleDeleteClick}
            />
          </section>
        </main>

        {showModal && (
          <TransactionModal
            transaction={editingTransaction}
            categories={categories}
            accounts={accounts}
            payees={payees}
            onSave={handleSaveTransaction}
            onDelete={editingTransaction ? () => handleDeleteClick(editingTransaction.id) : undefined}
            onClose={handleCloseModal}
            onAddPayee={addPayee}
          />
        )}

        <ConfirmationDialog
          isOpen={showDeleteConfirm}
          title="Delete Transaction"
          message="Are you sure you want to delete this transaction? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />

        <KeyboardShortcutsModal
          isOpen={showShortcutsModal}
          onClose={() => setShowShortcutsModal(false)}
        />
      </div>
    </ToastProvider>
  )
}

export default App
