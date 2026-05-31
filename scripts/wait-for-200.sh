#!/usr/bin/env bash
# Polls a URL until it responds 200 OK, or exits non-zero on timeout.
# Used by CI's smoke-preview job to wait for Cloudflare Workers Builds to
# finish publishing the per-PR preview before running smoke specs against it.
#
# CF Workers Builds reliably needs 2+ min for our bundle, so we sleep an
# initial grace period before polling — saves the no-op curl traffic and
# keeps the CI log signal high.
#
# Usage: wait-for-200.sh <url> [timeout-seconds] [grace-seconds]
# Default timeout: 180s (polling window AFTER grace).
# Default grace:   120s (initial wait before the first poll).
# Total max wait:  grace + timeout (default 300s).
set -euo pipefail

URL="${1:?Usage: wait-for-200.sh <url> [timeout-seconds] [grace-seconds]}"
TIMEOUT="${2:-180}"
GRACE="${3:-120}"
INTERVAL=5

echo "Sleeping ${GRACE}s before polling $URL (CF Workers Builds typically needs 2+ min)..."
sleep "$GRACE"

START=$(date +%s)

while true; do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" || true)
  if [ "$STATUS" = "200" ]; then
    echo "✓ $URL responded 200"
    exit 0
  fi
  NOW=$(date +%s)
  ELAPSED=$((NOW - START))
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "✗ Timed out after ${TIMEOUT}s polling $URL (last status: $STATUS)" >&2
    exit 1
  fi
  echo "  ${ELAPSED}s elapsed, status=$STATUS, retrying in ${INTERVAL}s..."
  sleep "$INTERVAL"
done
