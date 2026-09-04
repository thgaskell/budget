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
    imports, where both legs land before the pair is recognised. The two must offset
    exactly; their dates may differ
  - `budget tx unlink <id>` clears the link on both sides, leaving the rows intact
  - `--json` output exposes `transferAccountId` and `transferId`

### Changed

- **`tx edit` follows a transfer to its other leg** - it saved the edited row on its
  own, so changing one leg of a $500 transfer to $900 left the other at -$500 and $400
  existed with no income recorded. A new `--amount` is now mirrored onto the partner
  and `--account` repoints it; `--payee`, `--memo`, `--date` and `--cleared` change
  only the leg named. An edit that would break the pair - a category where both
  accounts are on-budget, a zero amount - is refused with the reason
- **`tx delete` removes both legs of a transfer** - it deleted the one row and left
  its partner behind as half a transfer. Deleting either side now deletes the other
  and says so
- **Neither command touches a transfer whose other leg is not recorded** - transfers
  saved before schema v2 have no partner on file, and acting on a guess is how legs of
  the wrong transfer get deleted. `tx edit --amount/--account/--category` and
  `tx delete` fail on such a leg, naming it and telling you to run `tx unlink <id>`
  and then `tx link <id> <otherId>` to record the pair; edits that cannot break the
  pair still work, and `tx unlink` on such a leg clears that leg alone and says so
- **Auto-migrate on Load** - CLI now uses `createUnmigrated()` and auto-migrates old databases with user notification (shows version transition and migration descriptions)

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
