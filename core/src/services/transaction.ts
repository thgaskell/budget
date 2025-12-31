import { createTransaction } from '../schemas/transaction.ts'
import type { Transaction } from '../schemas/transaction.ts'
import type { Store } from '../stores/types.ts'

/**
 * Input for creating a new transaction.
 */
export interface CreateTransactionInput {
  accountId: string
  amount: number
  date: string
  categoryId?: string | null
  payeeId?: string | null
  memo?: string | null
  cleared?: boolean
}

/**
 * Create a new transaction and save it to the store.
 * Returns the created transaction.
 */
export function addTransaction(store: Store, input: CreateTransactionInput): Transaction {
  const transaction = createTransaction({
    accountId: input.accountId,
    amount: input.amount,
    date: input.date,
    categoryId: input.categoryId,
    payeeId: input.payeeId,
    memo: input.memo,
    cleared: input.cleared,
  })

  store.saveTransaction(transaction)
  return transaction
}

/**
 * Input for creating a transfer between accounts.
 */
export interface CreateTransferInput {
  fromAccountId: string
  toAccountId: string
  amount: number
  date: string
  memo?: string | null
  cleared?: boolean
}

/**
 * Create a transfer between two accounts.
 * Creates two linked transactions: outflow from source, inflow to destination.
 *
 * For budget-to-budget transfers, no category is assigned (money stays in the budget).
 * For transfers involving tracking accounts, the on-budget side may need a category.
 *
 * Returns both transactions.
 */
export function createTransfer(
  store: Store,
  input: CreateTransferInput
): { from: Transaction; to: Transaction } {
  const fromAccount = store.getAccount(input.fromAccountId)
  const toAccount = store.getAccount(input.toAccountId)

  if (!fromAccount || !toAccount) {
    throw new Error('Invalid account ID')
  }

  // Both accounts on-budget: no category needed (money stays within budget)
  // If one account is off-budget: the on-budget side needs a category (handled by caller)
  // Note: For now, we always set categoryId to null for transfers. Future enhancement could
  // handle transfers involving tracking accounts differently.

  // Create the outflow transaction (negative amount)
  const fromTransaction = createTransaction({
    accountId: input.fromAccountId,
    amount: -Math.abs(input.amount), // Ensure negative for outflow
    date: input.date,
    categoryId: null, // Budget-to-budget transfers don't affect categories
    payeeId: null,
    memo: input.memo,
    cleared: input.cleared,
    transferAccountId: input.toAccountId,
  })

  // Create the inflow transaction (positive amount)
  const toTransaction = createTransaction({
    accountId: input.toAccountId,
    amount: Math.abs(input.amount), // Ensure positive for inflow
    date: input.date,
    categoryId: null,
    payeeId: null,
    memo: input.memo,
    cleared: input.cleared,
    transferAccountId: input.fromAccountId,
  })

  store.saveTransaction(fromTransaction)
  store.saveTransaction(toTransaction)

  return { from: fromTransaction, to: toTransaction }
}

/**
 * Delete a transaction.
 * If it's part of a transfer, also deletes the linked transaction.
 */
export function deleteTransactionWithTransfer(store: Store, transactionId: string): void {
  const transaction = store.getTransaction(transactionId)
  if (!transaction) return

  // If this is a transfer, find and delete the linked transaction
  if (transaction.transferAccountId) {
    const linkedAccountTransactions = store.listTransactions(transaction.transferAccountId)
    const linkedTransaction = linkedAccountTransactions.find(
      (t) => t.transferAccountId === transaction.accountId && t.date === transaction.date
    )
    if (linkedTransaction) {
      store.deleteTransaction(linkedTransaction.id)
    }
  }

  store.deleteTransaction(transactionId)
}

/**
 * Update a transaction's cleared status.
 */
export function setTransactionCleared(
  store: Store,
  transactionId: string,
  cleared: boolean
): Transaction | null {
  const transaction = store.getTransaction(transactionId)
  if (!transaction) return null

  const updated = { ...transaction, cleared }
  store.saveTransaction(updated)
  return updated
}

/**
 * Reassign a transaction to a different category.
 */
export function reassignTransaction(
  store: Store,
  transactionId: string,
  categoryId: string | null
): Transaction | null {
  const transaction = store.getTransaction(transactionId)
  if (!transaction) return null

  const updated = { ...transaction, categoryId }
  store.saveTransaction(updated)
  return updated
}
