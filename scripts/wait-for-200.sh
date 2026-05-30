#!/usr/bin/env bash
# Polls a URL until it responds 200 OK, or exits non-zero on timeout.
# Used by CI's smoke-preview job to wait for Cloudflare Workers Builds to
# finish publishing the per-PR preview before running smoke specs against it.
#
# Usage: wait-for-200.sh <url> [timeout-seconds]
# Default timeout: 180s (matches CF Workers Builds median p95 deploy time).
set -euo pipefail

URL="${1:?Usage: wait-for-200.sh <url> [timeout-seconds]}"
TIMEOUT="${2:-180}"
INTERVAL=5

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
    echo "✗ Timed out after ${TIMEOUT}s waiting for $URL (last status: $STATUS)" >&2
    exit 1
  fi
  echo "  ${ELAPSED}s elapsed, status=$STATUS, retrying in ${INTERVAL}s..."
  sleep "$INTERVAL"
done
