# @budget/core

## [Unreleased]

## [0.4.0] - 2026-09-04

### Added

- **Transfer linking** - A transfer is now two transactions that name each other.
  `Transaction.transferId` holds the other leg's id alongside `transferAccountId`, is
  carried by both store backends and by the JSON export format, and is the only thing a
  partner lookup reads: `findTransferPartner()` returns the recorded leg or null, never
  a row matched on account, amount or date - two identical same-day transfers cannot be
  told apart that way
  - `createTransfer()` writes both ids before saving either leg, accepts an optional
    `categoryId` for the on-budget leg of a transfer that crosses the budget boundary,
    and rejects a transfer whose source and destination are the same account
  - `linkTransactions()` pairs two transactions that already exist - for imports, where
    both legs land before the pair is recognised - and `unlinkTransaction()` clears
    both sides, leaving the rows intact. The legs must offset exactly; their dates may
    differ, since bank exports often date the two sides apart
  - `assertValidTransferPair()` is the one rule every pair satisfies, shared by
    `createTransfer()`, `linkTransactions()` and `updateTransaction()`: different
    accounts in the same budget, amounts that mirror, and a category only on the
    on-budget leg of a transfer that leaves the budget
  - Schema migration 002 adds the `transfer_id` column. Rows written before it keep
    `transferId = null` - nothing is paired retroactively, because inferring a partner
    from account, amount and date is the guess `transferId` exists to remove
- **`updateTransaction()`** - Transfer-aware edit path. A new amount is mirrored onto
  the other leg and moving a leg to another account repoints its partner, so an edit
  cannot leave a pair half-changed. Edits that cannot break the pair (payee, memo,
  cleared, date) leave the partner alone; an edit that would - a category on an
  on-budget-to-on-budget leg, a zero amount - is refused with the reason
- **`countsAsIncome()`** and **`countsAsCategoryActivity()`** - The single rules for
  whether an inflow reaches Ready to Assign and whether a transaction moves its
  category's activity, used by every calculation that previously had its own loop
- **`upgradeExportData(data, migrations)`** - Upgrades an exported JSON document to the
  latest schema version, the counterpart of `runMigrations()` for data held in a file.
  Every `Migration` carries both halves of its change, `up()` for a database and
  `upgradeJson()` for an export; omitting the latter is a type error and a
  `MigrationValidationError`, so no version can migrate the database and leave
  exported files behind
- **Database Migrations** - TypeScript migration system with zod validation
  - Sequential version validation (no gaps allowed)
  - Atomic transactions (all-or-nothing per migrate call)
  - Transaction logging with `MigrationLogEntry` for debugging
  - Staged migrations with `{ to: version }` option
- **Portable JSON Export** - `toJSON()`/`fromJSON()` on Store interface for cross-platform data transfer (CLI ↔ Webapp)
- **Schema Version Tracking** - `getSchemaVersion()` on all stores
- **Manual Migration Control** - `SqliteStore.createUnmigrated()` for explicit migration handling
- **Migration Utilities** - `runMigrations()`, `getPendingMigrations()`, `getLatestVersion()`, `validateMigrations()`

### Changed

- **`fromJSON()` upgrades an older export instead of rejecting it** - both stores
  accepted only the current `schemaVersion`. With schema 2 the first bump, every file
  exported so far is schema 1; `fromJSON()` now runs it through `upgradeExportData()`
  on the way in. Upgrading a schema 1 file sets `transferId` to null on every
  transaction and pairs nothing - legs keep their `transferAccountId` and stay
  transfers for the budget rules; re-pairing is the user's call, by id. A file from a
  *newer* version is still refused, saying that the library is what is out of date.
  The caller's object is not modified
- **`deleteTransactionWithTransfer()` deletes the recorded partner, or refuses** - it
  found the other leg by scanning the partner account for a row with the same date,
  which picks the wrong leg when two transfers share accounts and a date, and silently
  left half a transfer when nothing matched. It now deletes the leg named by
  `transferId`. A leg whose partner was never recorded (a database upgraded from
  schema 1) is refused rather than guessed at, with a message naming the leg and the
  unlink-then-link steps that record the pair; `updateTransaction()` refuses the same
  leg for amount, account and category changes, and `unlinkTransaction()` clears it
  on its own
- **`reassignTransaction()`** goes through `updateTransaction()`, so categorising a
  transfer leg is held to the same rule as `createTransfer()` and throws where it
  used to write an invalid pair
- `sql.js` is declared as a dependency of `@budget/core` rather than resolved through
  workspace hoisting, and node builtins are imported with the `node:` prefix, so the
  package resolves under runtimes and resolvers other than bun

### Fixed

- **Transfers no longer count as income** - Ready to Assign included the inflow leg of
  a transfer between two on-budget accounts, inflating it by the full amount of every
  transfer. Moving $500 from checking to savings added $500 of income that did not
  exist; a credit-card payment added the payment. `getReadyToAssign()` and both
  month-summary inflow paths now exclude an inflow whose transfer counterpart is
  on-budget, so cached summaries and live calculations agree.
  - An inflow from an **off-budget** account still counts as income - that money is
    entering the budget for the first time
- **Category activity no longer counts money that never entered the budget** - the
  per-category activity loops in `calculateMonthSummary()`, `getMonthData()`,
  `getCategoryBalances()` and `getCumulativeCategoryAvailable()` summed every
  transaction carrying the category, including the inflow leg of a transfer between two
  on-budget accounts. That leg is excluded from Ready to Assign, so counting it as
  activity created spendable money out of nothing: a categorised $500 transfer leg
  raised the category's available from $200 to $700. All four now go through
  `countsAsCategoryActivity()`, which repairs the figures for databases that already
  hold such a row. Outflows still count, including the categorised leg of a transfer to
  an off-budget account
- TypeScript control flow analysis error in migration runner catch block

## [0.3.0] - 2026-01-04

No changes. The version was bumped in step with the unified v0.3.0 release, whose
only content was the CLI's `budget update` command; the `@budget/cli@0.3.0` binaries
bundle this package unchanged from 0.2.0.

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
