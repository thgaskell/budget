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
 * Assert that two transactions can stand as the two legs of one transfer.
 *
 * A transfer is a single movement of money seen from both ends, so the pair has to
 * hold together: two different accounts in the same budget, amounts that offset
 * exactly, and a category only where the money really crosses the budget boundary
 * (exactly one account off-budget), carried by the on-budget leg.
 *
 * Every path that creates or changes a pair - createTransfer, linkTransactions,
 * updateTransaction - checks the same rule here, so a pair cannot be edited into a
 * state it could never have been created in.
 *
 * Throws naming the broken rule; returns normally when the pair is sound.
 */
export function assertValidTransferPair(
  store: Store,
  first: Transaction,
  second: Transaction
): void {
  if (first.id === second.id) {
    throw new Error('A transfer needs two different transactions')
  }
  if (first.accountId === second.accountId) {
    throw new Error('The two legs of a transfer must be in different accounts')
  }

  const firstAccount = store.getAccount(first.accountId)
  const secondAccount = store.getAccount(second.accountId)
  if (!firstAccount || !secondAccount) {
    throw new Error('Invalid account ID')
  }
  if (firstAccount.budgetId !== secondAccount.budgetId) {
    throw new Error('The two legs of a transfer must belong to the same budget')
  }

  const isOutflowInflowPair =
    (first.amount < 0 && second.amount > 0) || (first.amount > 0 && second.amount < 0)
  if (!isOutflowInflowPair) {
    throw new Error('A transfer needs one outflow and one inflow')
  }

  // The same money leaving one account and arriving in the other: a shared date is
  // not evidence of that, only offsetting amounts are
  if (first.amount !== -second.amount) {
    throw new Error("A transfer's two legs must offset exactly")
  }

  const crossesBudgetBoundary = firstAccount.onBudget !== secondAccount.onBudget
  for (const [leg, legAccount] of [
    [first, firstAccount],
    [second, secondAccount],
  ] as const) {
    if (!leg.categoryId) continue
    if (!crossesBudgetBoundary) {
      throw new Error(
        'A category can only be set on a transfer where exactly one account is off-budget'
      )
    }
    if (!legAccount.onBudget) {
      throw new Error('Only the on-budget leg of a transfer can carry a category')
    }
  }
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
 * budget and satisfy the transfer invariant - see assertValidTransferPair.
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

  assertValidTransferPair(store, first, second)

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
 * Fields that can be changed on an existing transaction. Omitted fields are left
 * untouched; `null` clears a nullable field.
 */
export interface UpdateTransactionInput {
  accountId?: string
  amount?: number
  date?: string
  categoryId?: string | null
  payeeId?: string | null
  memo?: string | null
  cleared?: boolean
}

/**
 * Update a transaction, keeping any transfer it belongs to intact.
 *
 * A transfer's two legs are one movement of money, so an edit to one of them is an
 * edit to both: a new amount is mirrored onto the other leg, and moving a leg to
 * another account repoints its partner at the new account. The resulting pair is
 * checked against the same invariant that createTransfer and linkTransactions use,
 * so an edit can never leave the pair in a state the service would refuse to create -
 * a category on an on-budget-to-on-budget transfer, for instance.
 *
 * Edits that cannot break the pair (payee, memo, cleared, date) never touch the
 * partner. Pair-changing edits are refused outright when the partner cannot be
 * resolved, since there is nothing left to keep in step; unlink the leg first.
 *
 * Returns the updated transaction and its partner (null when it is not a transfer).
 */
export function updateTransaction(
  store: Store,
  transactionId: string,
  changes: UpdateTransactionInput
): { transaction: Transaction; partner: Transaction | null } {
  const transaction = store.getTransaction(transactionId)
  if (!transaction) throw new Error(`Transaction not found: ${transactionId}`)

  const updated: Transaction = {
    ...transaction,
    ...(changes.accountId !== undefined && { accountId: changes.accountId }),
    ...(changes.amount !== undefined && { amount: changes.amount }),
    ...(changes.date !== undefined && { date: changes.date }),
    ...(changes.categoryId !== undefined && { categoryId: changes.categoryId }),
    ...(changes.payeeId !== undefined && { payeeId: changes.payeeId }),
    ...(changes.memo !== undefined && { memo: changes.memo }),
    ...(changes.cleared !== undefined && { cleared: changes.cleared }),
  }

  if (changes.accountId !== undefined && !store.getAccount(changes.accountId)) {
    throw new Error('Invalid account ID')
  }

  const affectsPair =
    changes.accountId !== undefined ||
    changes.amount !== undefined ||
    changes.categoryId !== undefined

  if (!transaction.transferAccountId || !affectsPair) {
    store.saveTransaction(updated)
    return { transaction: updated, partner: null }
  }

  const partner = findTransferPartner(store, transaction)
  if (!partner) {
    throw new Error(
      `Transaction is part of a transfer whose other leg cannot be found: ${transactionId}. ` +
        'Unlink it first.'
    )
  }

  const updatedPartner: Transaction = {
    ...partner,
    ...(changes.amount !== undefined && { amount: -updated.amount }),
    transferAccountId: updated.accountId,
  }
  updated.transferAccountId = updatedPartner.accountId

  assertValidTransferPair(store, updated, updatedPartner)

  store.saveTransaction(updated)
  store.saveTransaction(updatedPartner)

  return { transaction: updated, partner: updatedPartner }
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
 * Whether a transaction should move its category's activity.
 *
 * The receiving leg of a transfer between two on-budget accounts is not new money -
 * it is money that is already in the budget arriving somewhere else. It is kept out
 * of Ready to Assign by countsAsIncome, so counting it as category activity as well
 * would conjure spendable money out of nothing.
 *
 * Outflows always count, including the categorised leg of a transfer to an
 * off-budget account: that money really is leaving the budget.
 */
export function countsAsCategoryActivity(store: Store, transaction: Transaction): boolean {
  if (transaction.amount <= 0) return true
  return countsAsIncome(store, transaction)
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
 *
 * Goes through updateTransaction, so a transfer leg cannot be categorised into a
 * state createTransfer would refuse.
 */
export function reassignTransaction(
  store: Store,
  transactionId: string,
  categoryId: string | null
): Transaction | null {
  if (!store.getTransaction(transactionId)) return null

  return updateTransaction(store, transactionId, { categoryId }).transaction
}
