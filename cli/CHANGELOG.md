# @budget/cli

## [Unreleased]

### Added

- **Transfer Commands** - Move money between your own accounts without inventing income
  - `budget tx transfer --from <account> --to <account> --amount <amt>` creates both
    legs as a single linked transfer
  - `--category <id|name>` assigns the on-budget leg when the other side is a tracking
    account; rejected when both accounts are on-budget
  - `--date`, `--memo` and `--cleared` apply to both legs
  - Accounts resolve by ID or name, as elsewhere in `tx`
  - `budget tx link <id> <otherId>` links two transactions that already exist - for
    imports, where both legs land before the pair is recognised
  - `budget tx unlink <id>` clears the link on both sides, leaving the rows intact
  - `--json` output exposes `transferAccountId`

### Fixed

- **`tx edit` no longer corrupts a transfer** - it applied `--amount`, `--account` and
  `--category` to a linked leg with no awareness of its partner. Editing one leg of a
  $500 transfer to $900 left the other at -$500, so $400 existed with no income
  recorded and Ready to Assign stayed $0.00; `--account` left a stale transfer label
  whose partner a later `tx delete` then silently orphaned; `--category` on an
  on-budget-to-on-budget leg added $500 of spendable money to a category that no income
  ever entered. `tx edit` now goes through `updateTransaction()`: the other leg follows
  a new amount or account, and an edit that would break the pair - a category where
  both accounts are on-budget, a zero amount - is refused with the reason
- **`tx link` requires the two legs to offset exactly** - a same-date pair was accepted
  however mismatched, so linking -$100 to an unrelated $250 inflow hid $150 of real
  income from Ready to Assign

### Changed

- **Auto-migrate on Load** - CLI now uses `createUnmigrated()` and auto-migrates old databases with user notification (shows version transition and migration descriptions)
- **`tx delete` removes both legs of a transfer** - Deleting either side now deletes
  its partner and says so, instead of orphaning a half-transfer

## [0.3.0] - 2026-01-04

### Added

- **Self-update Command** - `budget update` checks GitHub releases for newer versions
  - Downloads and installs the latest binary for your platform
  - `--check` flag to only check without installing
  - `--force` flag to skip confirmation prompt
  - Automatic backup and restore on failure
  - Platform-aware binary selection (darwin/linux/windows, arm64/x64)

## [0.1.1] - 2025-12-30

### Changed

- Load CLI version dynamically from package.json

## [0.1.0] - 2025-12-30

### Added

- CLI application with Commander.js
- Budget management commands (create, list, use, show, delete)
- Account management (add, list, show, delete) with types: checking, savings, credit, cash, tracking
- Transaction tracking (add, list, show, edit, delete) with category assignment
- Category groups and categories for organizing spending
- Money assignment to categories with monthly budgets
- Move money between categories
- Monthly budget status view with carryover support
- Target/goal setting for categories
- Ready to Assign calculation for zero-based budgeting
- JSON output mode (--json) for scripting
- Quiet mode (--quiet) for minimal output
- Custom database path (--db) with per-database config isolation
- Compilable to standalone executable via `bun build --compile`
