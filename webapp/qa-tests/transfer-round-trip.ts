/**
 * Transfer round-trip QA script
 *
 * Exercises the real TransactionModal save path against a real MemoryStore,
 * using budget-v2.json (a schema-2 derivation of the v1 export in the task
 * fixture — same data, plus an explicit `transferId` on the three transfer
 * pairs that can be paired without guessing).
 *
 * Checks, in order:
 *   1. store.fromJSON() accepts the fixture.
 *   2. Editing a transfer leg's memo through the modal's own <form> submit
 *      handler preserves that leg's transferId and transferAccountId.
 *   3. Saving that result the way BudgetContext.updateTransaction does, then
 *      exporting, still carries transferId on every transaction.
 *
 * The modal is mounted for real (happy-dom + react-dom/client) rather than
 * re-implemented, so this fails if TransactionModal stops carrying the field.
 *
 * Run: bun run qa:transfer   (from webapp/)
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()
// react-dom needs this to accept act() outside a test runner
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { createElement } = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = await import('react')
const { MemoryStore } = await import('@budget/core')
const { TransactionModal } = await import('../src/components/TransactionModal.tsx')

import type { Transaction, Account, Category, Payee, StoreExportData } from '@budget/core'

const fixture = (await import('./budget-v2.json', { with: { type: 'json' } }))
  .default as unknown as StoreExportData

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// --- 1. import -------------------------------------------------------------
console.log('\n1. import budget-v2.json via MemoryStore.fromJSON()')
const store = new MemoryStore()
store.fromJSON(fixture)

const budget = store.listBudgets()[0]!
const accounts: Account[] = store.listAccounts(budget.id)
const categories: Category[] = store.listCategories(budget.id)
const payees: Payee[] = store.listPayees(budget.id)
const imported: Transaction[] = accounts.flatMap((a) => store.listTransactions(a.id))

check('fixture schemaVersion is 2', fixture.schemaVersion === 2, `got ${fixture.schemaVersion}`)
check('all 15 transactions imported', imported.length === 15, `got ${imported.length}`)
check(
  'every imported transaction has a transferId property',
  imported.every((t) => 'transferId' in t),
)
const linked = imported.filter((t) => t.transferId !== null)
check('6 legs imported with an explicit partner id', linked.length === 6, `got ${linked.length}`)
check(
  'every linked leg round-trips to its partner (A->B implies B->A)',
  linked.every((t) => store.getTransaction(t.transferId!)?.transferId === t.id),
)

// --- 2. edit a transfer leg's memo through the real modal -------------------
console.log("\n2. edit a transfer leg's memo through TransactionModal's save path")
const leg = store.getTransaction('00000000-0000-4000-8000-tx0008000000')!
check('chosen leg is a linked transfer leg', leg.transferId !== null && leg.transferAccountId !== null)
console.log(
  `     before: memo=${JSON.stringify(leg.memo)} transferId=${leg.transferId} ` +
    `transferAccountId=${leg.transferAccountId}`,
)

const container = document.createElement('div')
document.body.appendChild(container)
const root = createRoot(container)

let saved: Transaction | null = null
await act(async () => {
  root.render(
    createElement(TransactionModal, {
      transaction: leg,
      categories,
      accounts,
      payees,
      onSave: (t: Transaction) => {
        saved = t
      },
      onClose: () => {},
      onAddPayee: (name: string) => ({ id: 'unused', budgetId: budget.id, name }) as Payee,
    }),
  )
})

// Type the new memo into the real input, then submit the real form.
const memoInput = container.querySelector('#memo') as HTMLInputElement
const NEW_MEMO = 'Emergency fund (edited by QA)'
await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(
    globalThis.HTMLInputElement.prototype,
    'value',
  )!.set!
  setter.call(memoInput, NEW_MEMO)
  memoInput.dispatchEvent(new Event('input', { bubbles: true }))
})
await act(async () => {
  container.querySelector('form')!.dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  )
})

const savedTxn = saved as Transaction | null
check('modal called onSave', savedTxn !== null)
if (savedTxn) {
  console.log(
    `     after:  memo=${JSON.stringify(savedTxn.memo)} transferId=${savedTxn.transferId} ` +
      `transferAccountId=${savedTxn.transferAccountId}`,
  )
  check('memo was actually edited', savedTxn.memo === NEW_MEMO, JSON.stringify(savedTxn.memo))
  check('same transaction id', savedTxn.id === leg.id)
  check(
    'transferId preserved',
    savedTxn.transferId === leg.transferId,
    `${savedTxn.transferId} vs ${leg.transferId}`,
  )
  check(
    'transferAccountId preserved',
    savedTxn.transferAccountId === leg.transferAccountId,
    `${savedTxn.transferAccountId} vs ${leg.transferAccountId}`,
  )
}

// --- 3. persist the way the app does, then export --------------------------
console.log('\n3. save via store.saveTransaction() (as BudgetContext does) and export')
if (savedTxn) store.saveTransaction(savedTxn)

const exported = store.toJSON()
const exportedTxns = exported.budgets.flatMap((b) => b.transactions)

check('export schemaVersion is 2', exported.schemaVersion === 2, `got ${exported.schemaVersion}`)
check('export still has 15 transactions', exportedTxns.length === 15, `got ${exportedTxns.length}`)
check(
  'every exported transaction carries a transferId key',
  exportedTxns.every((t) => 'transferId' in t),
  `${exportedTxns.filter((t) => 'transferId' in t).length}/${exportedTxns.length}`,
)
check(
  'exported JSON keeps transferId through JSON.stringify',
  JSON.parse(JSON.stringify(exported)).budgets[0].transactions.every(
    (t: Record<string, unknown>) => 'transferId' in t,
  ),
)

const reExported = exportedTxns.find((t) => t.id === leg.id)!
check('edited leg kept its new memo in the export', reExported.memo === NEW_MEMO)
check('edited leg kept transferId in the export', reExported.transferId === leg.transferId)
check('edited leg kept transferAccountId in the export', reExported.transferAccountId === leg.transferAccountId)
check(
  "the partner leg still points back at the edited leg",
  exportedTxns.find((t) => t.id === leg.transferId)!.transferId === leg.id,
)
check(
  'the four ambiguous 2026-08-10 legs are still unlinked',
  exportedTxns.filter((t) => t.date === '2026-08-10').every((t) => t.transferId === null),
)

// --- 4. the export is re-importable ---------------------------------------
console.log('\n4. re-import the export (schema 2 round-trip)')
const store2 = new MemoryStore()
store2.fromJSON(JSON.parse(JSON.stringify(exported)))
const reimported = store2
  .listAccounts(store2.listBudgets()[0]!.id)
  .flatMap((a) => store2.listTransactions(a.id))
check('re-import produced 15 transactions', reimported.length === 15, `got ${reimported.length}`)
check(
  're-imported legs kept their transferId',
  reimported.filter((t) => t.transferId !== null).length === 6,
)

await act(async () => {
  root.unmount()
})

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
