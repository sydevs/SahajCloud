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

| Tier           | Command                                                                                                    | Target runtime                   | Fires when                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1 — Hook**   | `vitest run --project unit` over the specs naming the edited file (`scripts/select-unit-specs.mjs`)        | < 12 s per edit                  | Claude's PostToolUse hook, on an Edit/Write of any module or Markdown doc a unit spec names, except the generated `src/payload-types.ts` and `src/migrations/**` (`.claude/hooks/unit-test.mjs`) |
| **2 — Pre-PR** | `pnpm lint && pnpm format:check && pnpm typecheck && pnpm typecheck:tests && pnpm test:unit`               | < 210 s (174 s cold, 112 s warm) | The pr-prep lean gate (`.claude/skills/pr-prep/check.sh`)                                                                                                                                        |
| **3 — CI**     | `pnpm lint && pnpm format:check && pnpm typecheck && pnpm typecheck:tests && pnpm test && pnpm test:smoke` | ≤ 20 min                         | GitHub Actions, on every PR (`.github/workflows/ci.yml`)                                                                                                                                         |

**Each target above is held to a measurement in `tests/PERF.md`, recorded with its machine and date.** Measured 2026-10-20 on 4 cores: `pnpm test:unit` is **78 s** for 229 files and 2938 tests, and Tier 2's four commands sum to **104 s**, before its Format step added about 15 s (#1006). **Each target bounds the thing its own row names, on the slowest measurement recorded for it** — never a median, because three sessions on one container spec spread 47 to 78 s on the same day. Tier 2's is the cold gate, since `check.sh` also runs `scripts/ensure-test-db.sh`: 138 s and 174 s on two sessions' first runs, 112 s once Postgres answers. **Tier 1's is one edit, not the lane**: the hook runs only the specs naming the edited file, and the slowest selection timed on 4 cores cost 8.7 s — the 3 specs naming `@/payload.config`, where one spec's config import is most of the cost. 12 s bounds it with room for the spread this file records (#990, #993).

⚠ **The hook selects by name, so it misses what reaches the edit through another module.** A spec runs when its own text names the edited file: an `@/` import, a relative path, or a quoted repo path — a Markdown doc included, so a doc a spec pins runs that spec. Most `src/` edits select nothing and spawn no vitest. A spec that reaches the edit through a collection does not run, and neither does one whose input is the tree or the import graph (`lib-boundary`, `client-bundle-safety`) unless it names the file. Following imports would select most of the lane for a shared module, so Tier 2 and CI run the whole lane instead (`tests/PERF.md`). Only a spec that ran and failed reports `Unit tests failed`; a timeout, a signal, or a vitest that never started each says so instead.

**Why `pnpm typecheck` is its own gate step.** Neither ESLint nor Vitest runs `tsc`. A type error can pass lint and the whole test suite, then surface only at the Railway build — after merge. Tier 2 and CI both run `tsc --noEmit` (8 s measured — `tests/PERF.md`) to catch it first.

**Why `pnpm typecheck:tests` is a separate command.** The root `tsconfig.json` excludes `tests`, and the Next.js build reads that same config. So `pnpm typecheck` covers only `src/`. Without a second pass, nothing type-checks the specs — esbuild strips their types without checking them. A stale fixture then surfaces as a runtime failure, or never surfaces at all. `tsconfig.test.json` closes that gap over the whole suite (`tests/**`, 8 s measured). Two separate commands means a failure names its own lane.

This gate only works when fixtures are typed against the real schema. See "Typed fixtures" in `tests/AGENTS.md`.

Tier-specific guidance:

- **Tier 1 runs unattended.** It must stay fast: no Payload boot, no database, no network. Add new unit specs under `tests/unit/`.
- **Tier 2 owns the local gate.** Add one targeted integration spec for the area you changed: `pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts`. Do not run the full `pnpm test:int` locally — that is Tier 3's job.
  ⚠ **Use that form, not `pnpm test:int -- <file>`.** pnpm inserts its own `--` before the path, and vitest then reads nothing after it as a filter: the run silently widens to all 84 int files and takes about six minutes. Measured with `vitest list` — 1 file without the `--`, 84 with it.
- **Tier 3 owns cross-cutting checks.** CI runs the full Vitest suite (unit and integration) and the Playwright smoke specs. It runs them against the PR's Railway preview, which carries no content — a preview forks configuration and variables, not volume data, so each smoke spec builds its own fixtures (`tests/AGENTS.md`). Railway builds the Next.js app on that preview deploy. GitHub Actions does not build it. Do not reproduce Tier 3 locally on every PR. Run `check.sh --full` only to debug a red CI run.

## The integration lane needs a live PostgreSQL

`scripts/ensure-test-db.sh` starts one. It runs from `worktreeSetup` and from the top of the lean gate. It is idempotent: it stays silent when port 5432 already answers, so it never touches a developer's own Postgres. It is best-effort: when it cannot start a database, it degrades the gate instead of failing it.

The script lives in this repo, not in the Claude routine environment's setup script, because that setup script is cached between containers. Editing it does not guarantee it runs. Three separate root causes produced that one symptom:

- A setup script exited non-zero and aborted the session at zero turns.
- A healthy cluster was misread as absent, because `psql` as `root` answers `FATAL: role "root" does not exist` — an auth error indistinguishable from a refused connection.
- A container held the data directory and a stale socket, with no server process behind either.

If the lane is unavailable, say so. Do not guess why. Name the layer that refused: process, socket, auth, or database. Note that CI is then the first place those specs will run.

## Local vs CI

Locally, default to targeted runs:

- `pnpm test:unit` — the whole unit lane (about 78 s on 4 cores, no Payload boot — `tests/PERF.md`). For one spec, name it: `pnpm exec vitest run tests/unit/<file>.spec.ts --project unit --config ./vitest.config.mts`, 1–3 s.
- `pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts` — one integration spec, for the area you touched.
- `pnpm exec vitest run tests/int/<file>.int.spec.ts -t "<case name>"` — one test case.

Run the full `pnpm test:int` locally, or `check.sh --full` for CI parity, only to reproduce a red CI check or when explicitly asked. Otherwise let CI run the slower, cross-cutting checks.

## Test commands

```bash
pnpm test:unit        # the whole unit lane, which Tier 2 runs (about 78 s, no Payload bootstrap)
pnpm test             # Tier 3 first half — unit + integration (what CI runs locally)
pnpm test:int         # Integration tests (Vitest) — targeted spec preferred; see Tier 2 for how
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
