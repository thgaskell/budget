# @budget/core

## [Unreleased]

### Fixed

- **An export from an older schema version imports instead of being rejected** -
  `MemoryStore.fromJSON()` and `SqliteStore.fromJSON()` threw on any `schemaVersion`
  but the current one, and nothing existed to migrate a file with: `runMigrations()`
  only ever operated on a database. Schema 2 is the first bump this project has made,
  so on the day it shipped every budget anyone had exported - all of them schema 1 -
  became unimportable, the hosted webapp holding no copy of its own. `fromJSON()` now
  upgrades the document on the way in through `upgradeExportData()`, which walks the
  same migration list the database walks and stamps `schemaVersion` as it goes. A file
  from a *newer* version is still refused, now saying that the library is the thing
  that is out of date. The caller's object is not modified
- **Upgrading a version 1 export sets `transferId` to null on every transaction** -
  and pairs nothing. A version 1 file records a transfer only as `transferAccountId` on
  each leg, so recovering a pair from it would mean matching on account, amount and
  date - the guesswork `transferId` exists to remove, no more reliable in a file than
  in a table, and wrong in exactly the case that motivated the column: two identical
  transfers on the same day. Legs keep their `transferAccountId` and stay transfers for
  the budget rules; re-pairing is the user's call, by id, through `tx link`
- **A transfer pair is now recorded by transaction id, not searched for** -
  `findTransferPartner()` located the other leg by scanning the partner account for a
  row pointing back, preferring a mirrored amount and then the nearest date. Two $50
  Checking to Savings transfers on the same day are indistinguishable that way, so
  deleting one of them deleted a leg of the *other* pair and left two orphaned halves
  behind; `updateTransaction()` mirrored an amount onto the wrong leg and
  `unlinkTransaction()` unlinked it, all without an error. Each leg now stores its
  partner's id in the new `Transaction.transferId`, set only by `createTransfer()` and
  `linkTransactions()` - the two callers that name both transactions - so nothing is
  ever inferred from account, amount or date
- **A transfer leg with no resolvable partner is no longer acted on** - schema v2 adds
  `transfer_id` without backfilling it, since pairing existing rows would be the same
  guesswork under another name. Such a leg keeps its `transferAccountId`, so it is
  still kept out of Ready to Assign and category activity, but `updateTransaction()` on
  amount, account or category and `deleteTransactionWithTransfer()` now refuse it,
  naming the leg and the `tx unlink` / `tx link` pair of commands that record the two
  legs explicitly. `deleteTransactionWithTransfer()` previously deleted whichever row
  the search returned - including none, silently leaving half a transfer.
  `unlinkTransaction()` clears such a leg on its own
- TypeScript control flow analysis error in migration runner catch block
- **Category activity no longer counts money that never entered the budget** - the
  per-category activity loops in `calculateMonthSummary()`, `getMonthData()`,
  `getCategoryBalances()` and `getCumulativeCategoryAvailable()` summed every
  transaction carrying the category, including the inflow leg of a transfer between two
  on-budget accounts. That leg is excluded from Ready to Assign, so counting it as
  activity created spendable money out of nothing: a categorised $500 transfer leg
  raised the category's available from $200 to $700. All four now go through the new
  `countsAsCategoryActivity()`, which repairs the figures for databases that already
  hold such a row. Outflows still count, including the categorised leg of a transfer to
  an off-budget account
- **`linkTransactions()` requires legs that offset exactly** - the guard only rejected a
  pair when the dates differed *and* the amounts did not offset, so any same-date pair
  was accepted however mismatched. Linking a -$100 outflow to an unrelated $250 inflow
  was allowed and dropped Ready to Assign from $250.00 to $0.00, hiding $150 of genuine
  income. Dates may still differ - bank exports date the two sides apart - but the
  amounts must mirror
- **`reassignTransaction()` cannot categorise a transfer into an invalid state** - it
  now goes through `updateTransaction()`, so it enforces the same category rule as
  `createTransfer()`
- **Transfers no longer count as income** - Ready to Assign included the inflow leg of
  a transfer between two on-budget accounts, inflating it by the full amount of every
  transfer. Moving $500 from checking to savings added $500 of income that did not
  exist; a credit-card payment added the payment. `getReadyToAssign()` and both
  month-summary inflow paths now exclude an inflow whose transfer counterpart is
  on-budget, so cached summaries and live calculations agree.
  - An inflow from an **off-budget** account still counts as income - that money is
    entering the budget for the first time

### Added

- **`upgradeExportData(data, migrations)`** - Upgrades an exported JSON document to the
  latest schema version, the counterpart of `runMigrations()` for data held in a file.
  Every `Migration` now carries both halves of its change: `up()` for a database and
  `upgradeJson()` for an export. Omitting the latter is a type error and a
  `MigrationValidationError`, so no future version can migrate SQL alone and leave
  exported files unimportable
- **`Transaction.transferId`** - The other leg's transaction id, carried by both store
  backends and by the JSON export/import format. Schema migration 002 adds the column;
  rows written before it keep `transferId = null`
- **Transfer Linking** - `linkTransactions()` and `unlinkTransaction()` set and clear
  `transferAccountId` on both legs of an existing pair
- **`findTransferPartner()`** - Shared partner lookup, reading the id the leg records
  in `transferId`. Returns null when the partner was never recorded or its row is gone;
  legs are never matched by account, amount or date
- **`countsAsIncome()`** - Single rule for whether an inflow reaches Ready to Assign
- **`updateTransaction()`** - Transfer-aware edit path. A new amount is mirrored onto
  the other leg and moving a leg to another account repoints its partner, so an edit
  cannot leave a pair half-changed. Edits that cannot break the pair (payee, memo,
  cleared, date) leave the partner alone; a pair-changing edit on a leg whose partner
  cannot be resolved is refused rather than applied
- **`assertValidTransferPair()`** - The one rule every transfer pair satisfies, shared
  by `createTransfer()`, `linkTransactions()` and `updateTransaction()`: different
  accounts in the same budget, amounts that offset exactly, and a category only on the
  on-budget leg of a transfer that crosses the budget boundary
- **`countsAsCategoryActivity()`** - Single rule for whether a transaction moves its
  category's activity
- `createTransfer()` accepts an optional `categoryId` for the on-budget leg, and rejects
  a transfer where source and destination are the same account
- **Database Migrations** - TypeScript migration system with zod validation
  - Sequential version validation (no gaps allowed)
  - Atomic transactions (all-or-nothing per migrate call)
  - Transaction logging with `MigrationLogEntry` for debugging
  - Staged migrations with `{ to: version }` option
- **Portable JSON Export** - `toJSON()`/`fromJSON()` on Store interface for cross-platform data transfer (CLI ↔ Webapp)
- **Schema Version Tracking** - `getSchemaVersion()` on all stores
- **Manual Migration Control** - `SqliteStore.createUnmigrated()` for explicit migration handling
- **Migration Utilities** - `runMigrations()`, `getPendingMigrations()`, `getLatestVersion()`, `validateMigrations()`

## [0.2.0] - 2026-01-02

### Added

- **Multi-month Navigation** - Navigate between past, current, and future budget months
- **Category Balance Carryover** - Automatic calculation and storage of monthly closing balances
- **MonthSummary Schema** - New data model for storing monthly budget snapshots
- **Inherited Allocations** - Look back through all months to find last assignment for categories

### Fixed

- Ready to Assign calculation now includes assignments from all historical months
- Assignment lookups now use earliest transaction year as start point

## [0.1.0] - 2025-12-30

### Added

- Core library with domain models (Budget, Account, Category, Transaction, Assignment)
- SQLite storage with sql.js for persistent data
