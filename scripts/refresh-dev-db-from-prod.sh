#!/bin/bash
#
# Replace this checkout's local dev database with a fresh copy of production.
#
# Production is only read: pg_dump runs in a read-only transaction. The target
# must be a local Postgres, so a DATABASE_URL pointing at Railway is refused.
# The dump holds real people's data, so it lives in a private temp folder that
# is deleted on exit.
#
# The target is whatever DATABASE_URL resolves to here — shell, then
# .env.local, then .env, the precedence the app uses — so it is the database
# `pnpm dev` and the CLI already share.
#
# Usage:  pnpm db:refresh-from-prod            # dry run: show source and target
#         pnpm db:refresh-from-prod --force    # replace the target database
#
# Needs: Postgres client tools at least as new as prod's server (macOS:
# `brew install libpq`, then add /opt/homebrew/opt/libpq/bin to PATH), and a
# logged-in Railway CLI with access to the sahajcloud project.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

RAILWAY_PROJECT_ID="${RAILWAY_PROJECT_ID:-bdff2c72-5af2-4da3-9e2c-913f5e9d1b0f}"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

die() { echo "refresh-from-prod: $*" >&2; exit 1; }

for bin in pg_dump pg_restore psql createdb dropdb railway node; do
  command -v "$bin" >/dev/null || die "$bin not found on PATH (see the header of $0)"
done

# One parse, the app's own precedence (dotenv never overrides a set key).
# JOBS_AUTORUN_ENABLED comes out of the same parse so the value reported and the
# value enforced cannot differ. The two-token test mirrors the transform in
# src/lib/env/server.ts, which this script cannot import: it is TypeScript, and
# reading it would validate every other required variable as a side effect.
{ read -r TARGET_HOST; read -r TARGET_DB; read -r ADMIN_URL; read -r STAGING_URL
  read -r AUTORUN_STATE; } < <(node -e '
  require("dotenv").config({ path: [".env.local", ".env"], quiet: true })
  const raw = process.env.DATABASE_URL
  if (!raw) process.exit(1)
  const url = new URL(raw)
  const db = decodeURIComponent(url.pathname.slice(1))
  const at = (name) => Object.assign(new URL(raw), { pathname: "/" + name }).toString()
  const flag = process.env.JOBS_AUTORUN_ENABLED?.trim().toLowerCase()
  const autoRun = flag === "false" || flag === "0" ? "off" : "on"
  console.log([url.hostname, db, at("postgres"), at(db + "_incoming"), autoRun].join("\n"))
') || die "DATABASE_URL is not set in the shell, .env.local or .env"

case "$TARGET_HOST" in
  localhost|127.0.0.1|"[::1]") ;;
  *) die "target host '$TARGET_HOST' is not local — this script only overwrites a local database" ;;
esac
case "$TARGET_DB" in
  ""|postgres|template0|template1) die "refusing to replace '$TARGET_DB'" ;;
esac
STAGING_DB="${TARGET_DB}_incoming"

# Checked before production is read, let alone written: the flag is what stops
# the copy's jobs mailing real people, and it is on unless somebody turned it
# off. Refusing here, rather than warning, is why the dry run is worth running
# first.
if [ "$FORCE" -eq 1 ] && [ "$AUTORUN_STATE" != "off" ]; then
  die "JOBS_AUTORUN_ENABLED resolves to on — set it to false in .env.local before copying production (see README → \"Working on a copy of production data\")"
fi

PROD_URL="$(railway variables --project "$RAILWAY_PROJECT_ID" --service Postgres \
  --environment production --json | node -e '
    let s = ""
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const v = JSON.parse(s).DATABASE_PUBLIC_URL
      if (!v) process.exit(1)
      process.stdout.write(v)
    })
  ')" || die "could not read DATABASE_PUBLIC_URL from Railway (run \`railway login\`?)"

echo "source: production ($(node -e 'console.log(new URL(process.argv[1]).host)' "$PROD_URL"))"
echo "target: $TARGET_DB on $TARGET_HOST"
echo "jobs:   JOBS_AUTORUN_ENABLED resolves to $AUTORUN_STATE"

if [ "$FORCE" -ne 1 ]; then
  echo "dry run — re-run with --force to replace '$TARGET_DB' with a copy of production."
  exit 0
fi

WORK_DIR="$(mktemp -d)"
SWAPPED=0
cleanup() {
  rm -rf "$WORK_DIR"
  [ "$SWAPPED" -eq 1 ] || dropdb --maintenance-db="$ADMIN_URL" --if-exists "$STAGING_DB" 2>/dev/null || true
}
trap cleanup EXIT

echo "dumping production (read-only)…"
( umask 077
  PGOPTIONS='-c default_transaction_read_only=on' \
    pg_dump "$PROD_URL" --format=custom --no-owner --no-acl --file="$WORK_DIR/prod.dump" )

# Restore beside the target and swap at the end, so a failed dump or restore
# leaves the current database untouched.
echo "restoring into ${STAGING_DB}…"
dropdb --maintenance-db="$ADMIN_URL" --if-exists "$STAGING_DB" 2>/dev/null || true
createdb --maintenance-db="$ADMIN_URL" "$STAGING_DB"
pg_restore --dbname="$STAGING_URL" --no-owner --no-acl --exit-on-error --single-transaction \
  "$WORK_DIR/prod.dump"

# Jobs queued in production belong to production; run locally they would act
# on real people's data.
psql "$STAGING_URL" -q -c 'TRUNCATE payload_jobs, payload_jobs_log'

echo "swapping ${STAGING_DB} → ${TARGET_DB}…"
# --force closes the dev server's connections; it must restart to reconnect.
dropdb --maintenance-db="$ADMIN_URL" --if-exists --force "$TARGET_DB"
psql "$ADMIN_URL" -q -c "ALTER DATABASE \"$STAGING_DB\" RENAME TO \"$TARGET_DB\""
SWAPPED=1

echo "done: $TARGET_DB is a copy of production. Restart the dev server to reconnect."
