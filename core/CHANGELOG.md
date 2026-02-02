# @budget/core

## [Unreleased]

### Added

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
