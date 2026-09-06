#!/bin/bash
#
# Pre-PR validation.
#
# Runs Tier 2 (the lean local gate) by default, and Tier 3 (local CI
# parity, without smoke) under --full. See docs/rules/testing-reqs.md for
# the full three-tier contract.
#
# Default, Tier 2: lint, typecheck, and the fast unit suite. Run the
# integration spec(s) for your change separately, for example:
#   pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts
#
# --full, Tier 3 locally: lint, typecheck, the full `pnpm test`, and the
# Railway `pnpm build`. This skips `pnpm test:smoke`, since the smoke
# specs target a deployed Railway PR preview, not a local build. For full
# Tier 3 coverage, push and let CI run smoke against the preview.
#
# CI (.github/workflows/ci.yml) is the source of truth for Tier 3 on every
# PR.
#
# Usage:
#   .claude/skills/pr-prep/check.sh          # Tier 2: lint, typecheck, test:unit
#   .claude/skills/pr-prep/check.sh --full   # Tier 3 locally (no smoke): lint, typecheck, full test, Railway build

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
MODE="${1:-}"

cd "$PROJECT_DIR" || exit 1

START_TIME=$(date +%s)

# The integration lane needs a live PostgreSQL. This step is idempotent
# and best-effort. It stays silent when port 5432 already answers, and it
# never fails this gate. Without it, a sandbox can have a data directory,
# a stale socket, and no server process. That state looks like "no
# database" only once something tries to connect.
[ -x scripts/ensure-test-db.sh ] && scripts/ensure-test-db.sh

echo "=== Lint ==="
if ! pnpm lint; then
  echo
  echo "❌ Lint failed. Fix lint errors before continuing."
  exit 1
fi
echo "✓ Lint passed"
echo

echo "=== Typecheck (src) ==="
if ! pnpm typecheck; then
  echo
  echo "❌ Typecheck failed. Fix type errors before continuing."
  echo "  Note: type errors are caught ONLY here and by the Railway build —"
  echo "  neither lint nor the Vitest suites (nor GitHub CI's test step) typecheck."
  exit 1
fi
echo "✓ Typecheck passed"
echo

# Separate from the src pass. The root tsconfig excludes `tests`, so specs
# would otherwise never get typechecked. Vitest transpiles with esbuild,
# which strips types without checking them (#606). This step covers all
# of `tests/**`.
echo "=== Typecheck (tests) ==="
if ! pnpm typecheck:tests; then
  echo
  echo "❌ Test-suite typecheck failed. Fix type errors before continuing."
  echo "  Scope is tsconfig.test.json (all of tests/**)."
  echo "  Type fixtures with createData / FixtureOverrides — see tests/AGENTS.md."
  exit 1
fi
echo "✓ Test-suite typecheck passed"
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

  echo "=== Tier 3 (local): Railway build (pnpm build) ==="
  if ! pnpm build; then
    echo
    echo "❌ Build failed. This is the Next.js build Railway runs on deploy."
    exit 1
  fi
  echo "✓ Build passed"
  echo
  echo "ℹ Tier 3 smoke specs (pnpm test:smoke) target a deployed Railway PR"
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
