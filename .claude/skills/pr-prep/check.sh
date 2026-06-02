#!/bin/bash
#
# Pre-PR validation.
#
# Implements Tier 2 (lean local gate) by default and Tier 3 (local CI parity,
# minus smoke) under --full. See .claude/rules/testing-reqs.md for the full
# three-tier contract.
#
# Default — Tier 2: lint + the fast unit suite. Run the targeted integration
# spec(s) for what you changed separately, e.g.
#   pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts
#
# --full — Tier 3 locally: lint + full `pnpm test` + Cloudflare build. Skips
# `pnpm test:smoke` because the smoke specs target a deployed Cloudflare PR
# preview (built by Cloudflare Workers Builds, not by `pnpm build`). For full
# Tier 3 coverage, push and let CI run smoke against the preview.
#
# CI (.github/workflows/ci.yml) is the source of truth for Tier 3 on every PR.
#
# Usage:
#   .claude/skills/pr-prep/check.sh            # Tier 2: lint + test:unit
#   .claude/skills/pr-prep/check.sh --full     # Tier 3 locally (no smoke): lint + full test + Cloudflare build

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
  echo "=== Tier 3 (local): Full test suite ==="
  if ! pnpm test; then
    echo
    echo "❌ Tests failed. Fix failing tests before opening the PR."
    exit 1
  fi
  echo "✓ Tests passed"
  echo

  echo "=== Tier 3 (local): Cloudflare build ==="
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
  echo "ℹ Tier 3 smoke specs (pnpm test:smoke) target a deployed Cloudflare PR"
  echo "  preview and run in CI only. Push to trigger them on the PR."
  echo
else
  echo "=== Tier 2 (lean gate): Unit tests ==="
  if ! pnpm test:unit; then
    echo
    echo "❌ Unit tests failed. Fix them before continuing."
    exit 1
  fi
  echo "✓ Unit tests passed"
  echo
  echo "ℹ Tier 2 only. Run the targeted integration spec(s) for what you changed:"
  echo "    pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts"
  echo "  CI runs Tier 3 (full suite + smoke) on the PR. Use --full to mirror it locally (no smoke)."
  echo
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo "=== ✓ Checks passed — ${ELAPSED}s ==="
