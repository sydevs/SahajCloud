# Test Suite Performance

Runtime baseline for the unit and integration lanes, so future changes to the
test infrastructure stay comparable. Complements `tests/COVERAGE.md` (what is
tested) and `tests/AGENTS.md` (how to test).

Re-measure with the same command after any change to `vitest.config.mts`
(parallelism, pool), `tests/utils/testHelpers.ts` (per-suite bootstrap), or
the schema surface. Record the machine and DB, so the numbers stay honest.

Every runtime figure in `docs/rules/testing-reqs.md`, `tests/AGENTS.md`,
`AGENTS.md` and `README.md` is a copy of one recorded here. Change a number
there only with a measurement, and add it below with its machine and date.
The three-tier budgets drifted an order of magnitude from the lane they
describe because nothing held them to a run (#990).

## How to measure

```bash
# Total wall-clock for the whole unit lane (read Vitest's own duration line too)
/usr/bin/time -p pnpm test:unit

# What a narrowed per-edit hook would cost — one spec, cold
/usr/bin/time -p pnpm exec vitest run tests/unit/convert-vimeo.spec.ts --project unit --config ./vitest.config.mts

# Total wall-clock for the whole integration lane
/usr/bin/time -p pnpm test:int

# Cold per-file bootstrap (one isolated suite — dominated by the Drizzle push)
/usr/bin/time -p pnpm exec vitest run tests/int/albums.int.spec.ts --project int --config ./vitest.config.mts
```

`pnpm test:int` connects to `DATABASE_URL` — the dev Postgres locally, a
`postgres:18` service container in CI. Each suite gets an isolated
`test_<rand>` schema, created via Drizzle `push` and dropped on cleanup.
`pnpm test:unit` needs neither.

## The unit lane — 2026-10-20

`pnpm test:unit`, three consecutive runs, reported Vitest duration:
**60.29 s · 58.75 s · 59.23 s**, wall clock 60.3–61.7 s. **198 files, 2575
tests**, all passing.

Machine: 4 cores (Intel Xeon @ 2.80 GHz), 15 GB, a cloud routine container.
A maintainer's laptop is likely faster, so read this as an upper bound — and
record your own row beside it rather than replacing it.

| Metric | Value |
| --- | --- |
| Files / tests | 198 / 2575 |
| Whole lane (median of 3) | **59.2 s** |
| Vitest phase breakdown | transform 11.3 s, import 114.1 s, tests 13.0 s, environment 2.8 s |
| Sum of per-file durations (JSON reporter) | 17.7 s |
| Slowest single file | 1.8 s (`proposal-leaves.spec.ts`) |
| One file alone, cold | **1.9 s** wall (391 ms Vitest duration) |
| Whole lane at `--maxWorkers=1` | 140.5 s |
| Tier 2 lean gate (`check.sh`) | **138 s** |

**The cost is importing 198 module graphs, not running 2575 assertions.**
Test bodies are 13 s of the 59.2 s while `import` alone sums to 114 s of
worker time, and no single file is slow — the slowest is 1.8 s. The first two
figures are the breakdown Vitest prints on every run.

**No dev machine reaches `< 5 s` for the whole lane.** Four workers already
cut 140.5 s to 59.2 s, a 2.4× return on 4× the workers, so the lane does not
scale freely with cores. Even granting perfectly linear scaling from the
4-core figure, 16 cores lands near 15 s and 64 near 4 s. The `< 5 s` budget
describes a lane a tenth this size. It had already stopped describing this
one by `53e4569` (2026-09-29), the commit that last moved the figure, where
`tests/unit/` held 166 files.

**What the budget protects is the per-edit hook, and one file costs 1.9 s.**
So the budget is kept and the hook is narrowed to the specs one edit can
break, rather than the lane being cut — see #990 for the measurement that
settled it, and #993 for the follow-up.

## The integration lane — baseline, 2026-06-18 (before #499 §2)

Measured on the unmodified config (`pool: 'forks'`, `maxConcurrency: 1`, no
explicit `fileParallelism`/`poolOptions`), before the explicit-parallelism
change.

| Metric                                   | Value                                      |
| ------------------------------------------ | --------------------------------------------- |
| Suites / tests                           | 38 files, 675 tests (all passing)          |
| **Total wall-clock — local**             | **314.5s** (`pnpm test:int`)               |
| Total wall-clock — CI (reference)        | ~240–300s for the whole Lint+Test job¹     |
| **Cold per-file bootstrap (isolated)**   | **~58–60s** (3–4 trivial tests per file)²  |
| CPU utilisation (local)                  | user 841s + sys 166s over 314s ≈ 3.2 cores |

Vitest phase breakdown (local total run): `transform 5.4s, setup 0.7s,
import 166s, tests 1738s` (the `tests` figure sums per-file wall across
forks, so it exceeds real wall — evidence the lane already runs files in
parallel).

¹ CI runs `pnpm test` (unit + int combined) inside the `Lint, Test & Smoke`
job. The smoke step usually skips. Recent successful PR runs: ~240–300s
total for the job. CI is comparable-to-faster than local, despite fewer
cores, because its Postgres is a fresh, dedicated service container with no
competing connections (the local dev DB has some).

² Isolated single-file runs: `albums.int.spec.ts` (3 tests) 59.3s,
`image-orientation.int.spec.ts` (4 tests) 60.4s. With only a handful of
trivial assertions per file, ~58–60s is essentially **bootstrap**:
`buildConfig` + `getPayload` + the full-schema Drizzle `push` into a fresh
Postgres schema (plus `DROP SCHEMA … CASCADE` teardown). The "~8s
bootstrap per file" figure in `tests/AGENTS.md` predates the SQLite →
Postgres migration and is stale.

### What this tells us (the §2 lever)

The lane **already parallelises files** (default `forks` pool,
`fileParallelism` defaults to `true`. `maxConcurrency: 1` only serialises
tests *within* a file, not files). The dominant cost is the per-suite
full-schema `push`, and every fork contends on the **same Postgres**, so
the lane is **DB-bound, not CPU-bound**: adding forks past a point yields
diminishing returns and risks exhausting Postgres connections (each
Payload instance opens a pool).

The right lever is therefore to make file parallelism **explicit and
bounded** — prevent connection storms on high-core CI, leave headroom for
the dev machine locally — not to crank fork count. See the schema-reuse
evaluation below for the alternative that *was* considered and rejected.

## The integration lane — after, 2026-06-18 (with #499 §2 explicit parallelism)

Same command, same machine (11 cores), with `fileParallelism: true` +
`poolOptions.forks.maxForks` bounded (6 locally) and the §7 orphaned-schema
sweep active. All 38 files / 675 tests still pass.

| Metric                       | Value    | Δ vs baseline      |
| ------------------------------ | ---------- | -------------------- |
| Total wall-clock — local     | 261.5s   | **−53s (−17%)**    |

**Bounding forks made it _faster_, not slower.** The baseline let Vitest
spawn its default (~10–11 forks). Capping at 6 reduced the number of
suites doing a schema `push` against the shared Postgres at once, cutting
DB contention enough to more than offset the lower fork count — direct
confirmation the lane is DB-bound. The no-regression bar is met with
margin. CI uses a tighter cap (≤4, matching the runner) against its
dedicated service-container Postgres.

## Schema-reuse / clone evaluation (#499 §2)

**Considered**: build the schema once into a template, then clone it per
suite instead of running a full Drizzle `push` 38 times (the dominant cost
above).

**Rejected.** Postgres has no first-class "clone schema" primitive, and
rebuilding Payload's *generated* DDL (enum types, sequences, foreign keys,
indexes, the `_v` version tables) by hand per suite is fragile and would
drift the moment the schema changes — exactly the kind of bespoke
infrastructure the suite avoids. The realistic, low-risk win — bounded
explicit file parallelism — is delivered instead, and the
`synchronous_commit=off` / `imageSizes: []` optimisations are kept. Revisit
only if a future Payload/Drizzle release exposes a supported
template-schema or schema-snapshot mechanism.
