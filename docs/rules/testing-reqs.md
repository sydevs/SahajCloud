---
paths:
  - tests/**
  - '**/*.test.ts'
  - '**/*.spec.ts'
---

# Testing Requirements

**CRITICAL**: run test commands one at a time. This is a CPU rule, not a style preference.

## CPU resource management

- Never run more than one test command at the same time.
- Never run `pnpm test` and `pnpm build` at the same time.
- Run `pnpm test` or `pnpm test:int` as one sequential command.
- Vitest parallelizes internally. Running several test commands at once causes CPU overload on top of that.

## Three-tier speed contract

Every test command belongs to one of three tiers, each with one purpose. Tier 1 gives Claude fast editing feedback. Tier 2 lets a human open a PR with confidence. Tier 3 lets CI catch what the first two skip. Never run a slower tier when a faster one answers the question.

| Tier | Command | Target runtime | Fires when |
| --- | --- | --- | --- |
| **1 — Hook** | `pnpm test:unit` | < 5 s | Claude's PostToolUse hook, on an Edit/Write under `src/**` or `tests/unit/**` (`.claude/hooks/unit-test.mjs`) |
| **2 — Pre-PR** | `pnpm lint && pnpm typecheck && pnpm typecheck:tests && pnpm test:unit` | < 45 s | The pr-prep lean gate (`.claude/skills/pr-prep/check.sh`) |
| **3 — CI** | `pnpm lint && pnpm typecheck && pnpm typecheck:tests && pnpm test && pnpm test:smoke` | ≤ 20 min | GitHub Actions, on every PR (`.github/workflows/ci.yml`) |

**Why `pnpm typecheck` is its own gate step.** Neither ESLint nor Vitest runs `tsc`. A type error can pass lint and the whole test suite, then surface only at the Railway build — after merge. Tier 2 and CI both run `tsc --noEmit` (about 15–20 s) to catch it first.

**Why `pnpm typecheck:tests` is a separate command.** The root `tsconfig.json` excludes `tests`, and the Next.js build reads that same config. So `pnpm typecheck` covers only `src/`. Without a second pass, nothing type-checks the specs — esbuild strips their types without checking them. A stale fixture then surfaces as a runtime failure, or never surfaces at all. `tsconfig.test.json` closes that gap over the whole suite (`tests/**`, about 6 s). Two separate commands means a failure names its own lane.

This gate only works when fixtures are typed against the real schema. See "Typed fixtures" in `tests/AGENTS.md`.

Tier-specific guidance:

- **Tier 1 runs unattended.** It must stay fast: no Payload boot, no database, no network. Add new unit specs under `tests/unit/`.
- **Tier 2 owns the local gate.** Add one targeted integration spec for the area you changed: `pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts`. Do not run the full `pnpm test:int` locally — that is Tier 3's job.
- **Tier 3 owns cross-cutting checks.** CI runs the full Vitest suite (unit and integration) and the Playwright smoke specs. It runs them against the PR's Railway preview with cloned production data. Railway builds the Next.js app on that preview deploy. GitHub Actions does not build it. Do not reproduce Tier 3 locally on every PR. Run `check.sh --full` only to debug a red CI run.

## The integration lane needs a live PostgreSQL

`scripts/ensure-test-db.sh` starts one. It runs from `worktreeSetup` and from the top of the lean gate. It is idempotent: it stays silent when port 5432 already answers, so it never touches a developer's own Postgres. It is best-effort: when it cannot start a database, it degrades the gate instead of failing it.

The script lives in this repo, not in the Claude routine environment's setup script, because that setup script is cached between containers. Editing it does not guarantee it runs. Three separate root causes produced that one symptom:

- A setup script exited non-zero and aborted the session at zero turns.
- A healthy cluster was misread as absent, because `psql` as `root` answers `FATAL: role "root" does not exist` — an auth error indistinguishable from a refused connection.
- A container held the data directory and a stale socket, with no server process behind either.

If the lane is unavailable, say so. Do not guess why. Name the layer that refused: process, socket, auth, or database. Note that CI is then the first place those specs will run.

## Local vs CI

Locally, default to targeted runs:

- `pnpm test:unit` — the fast unit lane (about 1–2 s, no Payload boot).
- `pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts` — one integration spec, for the area you touched.
- `pnpm exec vitest run tests/int/<file>.int.spec.ts -t "<case name>"` — one test case.

Run the full `pnpm test:int` locally, or `check.sh --full` for CI parity, only to reproduce a red CI check or when explicitly asked. Otherwise let CI run the slower, cross-cutting checks.

## Test commands

```bash
pnpm test:unit        # Tier 1 — unit lane only (fast, no Payload bootstrap)
pnpm test             # Tier 3 first half — unit + integration (what CI runs locally)
pnpm test:int         # Integration tests (Vitest) — targeted spec preferred
pnpm test:smoke       # Tier 3 second half — Playwright against CF PR preview (CI-only)
pnpm typecheck        # tsc over src/ (root tsconfig — excludes tests)
pnpm typecheck:tests  # tsc over the whole test suite (tsconfig.test.json)
```

## Correct usage

```bash
# DO: run targeted commands locally; run them one at a time
pnpm lint
pnpm test:unit
pnpm exec vitest run tests/int/albums.int.spec.ts --config ./vitest.config.mts

# DON'T: run several test or build commands at once
pnpm lint & pnpm build & pnpm test  # BAD - CPU overload
```

Full testing reference: `tests/AGENTS.md` (the nested guide, loaded when you work in `tests/`). Coverage map: `tests/COVERAGE.md`.
