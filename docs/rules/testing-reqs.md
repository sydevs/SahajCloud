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

## Three-tier speed contract

Every test command belongs to one of three tiers. Each tier has a job — Claude relies on Tier 1 for editing feedback, the human relies on Tier 2 to feel safe opening a PR, and CI relies on Tier 3 to catch what the first two skip. Don't run a slower tier when a faster one will do.

| Tier           | Command                                     | Target runtime | Fires when                                                                                        |
| -------------- | ------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| **1 — Hook**   | `pnpm test:unit`                            | < 5 s          | Claude PostToolUse Edit/Write on `src/**` and `tests/unit/**` (see `.claude/hooks/unit-test.mjs`) |
| **2 — Pre-PR** | `pnpm lint && pnpm typecheck && pnpm typecheck:tests && pnpm test:unit`               | < 45 s         | The pr-prep lean gate — `.claude/skills/pr-prep/check.sh`                                         |
| **3 — CI**     | `pnpm lint && pnpm typecheck && pnpm typecheck:tests && pnpm test && pnpm test:smoke` | ≤ 20 min       | GitHub Actions on every PR (`.github/workflows/ci.yml`)                                           |

> **Why `pnpm typecheck` is its own gate step:** `eslint` and Vitest do **not** type-check (`tsc`), so a type error passes lint + the whole test suite and surfaces only at the Railway build — i.e. after merge. Tier 2 and CI both run `tsc --noEmit` (~15-20 s) to catch it before merge.
>
> **Why `pnpm typecheck:tests` is separate:** the root `tsconfig.json` lists `tests` in `exclude`, and it's the config the Next.js build consumes — so `pnpm typecheck` covers `src/` only. Without a second pass nothing checks the specs at all (esbuild erases their types without checking them), and a stale fixture surfaces as a *runtime* integration failure, or never. `tsconfig.test.json` closes that gap over the whole suite (`tests/**`, ~6 s). Keeping the two commands apart means a failure names the lane it came from.
>
> The gate only earns its keep if fixtures are typed against the real schema — see **"Typed fixtures"** in `tests/AGENTS.md`.

Tier-specific guidance:

- **Tier 1 runs unattended**. It must stay fast — no Payload bootstrap, no DB, no network. New unit specs go in `tests/unit/`.
- **Tier 2 owns the local gate**. Add a targeted integration spec for the area you touched (one file via `pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts`). Don't run the full `pnpm test:int` locally — that's Tier 3's job.
- **Tier 3 owns cross-cutting checks**. The CI job runs the full Vitest suite (unit + int) and the Playwright smoke specs against the per-PR **Railway** preview with cloned prod data. (The Next.js build runs on Railway's preview deploy — GitHub Actions does not build.) Don't reproduce Tier 3 locally on every PR. Use `check.sh --full` only to debug a red CI run.

## Local vs CI

Locally, default to **targeted** runs:

- `pnpm test:unit` — fast unit lane (~1–2 s, no Payload bootstrap)
- `pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts` — a single integration spec for the area you touched
- `pnpm exec vitest run tests/int/<file>.int.spec.ts -t "<case name>"` — a single test case

Run the full `pnpm test:int` locally, or `check.sh --full` for CI parity, **only** to reproduce a red CI check or when explicitly asked — otherwise let CI own those slower, cross-cutting checks.

## Test Commands

```bash
pnpm test:unit        # Tier 1 — unit lane only (fast, no Payload bootstrap)
pnpm test             # Tier 3 first half — unit + integration (what CI runs locally)
pnpm test:int         # Integration tests (Vitest) — targeted spec preferred
pnpm test:smoke       # Tier 3 second half — Playwright against CF PR preview (CI-only)
pnpm typecheck        # tsc over src/ (root tsconfig — excludes tests)
pnpm typecheck:tests  # tsc over the whole test suite (tsconfig.test.json)
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

Full testing reference: `tests/AGENTS.md` (the nested guide, which loads when working in `tests/`). Coverage map: `tests/COVERAGE.md`.
