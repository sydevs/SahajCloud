#!/bin/bash
#
# Validate a Payload schema migration before applying it.
#
# Usage:
#   .claude/skills/migration-validator/validate.sh           # Validate newest migration
#   .claude/skills/migration-validator/validate.sh <file>    # Validate specific file

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
MIGRATIONS_DIR="$PROJECT_DIR/src/migrations"

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

pass() { echo "✓ PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
warn() { echo "⚠ WARN: $1"; WARN_COUNT=$((WARN_COUNT + 1)); }
fail() { echo "✗ FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# --- 1. Resolve target file ---

if [[ $# -ge 1 ]]; then
  MIGRATION="$1"
  [[ "$MIGRATION" != /* ]] && MIGRATION="$PROJECT_DIR/$MIGRATION"
else
  # Newest .ts file in migrations dir, excluding index.ts
  MIGRATION=$(ls -t "$MIGRATIONS_DIR"/*.ts 2>/dev/null | grep -v '/index\.ts$' | head -1)
fi

if [[ -z "${MIGRATION:-}" || ! -f "$MIGRATION" ]]; then
  echo "No migration file found at: ${MIGRATION:-(none)}"
  exit 2
fi

REL=$(realpath --relative-to="$PROJECT_DIR" "$MIGRATION" 2>/dev/null || echo "$MIGRATION")
echo "=== Validating: $REL ==="
echo

# --- 2. Matching .json snapshot ---

SNAPSHOT="${MIGRATION%.ts}.json"
if [[ -f "$SNAPSHOT" ]]; then
  pass "matching .json snapshot exists ($(basename "$SNAPSHOT"))"
else
  fail "no matching .json snapshot — schema diff for the next migration will be wrong"
fi

# --- 3. up / down exports ---

if grep -qE '^export async function up\b' "$MIGRATION"; then
  pass "exports \`up\` function"
else
  fail "missing \`export async function up\` — migration will not apply"
fi

if grep -qE '^export async function down\b' "$MIGRATION"; then
  pass "exports \`down\` function (reversible)"
else
  warn "missing \`export async function down\` — migration is one-way (no rollback)"
fi

# --- 4. TypeScript syntax check ---

echo
echo "--- Running tsc --noEmit on migration ---"
if (cd "$PROJECT_DIR" && pnpm tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck "$MIGRATION" 2>&1 | tee /tmp/migration-validator-tsc.log | grep -qE 'error TS'); then
  fail "TypeScript errors in migration (see output above)"
else
  pass "TypeScript compiles cleanly"
fi
echo

# --- 5. Data-loss patterns ---

if grep -qiE 'DROP TABLE' "$MIGRATION"; then
  warn "contains DROP TABLE — confirm data is no longer needed"
fi
if grep -qiE 'DROP COLUMN|ALTER TABLE.*DROP' "$MIGRATION"; then
  warn "contains DROP COLUMN — confirm data is no longer needed"
fi
if grep -qiE 'RENAME COLUMN|RENAME TO' "$MIGRATION"; then
  warn "contains RENAME — confirm coordinated with deploy (old code may read the old name during apply)"
fi
if ! grep -qiE 'DROP|RENAME' "$MIGRATION"; then
  pass "no DROP/RENAME patterns detected"
fi

# --- 6. D1 PRAGMA foreign_keys gotcha (child-then-parent rebuild) ---

# Heuristic: warn if the migration does multiple CREATE TABLE / DROP TABLE sequences
# (often a sign of table-rebuild migrations) AND uses `db.run` more than 4 times.
# This is approximate — manual review is required for actual safety.

CREATE_TABLE_COUNT=$(grep -ciE 'CREATE TABLE' "$MIGRATION" || true)
DROP_TABLE_COUNT=$(grep -ciE 'DROP TABLE' "$MIGRATION" || true)
DB_RUN_COUNT=$(grep -cE 'db\.run\(' "$MIGRATION" || true)

if [[ "$CREATE_TABLE_COUNT" -gt 1 && "$DROP_TABLE_COUNT" -gt 1 ]]; then
  warn "multiple CREATE TABLE + DROP TABLE — likely a table-rebuild migration. D1 does NOT honor PRAGMA foreign_keys=OFF across db.run() calls. Verify parent tables rebuild BEFORE child tables, or batch into a single SQL transaction. See [feedback_d1_pragma_foreign_keys] memory."
fi

# --- 7. Hardcoded secrets ---

if grep -qiE '(password|secret|token|api[_-]?key)[[:space:]]*[:=][[:space:]]*["'\''][^"'\'']{8,}["'\'']' "$MIGRATION"; then
  warn "possible hardcoded secret pattern detected — review and verify it's not a real credential"
fi

# --- 8. Summary ---

echo
echo "=== Summary ==="
echo "  Pass:  $PASS_COUNT"
echo "  Warn:  $WARN_COUNT"
echo "  Fail:  $FAIL_COUNT"
echo

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "❌ FAIL — fix issues before applying this migration."
  exit 1
elif [[ "$WARN_COUNT" -gt 0 ]]; then
  echo "⚠️  WARN — review warnings carefully. Get user sign-off if any are non-obvious."
  exit 0
else
  echo "✓ All checks passed."
  exit 0
fi
