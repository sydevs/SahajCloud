# Test Suite Performance

Runtime baseline for the integration lane, so future changes to the test
infrastructure stay comparable. Complements `tests/COVERAGE.md` (what is
tested) and `tests/AGENTS.md` (how to test).

Re-measure with the same command after any change to `vitest.config.mts`
(parallelism, pool), `tests/utils/testHelpers.ts` (per-suite bootstrap), or
the schema surface. Record the machine and DB, so the numbers stay honest.

## How to measure

```bash
# Total wall-clock for the whole integration lane
/usr/bin/time -p pnpm test:int

# Cold per-file bootstrap (one isolated suite — dominated by the Drizzle push)
/usr/bin/time -p pnpm exec vitest run tests/int/albums.int.spec.ts --project int --config ./vitest.config.mts
```

`pnpm test:int` connects to `DATABASE_URL` — the dev Postgres locally, a
`postgres:18` service container in CI. Each suite gets an isolated
`test_<rand>` schema, created via Drizzle `push` and dropped on cleanup.

## Baseline — 2026-06-18 (before #499 §2)

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

## After — 2026-06-18 (with #499 §2 explicit parallelism)

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
