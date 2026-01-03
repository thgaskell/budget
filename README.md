# Budget CLI

A command-line personal budget management tool using envelope-based budgeting (YNAB-style).

## Features

- **Envelope Budgeting**: Assign every dollar a job
- **Category Management**: Organize spending into groups and categories
- **Transaction Tracking**: Record income and expenses
- **Monthly Budgets**: Plan and track spending month by month
- **Carryover**: Unspent money rolls forward; overspending creates debt to cover
- **Multiple Output Formats**: Human-readable tables, JSON, or minimal output

## Requirements

- [Bun](https://bun.sh/) v1.0 or later

## Installation

### Prebuilt Binaries

Download the latest release for your platform from the [Releases page](https://github.com/thgaskell/budget/releases).

Available binaries:
- `budget-linux-x64` - Linux (x86_64)
- `budget-linux-arm64` - Linux (ARM64)
- `budget-darwin-x64` - macOS (Intel)
- `budget-darwin-arm64` - macOS (Apple Silicon)
- `budget-windows-x64.exe` - Windows (x86_64)

**macOS users:** Downloaded binaries are quarantined by Gatekeeper. Remove the quarantine attribute before running:

```bash
xattr -cr ./budget-darwin-arm64
chmod +x ./budget-darwin-arm64
```

### From Source

```bash
# Clone the repository
git clone https://github.com/thgaskell/budget.git
cd budget

# Install dependencies
bun install

# Build the CLI executable
cd cli
bun run build

# The executable is now at cli/dist/budget
```

### Add to PATH (Optional)

```bash
# Add to your shell profile (~/.bashrc, ~/.zshrc, etc.)
export PATH="$PATH:/path/to/budget/cli/dist"

# Or create a symlink
ln -s /path/to/budget/cli/dist/budget /usr/local/bin/budget
```

## Quick Start

```bash
# Create your first budget
budget create "My Budget"

# Set it as active
budget use "My Budget"

# Add a checking account
budget account add "Checking" --type checking

# Create category groups
budget group add "Bills"
budget group add "Living"
budget group add "Savings"

# Create categories
budget category add "Rent" --group "Bills"
budget category add "Utilities" --group "Bills"
budget category add "Groceries" --group "Living"
budget category add "Emergency Fund" --group "Savings"

# Add income
budget tx add --account "Checking" --amount 3000 --payee "Employer"

# Assign money to categories
budget assign "Rent" 1200
budget assign "Utilities" 150
budget assign "Groceries" 400
budget assign "Emergency Fund" 500

# Check your budget status
budget status

# Record spending
budget tx add --account "Checking" --amount -85.50 --payee "Grocery Store" --category "Groceries"

# See updated status
budget status
```

## Documentation

- [Getting Started Guide](docs/GETTING_STARTED.md) - Detailed walkthrough with examples

## Command Reference

### Budget Management

| Command | Description |
|---------|-------------|
| `budget create <name>` | Create a new budget |
| `budget list` | List all budgets |
| `budget use <name>` | Set the active budget |
| `budget show` | Show active budget details |
| `budget delete <id>` | Delete a budget |

### Account Management

| Command | Description |
|---------|-------------|
| `budget account add <name> --type <type>` | Create an account (checking, savings, credit, cash, tracking) |
| `budget account list` | List all accounts with balances |
| `budget account show <name>` | Show account details |
| `budget account delete <id>` | Delete an account |

### Transactions

| Command | Description |
|---------|-------------|
| `budget tx add --account <name> --amount <amount> --payee <name> [--category <name>] [--date <date>]` | Add a transaction |
| `budget tx list [--account <name>] [--limit <n>]` | List transactions |
| `budget tx show <id>` | Show transaction details |
| `budget tx edit <id> [options]` | Edit a transaction |
| `budget tx delete <id>` | Delete a transaction |

### Categories

| Command | Description |
|---------|-------------|
| `budget group add <name>` | Create a category group |
| `budget group list` | List all groups |
| `budget category add <name> --group <group>` | Create a category |
| `budget category list` | List all categories |

### Budget Allocation

| Command | Description |
|---------|-------------|
| `budget assign <category> <amount> [--month YYYY-MM]` | Assign money to a category |
| `budget move <from> <to> <amount>` | Move money between categories |
| `budget available` | Show Ready to Assign amount |
| `budget status [--month YYYY-MM]` | Show budget overview |

### Targets

| Command | Description |
|---------|-------------|
| `budget target set <category> --amount <amount> [--type <type>]` | Set a spending/savings target |
| `budget target show <category>` | Show target progress |
| `budget target clear <category>` | Remove a target |

## Global Options

| Option | Description |
|--------|-------------|
| `--db <path>` | Use a specific database file |
| `--json` | Output in JSON format |
| `--quiet` | Minimal output (IDs only) |
| `--help` | Show help |
| `--version` | Show version |

## Data Storage

By default, your budget data is stored at:
```
~/.budget/budget.sqlite
```

Use the `--db` flag to specify a different location:
```bash
budget --db ~/Documents/my-budget.sqlite list
```

## Development

```bash
# Run tests
bun run test

# Run feature tests
bun run features

# Type checking
bun run typecheck
```

## License

MIT
