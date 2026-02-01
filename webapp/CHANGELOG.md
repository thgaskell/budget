# @budget/webapp

## [Unreleased]

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
