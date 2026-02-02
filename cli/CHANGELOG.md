# @budget/cli

## [Unreleased]

### Changed

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
