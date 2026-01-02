# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-01-02

## [0.2.0] - 2026-01-02

### Core

#### Added

- **Multi-month Navigation** - Navigate between past, current, and future budget months
- **Category Balance Carryover** - Automatic calculation and storage of monthly closing balances
- **MonthSummary Schema** - New data model for storing monthly budget snapshots
- **Inherited Allocations** - Look back through all months to find last assignment for categories

#### Fixed

- Ready to Assign calculation now includes assignments from all historical months
- Assignment lookups now use earliest transaction year as start point

### Webapp

#### Added

- **React Budget Application** - Full-featured web UI for budget management
  - Budget table with inline editing for category assignments
  - Transaction list with add/edit/delete functionality
  - Multi-month navigation with prev/next and "Today" buttons
  - Import/export budget data as JSON (format version 0.1)
- **Accessibility Features**
  - Keyboard shortcuts: `?` (help), `Escape` (close), `n` (new transaction), `t` (today), `←/→` (navigate months)
  - Focus trap and restoration for modal dialogs
  - ARIA labels and roles throughout the application
  - WCAG AA compliant text contrast
- **UI Components**
  - Toast notifications for success/error feedback
  - Confirmation dialogs (replacing browser alerts)
  - LoadingButton with spinner for async operations
  - Keyboard shortcuts help modal
- **Visual Design**
  - CSS design tokens for consistent animations and transitions
  - Dark mode support for all components
  - Slide-in animations for table rows
  - Trash icons for delete actions
  - Active/pressed button states
  - Visual edit mode indicator for cells
- **Data Safety**
  - Browser warning before leaving with unsaved changes (beforeunload)
  - Dirty state tracking cleared on export
- **PWA Support**
  - Comprehensive favicon suite (SVG, ICO, PNG, Apple Touch, Android Chrome, Windows tiles)
  - Web app manifest with installable icons

#### Fixed

- Category balance carryover now calculates correctly across months
- Import validation checks item structure, not just array existence
- Toast dark mode styling
- CategoryRow memoization for performance
- Amount input layout in transaction modal
- Row action button alignment

## [0.1.1] - 2025-12-30

## [0.1.0] - 2025-12-30

### Added

- Core library with domain models (Budget, Account, Category, Transaction, Assignment)
- SQLite storage with sql.js for persistent data
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

[Unreleased]: https://github.com/thgaskell/budget/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/thgaskell/budget/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/thgaskell/budget/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/thgaskell/budget/releases/tag/v0.1.0
