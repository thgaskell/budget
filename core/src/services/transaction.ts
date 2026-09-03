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
  /** Category for the on-budget leg, only when the other account is off-budget */
  categoryId?: string | null
}

/**
 * Create a transfer between two accounts.
 * Creates two linked transactions: outflow from source, inflow to destination.
 *
 * For budget-to-budget transfers, no category is assigned (money stays in the budget)
 * and passing a category is an error.
 * When exactly one account is off-budget the money enters or leaves the budget, so the
 * on-budget leg may carry a category; pass it as `categoryId`.
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

  if (input.fromAccountId === input.toAccountId) {
    throw new Error('Cannot transfer to the same account')
  }

  // Both accounts on-budget: no category (money stays within the budget).
  // Exactly one off-budget: the money crosses the budget boundary, so the on-budget
  // leg may carry a category and the off-budget leg never does.
  const crossesBudgetBoundary = fromAccount.onBudget !== toAccount.onBudget
  if (input.categoryId && !crossesBudgetBoundary) {
    throw new Error(
      'A category can only be set on a transfer where exactly one account is off-budget'
    )
  }
  const categoryId = input.categoryId ?? null

  // Create the outflow transaction (negative amount)
  const fromTransaction = createTransaction({
    accountId: input.fromAccountId,
    amount: -Math.abs(input.amount), // Ensure negative for outflow
    date: input.date,
    categoryId: crossesBudgetBoundary && fromAccount.onBudget ? categoryId : null,
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
    categoryId: crossesBudgetBoundary && toAccount.onBudget ? categoryId : null,
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
 * Find the other leg of a transfer.
 *
 * A transfer pair is only recorded as `transferAccountId` on each side, so the
 * partner is identified by pointing back at this transaction's account. When several
 * candidates match, a mirrored amount wins over a bare account match, and the same
 * date wins over the nearest date.
 *
 * Returns null when the transaction is not a transfer or has no resolvable partner.
 */
export function findTransferPartner(store: Store, transaction: Transaction): Transaction | null {
  if (!transaction.transferAccountId) return null

  const candidates = store
    .listTransactions(transaction.transferAccountId)
    .filter((t) => t.id !== transaction.id && t.transferAccountId === transaction.accountId)

  if (candidates.length === 0) return null

  const mirrored = candidates.filter((t) => t.amount === -transaction.amount)
  const pool = mirrored.length > 0 ? mirrored : candidates

  const sameDate = pool.find((t) => t.date === transaction.date)
  if (sameDate) return sameDate

  // Legs recorded on different dates are only safe to pair when the amounts mirror
  if (mirrored.length === 0) return null

  const dayOf = (date: string) => new Date(`${date}T00:00:00Z`).getTime()
  const target = dayOf(transaction.date)
  return [...mirrored].sort(
    (a, b) => Math.abs(dayOf(a.date) - target) - Math.abs(dayOf(b.date) - target)
  )[0]
}

/**
 * Link two existing transactions as the two legs of a transfer.
 *
 * Importers only discover a pair after both rows exist, so the pair has to be
 * linkable after the fact. The two legs must live in different accounts of the same
 * budget, be an outflow and an inflow, and be resolvable as partners afterwards -
 * which means sharing a date or mirroring each other's amount.
 *
 * Returns both updated transactions.
 */
export function linkTransactions(
  store: Store,
  firstId: string,
  secondId: string
): { first: Transaction; second: Transaction } {
  if (firstId === secondId) {
    throw new Error('Cannot link a transaction to itself')
  }

  const first = store.getTransaction(firstId)
  if (!first) throw new Error(`Transaction not found: ${firstId}`)
  const second = store.getTransaction(secondId)
  if (!second) throw new Error(`Transaction not found: ${secondId}`)

  if (first.accountId === second.accountId) {
    throw new Error('Cannot link two transactions in the same account')
  }

  const firstAccount = store.getAccount(first.accountId)
  const secondAccount = store.getAccount(second.accountId)
  if (!firstAccount || !secondAccount) {
    throw new Error('Invalid account ID')
  }
  if (firstAccount.budgetId !== secondAccount.budgetId) {
    throw new Error('Cannot link transactions from different budgets')
  }

  for (const transaction of [first, second]) {
    if (transaction.transferAccountId) {
      throw new Error(
        `Transaction is already part of a transfer: ${transaction.id}. Unlink it first.`
      )
    }
  }

  const isOutflowInflowPair =
    (first.amount < 0 && second.amount > 0) || (first.amount > 0 && second.amount < 0)
  if (!isOutflowInflowPair) {
    throw new Error('A transfer needs one outflow and one inflow')
  }

  if (first.date !== second.date && first.amount !== -second.amount) {
    throw new Error(
      'Cannot link transactions with different dates and amounts that do not offset'
    )
  }

  const linkedFirst = { ...first, transferAccountId: second.accountId }
  const linkedSecond = { ...second, transferAccountId: first.accountId }

  store.saveTransaction(linkedFirst)
  store.saveTransaction(linkedSecond)

  return { first: linkedFirst, second: linkedSecond }
}

/**
 * Clear the transfer link on a transaction and on its partner, leaving both rows in place.
 * Returns the updated transaction and its former partner (null if none was resolvable).
 */
export function unlinkTransaction(
  store: Store,
  transactionId: string
): { transaction: Transaction; partner: Transaction | null } {
  const transaction = store.getTransaction(transactionId)
  if (!transaction) throw new Error(`Transaction not found: ${transactionId}`)

  if (!transaction.transferAccountId) {
    throw new Error(`Transaction is not part of a transfer: ${transactionId}`)
  }

  const partner = findTransferPartner(store, transaction)

  const unlinked = { ...transaction, transferAccountId: null }
  store.saveTransaction(unlinked)

  let unlinkedPartner: Transaction | null = null
  if (partner) {
    unlinkedPartner = { ...partner, transferAccountId: null }
    store.saveTransaction(unlinkedPartner)
  }

  return { transaction: unlinked, partner: unlinkedPartner }
}

/**
 * Delete a transaction.
 * If it's part of a transfer, also deletes the linked transaction.
 */
export function deleteTransactionWithTransfer(store: Store, transactionId: string): void {
  const transaction = store.getTransaction(transactionId)
  if (!transaction) return

  const partner = findTransferPartner(store, transaction)
  if (partner) {
    store.deleteTransaction(partner.id)
  }

  store.deleteTransaction(transactionId)
}

/**
 * Whether a transaction is money entering the budget from outside it.
 *
 * The receiving leg of a transfer between two on-budget accounts is not income: the
 * money was already inside the budget, so counting it would inflate Ready to Assign.
 * An inflow from an off-budget account is real income - the money is entering the
 * budget for the first time.
 */
export function countsAsIncome(store: Store, transaction: Transaction): boolean {
  if (transaction.amount <= 0) return false
  if (!transaction.transferAccountId) return true

  const counterpart = store.getAccount(transaction.transferAccountId)
  return !counterpart?.onBudget
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
