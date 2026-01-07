#!/bin/bash
#
# db.sh - SQLite database management for Budget CLI development
#
# This script helps developers manage their local SQLite database when switching
# between branches or needing to reset data.
#
# Usage: ./scripts/db.sh <command> [options]
#

set -e

# Default database path (can be overridden with BUDGET_DB_PATH or --db flag)
DEFAULT_DB_PATH="${HOME}/.config/budget/store.db"
DB_PATH="${BUDGET_DB_PATH:-$DEFAULT_DB_PATH}"

# Colors for output (disabled if not a TTY)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Print usage information
usage() {
    cat << EOF
${BLUE}Budget Database Management Tool${NC}

${YELLOW}Usage:${NC}
    ./scripts/db.sh <command> [options]

${YELLOW}Commands:${NC}
    reset       Delete the database file so the app can recreate it fresh
    info        Show current database schema (tables and columns)
    backfill    Fix empty timestamps by setting them to current time

${YELLOW}Options:${NC}
    --db <path>     Use a specific database file (default: ${DEFAULT_DB_PATH})
    -y, --yes       Skip confirmation prompts
    -h, --help      Show this help message

${YELLOW}Environment Variables:${NC}
    BUDGET_DB_PATH  Override the default database path

${YELLOW}Examples:${NC}
    ./scripts/db.sh reset                    # Reset the default database
    ./scripts/db.sh reset --db ~/test.db     # Reset a specific database
    ./scripts/db.sh info                     # Show schema info
    ./scripts/db.sh backfill                 # Fix empty timestamps
    ./scripts/db.sh reset -y                 # Reset without confirmation

EOF
}

# Print error message and exit
error() {
    echo -e "${RED}Error:${NC} $1" >&2
    exit 1
}

# Print success message
success() {
    echo -e "${GREEN}$1${NC}"
}

# Print warning message
warn() {
    echo -e "${YELLOW}$1${NC}"
}

# Print info message
info() {
    echo -e "${BLUE}$1${NC}"
}

# Confirm an action with the user
confirm() {
    local message="$1"
    local response

    if [[ "$SKIP_CONFIRM" == "true" ]]; then
        return 0
    fi

    echo -e "${YELLOW}$message${NC}"
    read -r -p "Are you sure? [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            echo "Cancelled."
            exit 0
            ;;
    esac
}

# Check if database file exists
check_db_exists() {
    if [[ ! -f "$DB_PATH" ]]; then
        warn "Database file does not exist: $DB_PATH"
        return 1
    fi
    return 0
}

# Reset command - delete the database
cmd_reset() {
    info "Database path: $DB_PATH"
    echo

    if [[ ! -f "$DB_PATH" ]]; then
        warn "Database file does not exist. Nothing to reset."
        exit 0
    fi

    # Show database size
    local size
    size=$(du -h "$DB_PATH" | cut -f1)
    echo "Current database size: $size"

    confirm "This will delete the database at: $DB_PATH"

    rm "$DB_PATH"
    success "Database deleted successfully."
    echo "The app will create a fresh database on next run."
}

# Info command - show schema
cmd_info() {
    if ! check_db_exists; then
        exit 1
    fi

    info "Database: $DB_PATH"
    echo

    # Get database file size
    local size
    size=$(du -h "$DB_PATH" | cut -f1)
    echo "Size: $size"
    echo

    info "Tables and Columns:"
    echo "==================="
    echo

    # Get all tables
    local tables
    tables=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")

    if [[ -z "$tables" ]]; then
        warn "No tables found in database."
        exit 0
    fi

    for table in $tables; do
        echo -e "${GREEN}$table${NC}"
        # Get column info for each table
        sqlite3 "$DB_PATH" "PRAGMA table_info($table);" | while IFS='|' read -r cid name type notnull dflt_value pk; do
            local pk_marker=""
            local notnull_marker=""
            [[ "$pk" == "1" ]] && pk_marker=" [PK]"
            [[ "$notnull" == "1" ]] && notnull_marker=" NOT NULL"
            echo "  - $name ($type)$pk_marker$notnull_marker"
        done

        # Show row count
        local count
        count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $table;")
        echo "  Rows: $count"
        echo
    done
}

# Backfill command - fix empty timestamps
cmd_backfill() {
    if ! check_db_exists; then
        exit 1
    fi

    info "Database: $DB_PATH"
    echo

    # Tables that have timestamp columns
    local tables_with_timestamps=(
        "budgets"
        "accounts"
        "category_groups"
        "categories"
        "payees"
        "transactions"
        "targets"
        "assignments"
    )

    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

    info "Checking for empty timestamps..."
    echo

    local total_updated=0

    for table in "${tables_with_timestamps[@]}"; do
        # Check if table exists
        local exists
        exists=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';")

        if [[ -z "$exists" ]]; then
            continue
        fi

        # Check if columns exist
        local has_created_at
        local has_updated_at
        has_created_at=$(sqlite3 "$DB_PATH" "SELECT name FROM pragma_table_info('$table') WHERE name='created_at';")
        has_updated_at=$(sqlite3 "$DB_PATH" "SELECT name FROM pragma_table_info('$table') WHERE name='updated_at';")

        if [[ -z "$has_created_at" ]] && [[ -z "$has_updated_at" ]]; then
            continue
        fi

        # Count rows with empty timestamps
        local count_created=0
        local count_updated=0

        if [[ -n "$has_created_at" ]]; then
            count_created=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $table WHERE created_at = '' OR created_at IS NULL;")
        fi

        if [[ -n "$has_updated_at" ]]; then
            count_updated=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $table WHERE updated_at = '' OR updated_at IS NULL;")
        fi

        if [[ "$count_created" -gt 0 ]] || [[ "$count_updated" -gt 0 ]]; then
            echo -e "${GREEN}$table${NC}"
            [[ "$count_created" -gt 0 ]] && echo "  - created_at: $count_created empty rows"
            [[ "$count_updated" -gt 0 ]] && echo "  - updated_at: $count_updated empty rows"
        fi

        total_updated=$((total_updated + count_created + count_updated))
    done

    if [[ "$total_updated" -eq 0 ]]; then
        success "No empty timestamps found. Database is up to date."
        exit 0
    fi

    echo
    confirm "Update $total_updated empty timestamp fields to: $now"

    # Perform updates
    for table in "${tables_with_timestamps[@]}"; do
        local exists
        exists=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';")

        if [[ -z "$exists" ]]; then
            continue
        fi

        local has_created_at
        local has_updated_at
        has_created_at=$(sqlite3 "$DB_PATH" "SELECT name FROM pragma_table_info('$table') WHERE name='created_at';")
        has_updated_at=$(sqlite3 "$DB_PATH" "SELECT name FROM pragma_table_info('$table') WHERE name='updated_at';")

        if [[ -n "$has_created_at" ]]; then
            sqlite3 "$DB_PATH" "UPDATE $table SET created_at = '$now' WHERE created_at = '' OR created_at IS NULL;"
        fi

        if [[ -n "$has_updated_at" ]]; then
            sqlite3 "$DB_PATH" "UPDATE $table SET updated_at = '$now' WHERE updated_at = '' OR updated_at IS NULL;"
        fi
    done

    success "Timestamps updated successfully."
}

# Parse global options
SKIP_CONFIRM="false"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --db)
            DB_PATH="$2"
            shift 2
            ;;
        -y|--yes)
            SKIP_CONFIRM="true"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        reset|info|backfill)
            COMMAND="$1"
            shift
            break
            ;;
        *)
            error "Unknown option: $1\nRun './scripts/db.sh --help' for usage."
            ;;
    esac
done

# Handle remaining options after command
while [[ $# -gt 0 ]]; do
    case "$1" in
        --db)
            DB_PATH="$2"
            shift 2
            ;;
        -y|--yes)
            SKIP_CONFIRM="true"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            error "Unknown option: $1\nRun './scripts/db.sh --help' for usage."
            ;;
    esac
done

# Execute command
case "${COMMAND:-}" in
    reset)
        cmd_reset
        ;;
    info)
        cmd_info
        ;;
    backfill)
        cmd_backfill
        ;;
    "")
        usage
        exit 1
        ;;
    *)
        error "Unknown command: $COMMAND\nRun './scripts/db.sh --help' for usage."
        ;;
esac
