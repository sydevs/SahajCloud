#!/bin/bash
#
# Collect diagnostic context for a bug report.
#
# Outputs:
#   - dev server log tail (last 200 lines)
#   - recent test output (if any in /tmp)
#   - git status + last 5 commits
#   - dev server health check
#
# Usage: .claude/skills/fix-bug/scripts/gather-logs.sh

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
SERVER_LOG="$PROJECT_DIR/.claude/skills/dev-server/state/server.log"

echo "=== Project: $PROJECT_DIR ==="
echo

echo "=== Git status ==="
git -C "$PROJECT_DIR" status --short 2>&1 | head -50
echo

echo "=== Recent commits ==="
git -C "$PROJECT_DIR" log --oneline -5 2>&1
echo

echo "=== Dev server status ==="
if [[ -x "$PROJECT_DIR/.claude/skills/dev-server/dev-server.sh" ]]; then
  "$PROJECT_DIR/.claude/skills/dev-server/dev-server.sh" status 2>&1 || true
else
  echo "(dev-server.sh not found)"
fi
echo

echo "=== Dev server log (last 200 lines) ==="
if [[ -f "$SERVER_LOG" ]]; then
  tail -200 "$SERVER_LOG"
else
  echo "(no server log at $SERVER_LOG — server may not be running)"
fi
echo

echo "=== Node / pnpm versions ==="
node --version 2>&1 || echo "(node not found)"
pnpm --version 2>&1 || echo "(pnpm not found)"
echo

echo "=== Done ==="
