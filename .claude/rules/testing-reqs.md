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

## Test Commands

```bash
pnpm test        # Run all tests (integration + E2E)
pnpm test:int    # Run integration tests (Vitest)
pnpm test:e2e    # Run E2E tests (Playwright)
```

## Correct Usage

```bash
# DO: Run tests sequentially
pnpm lint
pnpm build
pnpm test

# DON'T: Run in parallel
pnpm lint & pnpm build & pnpm test  # BAD - CPU overload
```

Full testing reference: `.claude/rules/tests.md` (auto-loads when working with `tests/**/*.spec.ts`).
