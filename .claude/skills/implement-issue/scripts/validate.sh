#!/bin/bash
#
# Validate that the current branch is ready to open a PR.
#
# Default (lean local gate): lint + the fast unit suite. Run the targeted
# integration spec(s) for what you changed separately, e.g.
#   pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts
# CI (.github/workflows/ci.yml) runs the full suite + Cloudflare build on the PR.
#
# --full: reproduce the CI checks locally (full `pnpm test` + the Cloudflare
# build). Use to debug a red CI run. Runs SEQUENTIALLY (never in parallel —
# see .claude/rules/testing-reqs.md).
#
# Usage:
#   .claude/skills/implement-issue/scripts/validate.sh           # lean: lint + test:unit
#   .claude/skills/implement-issue/scripts/validate.sh --full    # lint + full test + Cloudflare build

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
MODE="${1:-}"

cd "$PROJECT_DIR" || exit 1

START_TIME=$(date +%s)

echo "=== Lint ==="
if ! pnpm lint; then
  echo
  echo "❌ Lint failed. Fix lint errors before continuing."
  exit 1
fi
echo "✓ Lint passed"
echo

if [[ "$MODE" == "--full" ]]; then
  echo "=== Full test suite (CI parity) ==="
  if ! pnpm test; then
    echo
    echo "❌ Tests failed. Fix failing tests before opening the PR."
    exit 1
  fi
  echo "✓ Tests passed"
  echo

  echo "=== Cloudflare build (CI parity) ==="
  if ! NODE_OPTIONS="--no-deprecation --max-old-space-size=8000" CLOUDFLARE_ENV= pnpm exec wrangler types; then
    echo
    echo "❌ wrangler types failed."
    exit 1
  fi
  if ! NODE_OPTIONS="--no-deprecation --max-old-space-size=8000" CLOUDFLARE_ENV= \
    WRANGLER_BUILD_CONDITIONS="" WRANGLER_BUILD_PLATFORM="node" \
    pnpm exec opennextjs-cloudflare build; then
    echo
    echo "❌ Cloudflare build failed."
    exit 1
  fi
  echo "✓ Cloudflare build passed"
  echo
else
  echo "=== Unit tests ==="
  if ! pnpm test:unit; then
    echo
    echo "❌ Unit tests failed. Fix them before continuing."
    exit 1
  fi
  echo "✓ Unit tests passed"
  echo
  echo "ℹ Lean gate only. Run the targeted integration spec(s) for what you changed:"
  echo "    pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts"
  echo "  CI runs the full suite + Cloudflare build on the PR. Use --full to mirror CI locally."
  echo
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo "=== ✓ Checks passed — ${ELAPSED}s ==="
