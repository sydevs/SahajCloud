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
| **1 — Hook** | `pnpm test:unit` | < 12 s per edit — **not met**, see below | Claude's PostToolUse hook, on an Edit/Write under `src/**` or `tests/unit/**` (`.claude/hooks/unit-test.mjs`) |
| **2 — Pre-PR** | `pnpm lint && pnpm typecheck && pnpm typecheck:tests && pnpm test:unit` | < 210 s (174 s cold, 103 s warm) | The pr-prep lean gate (`.claude/skills/pr-prep/check.sh`) |
| **3 — CI** | `pnpm lint && pnpm typecheck && pnpm typecheck:tests && pnpm test && pnpm test:smoke` | ≤ 20 min | GitHub Actions, on every PR (`.github/workflows/ci.yml`) |

**Each target above is held to a measurement in `tests/PERF.md`, recorded with its machine and date.** Measured 2026-10-20 on 4 cores: `pnpm test:unit` is **78 s** for 216 files and 2791 tests, and Tier 2's four commands sum to **104 s**. **Each target bounds the thing its own row names, on the slowest measurement recorded for it** — never a median, because three sessions on one container spec spread 47 to 78 s on the same day. Tier 2's is the cold gate, since `check.sh` also runs `scripts/ensure-test-db.sh`: 138 s and 174 s on two sessions' first runs, 103 s once Postgres answers. **Tier 1's is one edit, not the lane**: the specs naming an edited module are 1 file for the median module and 18 for the generated `@/payload-types`, costing 1.3 s and 7.8 s. 12 s bounds the widest with room for that spread (#990).

⚠ **Tier 1's gap shows up as a false failure, not as slowness.** The hook runs the whole lane, and `.claude/hooks/unit-test.mjs` bounds it with a 30 s `execSync` timeout — so wherever the lane runs longer than that, which is every machine measured so far, the timeout fires and the catch branch reports `Unit tests failed after editing <file>` with a tail carrying no failure in it, just Vitest's banner. **Disregard that report and run `pnpm test:unit` yourself.** Reproduce it with:

```bash
echo "{\"tool_input\":{\"file_path\":\"$PWD/src/lib/richEditor/index.ts\"}}" > /tmp/edit.json
CLAUDE_PROJECT_DIR=$PWD node .claude/hooks/unit-test.mjs < /tmp/edit.json
```

The fix is to run only the specs one edit can break, which costs 1.3 s for the median module and 7.8 s for the widest — both inside Tier 1's target, which is why the target is a number a narrowed hook can meet rather than one the lane could. Making the lane itself faster reaches neither: about 19 s of it is serial whatever the core count. The narrowing is not done here, because the hook sits under `.claude/`, a protected path no unattended run may write, so it needs an attended session. Tracked in #993.

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
pnpm test:unit        # Tier 1 — unit lane only (about 78 s, no Payload bootstrap)
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
