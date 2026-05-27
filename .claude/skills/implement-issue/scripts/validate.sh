#!/bin/bash
#
# Validate that the current branch is ready to open a PR.
# Runs lint, build, and tests SEQUENTIALLY (never in parallel — see
# .claude/rules/testing-reqs.md).
#
# Usage: .claude/skills/implement-issue/scripts/validate.sh [--quick]
#   --quick  Skip build (lint + test only)

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
QUICK="${1:-}"

cd "$PROJECT_DIR" || exit 1

echo "=== 1/3: Lint ==="
if ! pnpm lint; then
  echo
  echo "❌ Lint failed. Fix lint errors before continuing."
  exit 1
fi
echo "✓ Lint passed"
echo

if [[ "$QUICK" != "--quick" ]]; then
  echo "=== 2/3: Build ==="
  if ! pnpm build; then
    echo
    echo "❌ Build failed. Fix build errors before continuing."
    exit 1
  fi
  echo "✓ Build passed"
  echo
fi

echo "=== 3/3: Tests ==="
if ! pnpm test; then
  echo
  echo "❌ Tests failed. Fix failing tests before opening the PR."
  exit 1
fi
echo "✓ Tests passed"
echo

echo "=== ✓ All checks passed — branch is PR-ready ==="
