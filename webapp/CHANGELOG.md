# @budget/webapp

## [Unreleased]

### Changed

- **Exports are schema version 2, and older files still open** - transactions now
  carry `transferId`, the other leg of a transfer, through import, editing and
  export. A file exported by an earlier version (schema 1) is upgraded on import
  rather than refused; its transfers keep their accounts but are not paired, and a
  file from a newer version is refused with a message saying so
- **Unified Export Format** - Export now uses `store.toJSON()` for complete data including all transactions, schemaVersion, and monthSummaries (previously only exported current month's transactions)
- **Unified Import Format** - Import now uses `store.fromJSON()` with `StoreExportData` type from `@budget/core` for cross-platform compatibility with CLI

### Added

- **Transfer round-trip QA script** - `bun run qa:transfer` mounts the real transaction modal against a schema-2 fixture (`qa-tests/budget-v2.json`) and checks that import, a memo edit through the modal's save path, and export all preserve `transferId` and `transferAccountId`.

### Removed

- Custom `BudgetExportData` type (replaced by `StoreExportData` from `@budget/core`)

## [0.1.0] - 2026-01-02

### Added

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
- Configurable base URL for deployment

### Fixed

- Category balance carryover now calculates correctly across months
- Import validation checks item structure, not just array existence
- Toast dark mode styling
- CategoryRow memoization for performance
- Amount input layout in transaction modal
- Row action button alignment
