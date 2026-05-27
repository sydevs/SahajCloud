#!/bin/bash
#
# Run pre-PR validation: lint → build → test (sequential).
#
# Usage:
#   .claude/skills/pr-prep/check.sh            # Full validation
#   .claude/skills/pr-prep/check.sh --quick    # Lint + test only (skip build)

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
QUICK="${1:-}"

cd "$PROJECT_DIR" || exit 1

START_TIME=$(date +%s)

echo "=== 1/3: Lint ==="
if ! pnpm lint; then
  echo
  echo "❌ Lint failed."
  exit 1
fi
echo "✓ Lint passed"
echo

if [[ "$QUICK" != "--quick" ]]; then
  echo "=== 2/3: Build ==="
  if ! pnpm build; then
    echo
    echo "❌ Build failed."
    exit 1
  fi
  echo "✓ Build passed"
  echo
fi

echo "=== 3/3: Tests ==="
if ! pnpm test; then
  echo
  echo "❌ Tests failed."
  exit 1
fi
echo "✓ Tests passed"
echo

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo "=== ✓ Branch is PR-ready — ${ELAPSED}s ==="
