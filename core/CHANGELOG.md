# @budget/core

## [Unreleased]

### Fixed

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

- **Transfer Linking** - `linkTransactions()` and `unlinkTransaction()` set and clear
  `transferAccountId` on both legs of an existing pair
- **`findTransferPartner()`** - Shared partner lookup, matching legs on the same date or
  on offsetting amounts across different dates, since bank exports routinely date the
  two sides a day or two apart
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
