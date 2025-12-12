#!/bin/bash
# reset-migrations.sh
# Complete migration reset script for Cloudflare D1 + PayloadCMS
#
# WARNING: This script deletes ALL data in the production database.
#
# Usage:
#   ./.claude/scripts/reset-migrations.sh [--dry-run]
#
# Options:
#   --dry-run    Show what would be done without making changes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MIGRATIONS_DIR="src/migrations"
DB_NAME="sahajcloud"
TEMP_SQL_FILE="drop_all_tables.sql"

# Parse arguments
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}\n"
fi

# Helper functions
log_step() {
  echo -e "\n${BLUE}==>${NC} ${GREEN}$1${NC}"
}

log_warning() {
  echo -e "${YELLOW}WARNING: $1${NC}"
}

log_error() {
  echo -e "${RED}ERROR: $1${NC}"
  exit 1
}

confirm() {
  if [[ "$DRY_RUN" == true ]]; then
    return 0
  fi

  read -p "$1 (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
}

# Step 0: Warning and confirmation
echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  WARNING: This will DELETE ALL DATA in production database!   ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "This script will:"
echo "  1. Delete all migration files in $MIGRATIONS_DIR"
echo "  2. Reset migrations index to empty array"
echo "  3. Drop ALL tables in production D1 database"
echo "  4. Generate a fresh initial migration"
echo "  5. Deploy the migration to production"
echo ""

if [[ "$DRY_RUN" == false ]]; then
  confirm "Are you absolutely sure you want to proceed?"
  confirm "Type 'y' again to confirm you understand ALL DATA WILL BE LOST"
fi

# Step 1: Delete existing migration files
log_step "Step 1: Deleting existing migration files"

MIGRATION_FILES=$(find "$MIGRATIONS_DIR" -name "*.ts" -o -name "*.json" | grep -v "index.ts" || true)

if [[ -z "$MIGRATION_FILES" ]]; then
  echo "No migration files found to delete"
else
  echo "Files to delete:"
  echo "$MIGRATION_FILES" | while read -r file; do
    echo "  - $file"
  done

  if [[ "$DRY_RUN" == false ]]; then
    find "$MIGRATIONS_DIR" -name "*.ts" ! -name "index.ts" -delete
    find "$MIGRATIONS_DIR" -name "*.json" -delete
    echo "Migration files deleted"
  fi
fi

# Step 2: Reset migrations index
log_step "Step 2: Resetting migrations index"

if [[ "$DRY_RUN" == false ]]; then
  echo "export const migrations = []" > "$MIGRATIONS_DIR/index.ts"
  echo "Reset $MIGRATIONS_DIR/index.ts"
else
  echo "Would reset $MIGRATIONS_DIR/index.ts to empty array"
fi

# Step 3: Get list of tables and generate DROP SQL
log_step "Step 3: Generating DROP TABLE statements"

echo "Fetching table list from production database..."

TABLES_JSON=$(wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;" \
  2>/dev/null)

# Extract table names from JSON
TABLES=$(echo "$TABLES_JSON" | grep -o '"name": "[^"]*"' | sed 's/"name": "//g' | sed 's/"//g')

if [[ -z "$TABLES" ]]; then
  echo "No tables found in database (already empty?)"
else
  TABLE_COUNT=$(echo "$TABLES" | wc -l | tr -d ' ')
  echo "Found $TABLE_COUNT tables to drop"

  # Generate SQL file
  echo "PRAGMA foreign_keys=OFF;" > "$TEMP_SQL_FILE"

  echo "$TABLES" | while read -r table; do
    echo "DROP TABLE IF EXISTS \"$table\";" >> "$TEMP_SQL_FILE"
  done

  echo "PRAGMA foreign_keys=ON;" >> "$TEMP_SQL_FILE"

  echo "Generated $TEMP_SQL_FILE"
fi

# Step 4: Drop all tables
log_step "Step 4: Dropping all tables in production"

if [[ -f "$TEMP_SQL_FILE" ]]; then
  if [[ "$DRY_RUN" == false ]]; then
    echo "Executing DROP statements..."
    wrangler d1 execute "$DB_NAME" --remote --file="$TEMP_SQL_FILE"
    echo "All tables dropped"

    # Cleanup temp file
    rm -f "$TEMP_SQL_FILE"
  else
    echo "Would execute:"
    cat "$TEMP_SQL_FILE"
    rm -f "$TEMP_SQL_FILE"
  fi
else
  echo "No tables to drop"
fi

# Step 5: Verify database is empty
log_step "Step 5: Verifying database is empty"

REMAINING=$(wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';" \
  2>/dev/null | grep -o '"count": [0-9]*' | sed 's/"count": //')

if [[ "$REMAINING" == "0" ]]; then
  echo -e "${GREEN}Database is empty${NC}"
else
  log_warning "Database still has $REMAINING tables"
fi

# Step 6: Generate fresh initial migration
log_step "Step 6: Generating fresh initial migration"

if [[ "$DRY_RUN" == false ]]; then
  pnpm payload migrate:create

  # Find the newly created migration file
  NEW_MIGRATION=$(find "$MIGRATIONS_DIR" -name "*.ts" ! -name "index.ts" -newer "$MIGRATIONS_DIR/index.ts" | head -1)

  if [[ -n "$NEW_MIGRATION" ]]; then
    TIMESTAMP=$(basename "$NEW_MIGRATION" .ts)
    NEW_NAME="${TIMESTAMP}_initial_schema"

    # Rename files
    mv "$MIGRATIONS_DIR/${TIMESTAMP}.ts" "$MIGRATIONS_DIR/${NEW_NAME}.ts"
    mv "$MIGRATIONS_DIR/${TIMESTAMP}.json" "$MIGRATIONS_DIR/${NEW_NAME}.json"

    # Update index.ts
    cat > "$MIGRATIONS_DIR/index.ts" << EOF
import * as migration_${NEW_NAME} from './${NEW_NAME}'

export const migrations = [
  {
    up: migration_${NEW_NAME}.up,
    down: migration_${NEW_NAME}.down,
    name: '${NEW_NAME}',
  },
]
EOF

    # Fix unused variables in migration file
    sed -i '' 's/{ db, payload, req }/{ db, payload: _payload, req: _req }/g' "$MIGRATIONS_DIR/${NEW_NAME}.ts"

    echo "Created migration: ${NEW_NAME}"
  fi
else
  echo "Would generate new migration with pnpm payload migrate:create"
fi

# Step 7: Deploy to production
log_step "Step 7: Deploying migration to production"

if [[ "$DRY_RUN" == false ]]; then
  pnpm run deploy:database
else
  echo "Would run: pnpm run deploy:database"
fi

# Step 8: Verify
log_step "Step 8: Verifying migration"

echo "Checking payload_migrations table..."
wrangler d1 execute "$DB_NAME" --remote --command "SELECT * FROM payload_migrations;"

echo ""
echo "Counting tables..."
TABLE_COUNT=$(wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';" \
  2>/dev/null | grep -o '"count": [0-9]*' | sed 's/"count": //')

echo -e "${GREEN}Tables created: $TABLE_COUNT${NC}"

# Done
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Migration reset completed successfully!           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
