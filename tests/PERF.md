# Test Suite Performance

Runtime baseline for the unit and integration lanes, so future changes to the
test infrastructure stay comparable. Complements `tests/COVERAGE.md` (what is
tested) and `tests/AGENTS.md` (how to test).

Re-measure with the same command after any change to `vitest.config.mts`
(parallelism, pool), `tests/utils/testHelpers.ts` (per-suite bootstrap), or
the schema surface. Record the machine and DB, so the numbers stay honest.

Every figure the three-tier contract states — in `docs/rules/testing-reqs.md`,
`tests/AGENTS.md`, `AGENTS.md` and `README.md` — is a copy of one recorded
here. Change a number there only with a measurement, and add it below with
its machine and date. Those budgets drifted an order of magnitude from the
lane they describe because nothing held them to a run (#990).

`tests/unit/perf-figures-pinned.spec.ts` is that run. It reds when the file
count here stops matching the tracked specs, when a consumer doc stops
quoting the lane figure here, or when either tier's target drops below the
measurement its own row is set from — Tier 2's cold gate, Tier 1's widest
per-edit selection. ⚠ **It asserts no wall-clock time** — a timing bound
inside the lane reddens on a loaded machine, and a check everyone learns to
ignore is worse than prose. Re-measuring therefore edits this file and the
four consumers in one commit, by design.

## How to measure

```bash
# Total wall-clock for the whole unit lane (read Vitest's own duration line too)
time pnpm test:unit

# One spec, cold
time pnpm exec vitest run tests/unit/convert-vimeo.spec.ts --project unit --config ./vitest.config.mts

# What one edit costs, which Tier 1's target bounds: time the hook itself, since the
# command it builds is the thing under budget. The second line lists what it selects.
echo "{\"tool_input\":{\"file_path\":\"$PWD/src/plugins/login/index.ts\"}}" > /tmp/edit.json
time CLAUDE_PROJECT_DIR=$PWD node .claude/hooks/unit-test.mjs < /tmp/edit.json
node scripts/select-unit-specs.mjs src/plugins/login/index.ts

# Total wall-clock for the whole integration lane
time pnpm test:int

# Cold per-file bootstrap (one isolated suite — dominated by the Drizzle push)
time pnpm exec vitest run tests/int/albums.int.spec.ts --project int --config ./vitest.config.mts
```

⚠ **`time`, the shell keyword — not `/usr/bin/time -p`**, which these
lines used until 2026-10-20 and which the routine containers do not ship
(exit 127, which reads as a broken command rather than a missing binary).

`pnpm test:int` connects to `DATABASE_URL` — the dev Postgres locally, a
`postgres:18` service container in CI. Each suite gets an isolated
`test_<rand>` schema, created via Drizzle `push` and dropped on cleanup.
`pnpm test:unit` needs neither.

## The unit lane — 2026-10-20

Every session but the sixth measured it on the same container spec — 4 cores
(Intel Xeon @ 2.80 GHz), 15 GB, a cloud routine container. The sixth is a
maintainer's laptop, for scale: Apple M3 Pro, 11 cores, 18 GB, so 10 workers.

| Session                                                | Files / tests | Vitest duration, consecutive runs            | Median     |
| ------------------------------------------------------ | ------------- | -------------------------------------------- | ---------- |
| first                                                  | 198 / 2575    | 60.29 · 58.75 · 59.23 s                      | 59.2 s     |
| second, after merging `main`                           | 203 / 2643    | 82.19 · 77.93 · 73.21 s                      | **77.9 s** |
| third, after merging `main` again                      | 204 / 2653    | 47.16 · 46.38 · 47.82 s                      | 47.2 s     |
| fourth, after merging `main` again                     | 205 / 2656    | 54.00 · 50.45 s (both inside the gate)       | 52.2 s     |
| fifth, after merging `main` again                      | 218 / 2795    | 49.13 s (inside the gate)                    | 49.1 s     |
| sixth, M3 Pro laptop (#993)                            | 206 / 2676    | 18.45 · 19.15 · 18.86 s                      | 18.9 s     |
| seventh, #1012 after merging `main` (2026-10-21)       | 218 / 2801    | 55.01 s                                      | 55.0 s     |
| eighth, #1012 after merging `main` (2026-10-21)        | 222 / 2849    | 55.26 s                                      | 55.3 s     |
| ninth, #1012 after merging `main` (2026-10-21)         | 224 / 2886    | 50.05 s (inside the gate)                    | 50.1 s     |
| tenth, #999 after merging `main` (2026-10-21)          | 219 / 2807    | 55.70 s                                      | 55.7 s     |
| eleventh, #999 after merging `main` (2026-10-21)       | 223 / 2855    | 52.93 s                                      | 52.9 s     |
| twelfth, #999 after merging `main` (2026-10-21)        | 225 / 2892    | 51.87 s                                      | 51.9 s     |
| thirteenth, #999 and #1012 merged (2026-10-21)         | 225 / 2898    | 56.70 s (inside the gate)                    | 56.7 s     |
| fourteenth, #1013 on its own branch (2026-10-21)       | 223 / 2852    | 58.08 s                                      | 58.1 s     |
| fifteenth, #1013 on its own branch (2026-10-21)        | 223 / 2851    | 54.78 s                                      | 54.8 s     |
| sixteenth, #1013 after merging `main` (2026-10-21)     | 225 / 2894    | 54.22 s (inside the gate)                    | 54.2 s     |
| seventeenth, #1013 on its own branch (2026-10-23)      | 225 / 2895    | 50.24 s (inside the gate)                    | 50.2 s     |
| eighteenth, #1014 after merging `main` (2026-10-23)    | 226 / 2898    | 50.52 s                                      | 50.5 s     |
| nineteenth, #1014 after merging `main` (2026-10-23)    | 226 / 2897    | 48.41 s (inside the gate)                    | 48.4 s     |
| twentieth, #999 after merging `main` (2026-10-25)      | 225 / 2902    | 53.56 s (inside the gate)                    | 53.6 s     |
| twenty-first, #999 after merging `main` (2026-10-25)   | 227 / 2917    | 53.54 s (inside the gate)                    | 53.5 s     |
| twenty-second, #1013 after merging `main` (2026-10-25) | 227 / 2911    | 51.65 s (inside the gate)                    | 51.7 s     |
| twenty-third, #1034 on a feature branch (2026-10-25)   | 227 / 2909    | 55.66 s (inside the gate)                    | 55.7 s     |
| twenty-fourth, #999 after merging `main` (2026-10-26)  | 228 / 2924    | 74.58 · 64.62 s (the second inside the gate) | 69.6 s     |
| twenty-fifth, #999 addressing a review (2026-10-26)    | 228 / 2929    | 56.58 · 56.99 s (both inside the gate)       | 56.8 s     |
| twenty-sixth, #1013 after merging `main` (2026-10-26)  | 228 / 2918    | 60.66 s (inside the gate)                    | 60.7 s     |
| twenty-seventh, #999 after merging `main` (2026-10-26) | 229 / 2938    | 59.58 s                                      | 59.6 s     |
| twenty-eighth, #999 addressing a review (2026-10-27)   | 229 / 2935    | 38.62 s (inside the gate)                    | 38.6 s     |
| twenty-ninth, M4 Max laptop, 14 cores (2026-10-23)     | 225 / 2890    | 16.38 s (inside the gate)                    | 16.4 s     |
| thirtieth, #1029 after merging `main` (2026-10-27)     | 233 / 2955    | 42.54 s                                      | 42.5 s     |
| thirty-first, #1039 on its own branch (2026-10-28)     | 233 / 2962    | 66.21 s (inside the gate)                    | 66.2 s     |

⚠ **Those three medians span 47 to 78 s — 66% — and six spec files do not
explain it.** Identical container spec, all on 2026-10-20, 3% more files
across the range. The second session's three runs also fell monotonically
(82 → 73 s) as caches warmed, and the third session, with the most files,
was the fastest of the three. So **a single container's figure is worth no
more than its order of magnitude** — quote the slowest median as an upper
bound, which is what the consumer docs do, and do not read a 60% move as a
regression. A maintainer's laptop is faster again. Record your own row above
rather than replacing one.

Everything below is the second session's run unless the row says otherwise.
**The file and test counts are the current tree's**, because the spec pins
them to what is on disk; every timing is the session its row names.
`| Files / tests |` and the three `**bold**` cells are the captures the spec
reads, so keep those labels and cell shapes when you add a row.

| Metric                                                                                          | Value                                                             |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Files / tests                                                                                   | 234 / 2976                                                        |
| Whole lane, 3 workers (slowest session median, what the consumer docs quote)                    | **77.9 s**                                                        |
| One spec alone, the typical edit (third session)                                                | 1.3 s                                                             |
| Slowest per-edit selection timed on 4 cores, the 3 specs naming `@/payload.config` (2026-10-21) | **8.7 s**                                                         |
| The same 3 specs on the merged tree (2026-10-23)                                                | 7.7 s                                                             |
| 8 specs naming `tests/utils/importGraph.ts` (2026-10-23)                                        | 7.9 s                                                             |
| 18 specs naming `@/payload-types`, which the hook skips as generated (third session)            | 7.8 s                                                             |
| Vitest phase breakdown, at 3 workers                                                            | transform 14.4 s, import 141.6 s, tests 17.5 s, environment 5.2 s |
| Slowest file's own duration inside the lane (first session)                                     | 1.8 s (`proposal-leaves.spec.ts`)                                 |
| One file alone, cold (first session)                                                            | **1.9 s** wall (`convert-vimeo`) to **3.0 s** (`proposal-leaves`) |
| Whole lane at `--maxWorkers=1` (first session, 198 files)                                       | 140.5 s                                                           |
| Whole lane at `--maxWorkers=4` (first session, 198 files)                                       | 49.2 s                                                            |
| `pnpm lint`                                                                                     | 28.5 s                                                            |
| `pnpm typecheck`                                                                                | 8.4 s                                                             |
| `pnpm typecheck:tests`                                                                          | 8.2 s                                                             |
| Those four commands, summed                                                                     | 104 s                                                             |
| Tier 2 lean gate (`check.sh`), slowest cold run of three sessions                               | **174 s** cold, **112 s** with Postgres already up                |
| `pnpm format:check`, 11-core M3 Pro, 2026-10-23                                                 | 8.7 s first run, 7.2 s second                                     |
| Gate with the Format step (`check.sh`, #1006), 11-core M3 Pro, 2026-10-23, Postgres already up  | 57 s first run, 45 s second                                       |

⚠ **One unit spec boots the Payload config, and it is the lane's most expensive
file.** `tests/unit/sanitized-config-rules.spec.ts` imports `@/payload.config`
to walk the sanitized config: 6.9 s wall, of which 6.7 s is that import and 46 ms
the assertions. It is paid once per worker, not per case, and it sits in
both selections above the hook can fire, which is what makes them the widest.
Budget it against Tier 1's per-edit target rather than against the lane. Nothing else under `tests/unit/` imports that
module; keep it that way.

**The gate's own spread is `scripts/ensure-test-db.sh`.** It costs nothing once
port 5432 answers, which is why a warm run lands on the four commands' 104 s and
a session's first run does not. Cold runs measured 138 s, 174 s and 110 s in three
sessions — the same unreliability as the lane above, so **Tier 2's target is set
over the slowest cold run, not over the median**. Time it warm to compare against
this row.

**The Format step (#1006) postdates the 174 s cold run.** `pnpm format:check`
cost 15 s cold on 4 cores on 2026-10-20 (`89f6569`, 239 files), so a 4-core cold
gate lands near 189 s — still inside the 210 s target. The two M3 Pro rows above
are warm runs with the step in place; re-take the 4-core cold row with it before
moving the target.

⚠ **3 workers, not 4.** Vitest's non-watch default is `max(cores - 1, 1)`
(`getDefaultThreadsCount`, `vitest/dist/chunks/cli-api.*.js`), so every figure
above that does not name a worker count is a **3**-worker figure on a 4-core
box. Reading it as one-per-core is what makes a core-count extrapolation come
out several times too fast.

**The cost is importing 203 module graphs, not running 2643 assertions.**
Test bodies are 17.5 s of the 77.9 s while `import` alone sums to 142 s of
worker time, and no single file is slow — the slowest is 1.8 s. Both figures
are the breakdown Vitest prints on every run.

**No worker count reaches `< 5 s` for the whole lane, because about 19 s of it
is serial.** Fitting `wall = S + P/N` to the first session's 1-worker and
4-worker runs gives
**S ≈ 19 s, P ≈ 122 s**, and that fit predicts the 3-worker run at 59.4 s
against 59.2 s measured — so it holds across all three. Nothing goes below `S`
however many cores are bought. Running fewer files can.

**What the budget protects is the per-edit hook, so Tier 1's target is set
from what a narrowed hook costs — not from the lane, and not from one spec.**
Selecting the specs that name an edited module gives 1 spec for the median
module, 9 for `tests/utils/importGraph.ts`, and 18 for `@/payload-types`, the
generated file `pnpm generate:types` rewrites. Those cost 1.3, 8.0 and 7.8 s
measured above. The hook skips generated files, so its own slowest on 4 cores
is the importGraph nine.
**Tier 1 targets `< 12 s`**: it bounds the widest of those with room for the
spread this file records, and it matches SahajAtlasWeb's own measured
per-edit budget on the same core count, whose hook this one copies. 5 s was
below the widest real selection on 4 cores, and 65 s was the whole lane
wearing the hook's name.

So the lane is not cut and the hook is narrowed to the specs one edit can
break — #990 settled that, #993 did it. The next section times the hook.

## The per-edit hook — 2026-10-20

Timed as the hook itself, the command under Tier 1's budget, with the
`time … unit-test.mjs` lines above. On the sixth session's M3 Pro laptop,
one warm-up run, then three:

| Edited file                                                                  | Specs selected | Hook wall-clock, consecutive runs | Median |
| ---------------------------------------------------------------------------- | -------------- | --------------------------------- | ------ |
| `src/lib/richEditor/index.ts`, the edit #993 reproduced the false failure on | 0              | 0.18 · 0.18 · 0.20 s              | 0.18 s |
| `seeds/lib/lexicalConverter.ts`                                              | 2              | 0.82 · 0.81 · 0.78 s              | 0.81 s |
| `src/lib/locales/index.ts`                                                   | 7              | 1.50 · 1.39 · 1.48 s              | 1.48 s |
| `src/plugins/login/index.ts`                                                 | 8              | 3.03 · 2.67 · 2.68 s              | 2.68 s |
| `tests/utils/importGraph.ts`, the widest in the tree                         | 9              | 3.09 · 3.13 · 2.88 s              | 3.09 s |

**Most edits run nothing.** 399 of the 664 modules under `src/` are named by
no spec, so the hook spawns no vitest and costs 0.2 s, mostly node's own
start-up. The median `src/` edit selects none.

Timed again on 2026-10-21, on 4 cores (Intel Xeon @ 2.80 GHz), one warm-up
then three:

| Edited file                                          | Specs selected | Hook wall-clock, consecutive runs | Median    |
| ---------------------------------------------------- | -------------- | --------------------------------- | --------- |
| `tests/utils/importGraph.ts`, the widest in the tree | 9              | 7.65 · 8.12 · 8.03 s              | **8.0 s** |
| `src/plugins/login/index.ts`                         | 8              | 7.35 · 7.46 · 7.86 s              | 7.5 s     |
| `README.md`, the widest doc                          | 3              | 1.17 · 1.06 s                     | 1.1 s     |
| `src/lib/richEditor/index.ts`                        | 0              | 0.12 s                            | 0.12 s    |

**So 8.0 s is the slowest recorded on 4 cores** — the figure Tier 1's `< 12 s`
is held to, and the widest selection is the slowest there too. An earlier
session timed the 7 specs naming `@/plugins/login` at 6.9 s and another the 8
at 6.1 s, on the same container spec, so the move here is the spread this
file records rather than a regression. Width stands in for time without being it:
`tests/unit/select-unit-specs.spec.ts` caps the widest selection at 10, and a
jump past that means re-timing here.

⚠ **The hook selects by name, never by import.** A spec runs when its own
text names the edited module, through an alias, a relative path or a quoted
repo path (`scripts/select-unit-specs.mjs`). That is why `richEditor` runs
nothing although 40 specs reach it through a collection. Following imports
selects up to 86 of the 222 specs for one edit (`@/lib/locales`), so the
lean gate and CI catch that coupling instead.

## The integration lane — baseline, 2026-06-18 (before #499 §2)

Measured on the unmodified config (`pool: 'forks'`, `maxConcurrency: 1`, no
explicit `fileParallelism`/`poolOptions`), before the explicit-parallelism
change.

| Metric                                 | Value                                      |
| -------------------------------------- | ------------------------------------------ |
| Suites / tests                         | 38 files, 675 tests (all passing)          |
| **Total wall-clock — local**           | **314.5s** (`pnpm test:int`)               |
| Total wall-clock — CI (reference)      | ~240–300s for the whole Lint+Test job¹     |
| **Cold per-file bootstrap (isolated)** | **~58–60s** (3–4 trivial tests per file)²  |
| CPU utilisation (local)                | user 841s + sys 166s over 314s ≈ 3.2 cores |

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
tests _within_ a file, not files). The dominant cost is the per-suite
full-schema `push`, and every fork contends on the **same Postgres**, so
the lane is **DB-bound, not CPU-bound**: adding forks past a point yields
diminishing returns and risks exhausting Postgres connections (each
Payload instance opens a pool).

The right lever is therefore to make file parallelism **explicit and
bounded** — prevent connection storms on high-core CI, leave headroom for
the dev machine locally — not to crank fork count. See the schema-reuse
evaluation below for the alternative that _was_ considered and rejected.

## The integration lane — after, 2026-06-18 (with #499 §2 explicit parallelism)

Same command, same machine (11 cores), with `fileParallelism: true` +
`poolOptions.forks.maxForks` bounded (6 locally) and the §7 orphaned-schema
sweep active. All 38 files / 675 tests still pass.

| Metric                   | Value  | Δ vs baseline   |
| ------------------------ | ------ | --------------- |
| Total wall-clock — local | 261.5s | **−53s (−17%)** |

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
rebuilding Payload's _generated_ DDL (enum types, sequences, foreign keys,
indexes, the `_v` version tables) by hand per suite is fragile and would
drift the moment the schema changes — exactly the kind of bespoke
infrastructure the suite avoids. The realistic, low-risk win — bounded
explicit file parallelism — is delivered instead, and the
`synchronous_commit=off` / `imageSizes: []` optimisations are kept. Revisit
only if a future Payload/Drizzle release exposes a supported
template-schema or schema-snapshot mechanism.
