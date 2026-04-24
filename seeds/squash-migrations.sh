#!/bin/bash
# squash-migrations.sh
# Collapse the src/migrations/ chain into one baseline migration — WITHOUT dropping prod data.
#
# Companion to seeds/reset-migrations.sh (which handles the destructive "fresh start" path).
#
# Strategy:
#   1. Dump prod schema (read-only).
#   2. Move existing migrations to src/migrations.bak as a safety net.
#   3. Pause for the operator to run `pnpm db:migrations:create` — this command is
#      interactive and hangs if piped/backgrounded (see AGENTS.md).
#   4. Apply the new baseline to a throwaway local D1 (backing up/restoring the
#      operator's .wrangler state so their dev DB stays intact).
#   5. Diff the local baseline schema against prod.
#   6. If diff is clean (or explicitly accepted), rewrite prod's payload_migrations
#      table in a single transaction. No DDL, no row data touched.
#
# Usage:
#   ./seeds/squash-migrations.sh [--dry-run]
#
# Options:
#   --dry-run    Stop after producing the schema diff; no prod writes, repo
#                state is restored before exit.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
MIGRATIONS_DIR="src/migrations"
BACKUP_DIR="src/migrations.bak"
DB_NAME="sahajcloud"            # prod binding (wrangler.toml top-level)
DB_NAME_DEV="sahajcloud-dev"    # dev binding (wrangler.toml [env.dev])
WRANGLER_STATE_BACKUP=".wrangler.squash-backup"
PROD_SCHEMA_FILE="prod-schema.sql"
BASELINE_SCHEMA_FILE="baseline-schema.sql"
DIFF_FILE="schema-drift.diff"
REWRITE_SQL_FILE="rewrite_payload_migrations.sql"

# Parse arguments
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo -e "${YELLOW}DRY RUN MODE - No prod writes, repo state will be restored${NC}\n"
fi

# Helpers
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

# Restore .wrangler on unexpected exit so the operator's dev DB is never stranded.
restore_wrangler_state() {
  if [[ -d "$WRANGLER_STATE_BACKUP" ]]; then
    log_warning "Restoring .wrangler from $WRANGLER_STATE_BACKUP"
    rm -rf .wrangler
    mv "$WRANGLER_STATE_BACKUP" .wrangler
  fi
}
trap restore_wrangler_state EXIT

# Step 0: Warning + pre-flight checklist
echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Migration squash — PRESERVES PROD DATA                        ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "This script will:"
echo "  1. Dump prod schema to $PROD_SCHEMA_FILE"
echo "  2. Move $MIGRATIONS_DIR to $BACKUP_DIR (safety net)"
echo "  3. Prompt you to generate a fresh baseline via pnpm db:migrations:create"
echo "  4. Apply the baseline to a throwaway local D1 (backs up .wrangler first)"
echo "  5. Diff the local baseline schema vs prod — $DIFF_FILE"
if [[ "$DRY_RUN" == false ]]; then
  echo "  6. Rewrite prod's payload_migrations table in a single transaction"
  echo "  7. Verify the rewrite"
else
  echo "  6. Restore repo state and exit (dry run)"
fi
echo ""
echo "Prerequisites (operator-confirmed):"
echo "  * Team Slack announcement posted ≥24h prior (skip if --dry-run)"
echo "  * No other open migration PRs (check: gh pr list --search migration)"
echo "  * Deploys paused for the cutover window (skip if --dry-run)"
echo ""

if [[ "$DRY_RUN" == false ]]; then
  confirm "Have you completed the prerequisites above?"
  confirm "Type 'y' again to confirm you want to proceed with the LIVE squash"
fi

# Step 1: Git sanity check
log_step "Step 1: Git working tree check"
if [[ -n "$(git status --porcelain)" ]]; then
  log_error "Working tree is dirty. Commit or stash first."
fi
echo "Working tree clean."

# Step 2: Dump prod schema (read-only)
log_step "Step 2: Dumping prod schema"
echo "Running: wrangler d1 export $DB_NAME --remote --no-data --output=$PROD_SCHEMA_FILE"
pnpm exec wrangler d1 export "$DB_NAME" --remote --no-data --output="$PROD_SCHEMA_FILE"
echo "Prod schema written to $PROD_SCHEMA_FILE ($(wc -l < "$PROD_SCHEMA_FILE") lines)"

# Step 3: Back up and clear existing migrations
log_step "Step 3: Backing up existing migrations"
if [[ -d "$BACKUP_DIR" ]]; then
  log_error "$BACKUP_DIR already exists. Remove it before re-running."
fi
git mv "$MIGRATIONS_DIR" "$BACKUP_DIR"
mkdir "$MIGRATIONS_DIR"
echo "export const migrations = []" > "$MIGRATIONS_DIR/index.ts"
echo "Moved $MIGRATIONS_DIR -> $BACKUP_DIR; created empty $MIGRATIONS_DIR/index.ts"

# Step 4: Pause for operator-interactive migrate:create
log_step "Step 4: Generate baseline migration"
echo ""
echo -e "${YELLOW}ACTION REQUIRED:${NC} pnpm db:migrations:create is interactive and cannot be"
echo "automated (it hangs when piped or backgrounded — see AGENTS.md)."
echo ""
echo "Open a NEW terminal in this repo and run:"
echo ""
echo -e "    ${GREEN}pnpm db:migrations:create${NC}"
echo ""
echo "When prompted for a migration name, enter:  initial_schema"
echo ""
echo "Wait until the new .ts + .json files appear in $MIGRATIONS_DIR,"
echo "then return here and press ENTER."
echo ""
read -p "Press ENTER once the baseline files exist..."

NEW_MIGRATION_TS=$(find "$MIGRATIONS_DIR" -name '*.ts' ! -name 'index.ts' | head -1)
if [[ -z "$NEW_MIGRATION_TS" ]]; then
  log_error "No new migration found in $MIGRATIONS_DIR — did migrate:create complete?"
fi
NEW_NAME=$(basename "$NEW_MIGRATION_TS" .ts)
if [[ ! -f "$MIGRATIONS_DIR/${NEW_NAME}.json" ]]; then
  log_error "Expected $MIGRATIONS_DIR/${NEW_NAME}.json to exist alongside the .ts file."
fi
echo "Detected new baseline: ${NEW_NAME}"

# Step 5: Wire up migrations/index.ts + fix unused vars (same as reset-migrations.sh)
log_step "Step 5: Wiring up src/migrations/index.ts"
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
sed -i '' 's/{ db, payload, req }/{ db, payload: _payload, req: _req }/g' "$MIGRATIONS_DIR/${NEW_NAME}.ts"
echo "Wrote $MIGRATIONS_DIR/index.ts with single entry: ${NEW_NAME}"
echo ""
log_warning "Before continuing, scan $MIGRATIONS_DIR/${NEW_NAME}.ts for the Drizzle"
log_warning "polymorphic-FK rewrite bug documented in AGENTS.md (look for __new_*_rels"
log_warning "INSERT/SELECT with a column that doesn't exist in the source table)."
confirm "Does the generated migration look clean?"

# Step 6: Apply baseline to throwaway local D1 and dump its schema
log_step "Step 6: Applying baseline to a throwaway local D1"
if [[ -d .wrangler ]]; then
  mv .wrangler "$WRANGLER_STATE_BACKUP"
  echo "Backed up .wrangler -> $WRANGLER_STATE_BACKUP"
fi

# Run the fresh migration locally. This creates a new empty .wrangler state with
# only the single baseline applied.
cross-env NODE_OPTIONS=--no-deprecation CLOUDFLARE_ENV=dev pnpm payload migrate

# Dump the local schema via wrangler. The --env=dev selects [env.dev], where the
# D1 binding is named "sahajcloud-dev" (see wrangler.toml).
pnpm exec wrangler d1 export "$DB_NAME_DEV" --env=dev --local --no-data --output="$BASELINE_SCHEMA_FILE"
echo "Baseline schema written to $BASELINE_SCHEMA_FILE ($(wc -l < "$BASELINE_SCHEMA_FILE") lines)"

# Restore operator's .wrangler
rm -rf .wrangler
if [[ -d "$WRANGLER_STATE_BACKUP" ]]; then
  mv "$WRANGLER_STATE_BACKUP" .wrangler
  echo "Restored operator's .wrangler state"
fi

# Step 7: Diff
log_step "Step 7: Schema drift diff"
# `diff` exits non-zero when files differ; we want to keep going and inspect.
diff <(sort "$PROD_SCHEMA_FILE") <(sort "$BASELINE_SCHEMA_FILE") > "$DIFF_FILE" || true

if [[ -s "$DIFF_FILE" ]]; then
  log_warning "Schema drift detected. Review $DIFF_FILE carefully before proceeding."
  echo ""
  echo "--- First 200 lines of diff ---"
  head -200 "$DIFF_FILE"
  echo "--- (see $DIFF_FILE for full output) ---"
  echo ""
  if [[ "$DRY_RUN" == false ]]; then
    confirm "Drift is present. Proceed with payload_migrations rewrite anyway?"
  fi
else
  echo -e "${GREEN}Schema diff is clean — baseline matches prod.${NC}"
fi

# Step 8: Dry-run exit path
if [[ "$DRY_RUN" == true ]]; then
  log_step "Dry run: restoring repo state"
  rm -rf "$MIGRATIONS_DIR"
  git mv "$BACKUP_DIR" "$MIGRATIONS_DIR"
  echo "Restored $MIGRATIONS_DIR from $BACKUP_DIR"
  echo ""
  echo -e "${GREEN}Dry run complete.${NC}"
  echo "  Diff:     $DIFF_FILE"
  echo "  Prod:     $PROD_SCHEMA_FILE"
  echo "  Baseline: $BASELINE_SCHEMA_FILE"
  echo ""
  echo "Next step: commit the tooling, then re-run without --dry-run to execute the live squash."
  exit 0
fi

# Step 9: Rewrite payload_migrations on prod (single transaction)
log_step "Step 9: Rewriting payload_migrations on prod"
confirm "Last chance — rewrite prod payload_migrations with single row '${NEW_NAME}'?"

# D1 rejects explicit BEGIN/COMMIT (Durable Objects own the transaction).
# Wrangler atomically coalesces the whole --file into a single write; if any
# statement fails the DB is rolled back. See
# https://developers.cloudflare.com/d1/configuration/transactions/
cat > "$REWRITE_SQL_FILE" <<SQL
DELETE FROM payload_migrations;
INSERT INTO payload_migrations (name, batch) VALUES ('${NEW_NAME}', 1);
SQL

echo "Executing SQL against prod D1:"
cat "$REWRITE_SQL_FILE"
echo ""
pnpm exec wrangler d1 execute "$DB_NAME" --remote --file="$REWRITE_SQL_FILE"
rm "$REWRITE_SQL_FILE"

# Step 10: Verify on prod
log_step "Step 10: Verifying prod state"
echo "payload_migrations contents:"
pnpm exec wrangler d1 execute "$DB_NAME" --remote \
  --command "SELECT COUNT(*) AS rows, name FROM payload_migrations GROUP BY name;"
echo ""
echo "Canary row count (meditations):"
pnpm exec wrangler d1 execute "$DB_NAME" --remote \
  --command "SELECT COUNT(*) AS meditations_total FROM meditations;"

# Step 11: Done — leave backup in place
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Migration squash completed successfully!             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps (operator):"
echo "  1. Smoke-test prod: admin login, sample API reads."
echo "  2. Once prod looks healthy, delete the safety net:"
echo "       rm -rf $BACKUP_DIR"
echo "  3. Commit the new baseline:"
echo "       git add $MIGRATIONS_DIR && git rm -r $BACKUP_DIR"
echo "       git commit -m \"chore(migrations): squash to single baseline\""
echo "  4. Remind the team to run, after pulling the squash commit:"
echo "       pnpm reset --local && pnpm payload migrate"
echo ""
