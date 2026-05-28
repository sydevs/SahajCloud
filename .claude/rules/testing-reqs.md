---
paths:
  - tests/**
  - '**/*.test.ts'
  - '**/*.spec.ts'
---

# Testing Requirements

**CRITICAL**: CPU resource management rules for running tests.

## CPU Resource Management

- **Never run multiple test commands in parallel** - Wait for one test run to complete before starting another
- **Don't run tests concurrently with builds** - `pnpm build` and `pnpm test` should not run simultaneously
- **Single test process only** - Run `pnpm test` or `pnpm test:int` as a single sequential operation
- Vitest handles internal parallelization efficiently - external parallelization causes CPU overload

## Local vs CI

CI (`.github/workflows/ci.yml`) runs the **full suite + the Cloudflare build** on every PR. Locally, default to **targeted** runs:

- `pnpm test:unit` — fast unit lane (~1–2 s, no Payload bootstrap)
- `pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts` — a single integration spec for the area you touched
- `pnpm exec vitest run tests/int/<file>.int.spec.ts -t "<case name>"` — a single test case

Run the full `pnpm test:int` locally, or `check.sh --full` / `validate.sh --full` for CI parity (includes the Cloudflare build), **only** to reproduce a red CI check or when explicitly asked — otherwise let CI own those slower, cross-cutting checks.

## Test Commands

```bash
pnpm test:unit   # Unit lane only (fast — preferred locally)
pnpm test        # Unit + integration (what CI runs)
pnpm test:int    # Integration tests (Vitest)
pnpm test:e2e    # E2E tests (Playwright — currently no specs, no-ops)
```

## Correct Usage

```bash
# DO: targeted locally; sequential when you do run more than one
pnpm lint
pnpm test:unit
pnpm exec vitest run tests/int/albums.int.spec.ts --config ./vitest.config.mts

# DON'T: run multiple test/build commands in parallel
pnpm lint & pnpm build & pnpm test  # BAD - CPU overload
```

Full testing reference: `.claude/rules/tests.md` (auto-loads when working with `tests/**/*.spec.ts`).
