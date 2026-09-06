# Testing

Rules for writing and running tests in this codebase.

## What to test (and what not to)

**Do test**: custom hooks (`src/hooks/`), storage utilities (URL field
factories, R2 filename sanitization), access control (`hasPermission`,
`roleBasedAccess`, document-level manager access), custom field logic
(virtual fields, computed values, custom validators), document-level
permissions, business-critical workflows (usage tracking, API auth),
custom collection relationships and joins, locale-specific custom logic
(e.g. the Meditations locale filter).

**Do not test** (PayloadCMS internals): basic CRUD, field validation
(required, type checks), slug generation, localization fallback behavior,
email/auth flows, file upload mechanics, `minRows`/`maxRows` array
validation.

## Test lanes (Vitest projects)

| Lane            | Files                        | Speed                   | When                                                                                  |
| --------------- | ----------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| **Unit**        | `tests/unit/**/*.spec.ts`    | ~1–2 s for ~200 cases   | Pure functions, no Payload bootstrap. **No** `globalSetup`/`setupFiles`.              |
| **Integration** | `tests/int/**/*.int.spec.ts` | bootstrap-heavy per file (full-schema push. See `tests/PERF.md`) | Calls `createTestEnvironment()`, exercises hooks/access/virtual fields/relationships. Files run in parallel (see below). |
| **Smoke (E2E)** | `tests/e2e/**/*.e2e.spec.ts` | Playwright (REST)       | Tier-3 smoke against the Railway PR preview (`pnpm test:smoke`). See below.            |

### When to put a test in `tests/unit/`

Put it there when it has no `createTestEnvironment()` call, doesn't touch
`payload.*` or collection operations, and is a utility, helper, factory, or
schema validator. Examples already in the codebase: rule evaluation, color
utilities, weighted sampling, the locale builder, duration extraction,
schedule RRULE/DST computations, Lexical block migration helpers,
`filterAvailableLocales`, `buildRateLimitKey`, seed pagination helpers,
unify-index-blocks migration transforms.

### When to put a test in `tests/int/`

Put it there when the test calls `createTestEnvironment()`, the code under
test takes a `Payload` instance as a parameter, or you need hooks, access
control, or actual collection state.

### Pattern for env-var swapping (unit lane)

Use `vi.resetModules()` + a dynamic `await import(...)` to swap env vars
between cases. Inject dependencies (`fetchFn`, `logger`) as function
arguments instead of stubbing globals, to keep tests state-clean.

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let myHelper: typeof import('@/lib/domain/myHelper').myHelper

beforeEach(async () => {
  vi.resetModules()
  process.env = { ...originalEnv, SOME_VAR: 'test-value' }
  const mod = await import('@/lib/domain/myHelper')
  myHelper = mod.myHelper
})

afterEach(() => {
  process.env = originalEnv
  vi.restoreAllMocks()
})
```

Examples: `tests/int/storage-utils.int.spec.ts`,
`tests/int/cloudflare-stream-webhook.int.spec.ts`.

## Running tests locally

CI (`.github/workflows/ci.yml`) runs the full suite on every PR. Locally,
run **targeted**:

```bash
pnpm test:unit                                                                      # whole unit lane (fast)
pnpm exec vitest run tests/int/albums.int.spec.ts --config ./vitest.config.mts      # one integration file
pnpm exec vitest run tests/int/albums.int.spec.ts -t "creates an album"             # one case by name
pnpm exec vitest run tests/unit/convert-vimeo.spec.ts --config ./vitest.config.mts  # one unit file
```

The `--config ./vitest.config.mts` flag is required — it defines the
`unit`/`int` projects and injects test env vars.

**"Tests no tests" on a file you just edited means the spec doesn't
parse** — not that no case matched. Vitest reports a syntax error in a
spec as an empty file, which reads like a config problem. Re-run without
piping through `grep` to see the real error, or run `pnpm exec tsc
--noEmit -p tsconfig.test.json`. (The real cause once: an unescaped
apostrophe inside a single-quoted test name — `it('renders keys in the
collection's order', …)`.)

Reserve the full `pnpm test:int` / `pnpm build` for reproducing a red CI
check. See `docs/rules/testing-reqs.md` for the local-vs-CI split.

## Checking "coverage gap" claims

When an issue or PR description claims behavior is under-tested, **check
the claim before writing the test**. Grep the existing suite — a
surprising share of "gaps" are already covered, and writing redundant
tests is the #1 form of scope creep on test-audit work.

```bash
rg -l "RRuleTemporal|DST|timezone" tests/
rg -l "filterMeditationsByLocale|locale.*filter" tests/
grep -E "^\s*(it|describe)\(" tests/int/schedule-hooks.int.spec.ts
```

If existing cases already cover the claim, document that finding in the PR
description and move on. Add a test only when you can point to a specific
behavior the existing suite does not assert.

Real example from #281: the claimed schedule-DST gaps were already
covered by `schedule-hooks.spec.ts`. The actual gap was OpenAPI
DELETE/PATCH filtering across every content collection.

## Writing Payload-backed tests

Use `createTestEnvironment()` from `tests/utils/testHelpers.ts`. **Call it
only once per file** — multiple calls cause Payload global-state conflicts
(`TypeError: Cannot read properties of undefined`). Use nested `describe`
blocks to organize cases inside a single environment.

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'

describe('My Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  it('performs operations with complete isolation', async () => {
    // Test operations
  })

  describe('nested feature tests', () => {
    // Share the same payload instance
  })
})
```

## Integration test isolation

Each integration test file gets its own isolated **Postgres schema**
(created via Drizzle `push`, dropped on cleanup) against `DATABASE_URL` —
the same per-suite isolation the in-memory SQLite previously provided.
Requires a reachable Postgres (Docker locally, a service container in
CI). No data conflicts between suites.

**Test files run in parallel** across forked workers (`pool: 'forks'`,
`fileParallelism: true`), bounded by `poolOptions.forks.maxForks` — 6
locally (leaves the dev machine headroom), ≤4 in CI, override with
`VITEST_INT_MAX_FORKS`. The bound is deliberate: the lane is **DB-bound**
(every suite runs a full-schema `push` against the same Postgres), so more
forks give diminishing returns and risk exhausting connections — see
`tests/PERF.md`. `maxConcurrency: 1` only serialises tests **within** a
file. It does **not** serialise files.

## Typed fixtures

`pnpm typecheck:tests` (`tsconfig.test.json`) type-checks all of `tests/**`
in about 6 s — Vitest does not, since esbuild erases types without
checking them. Fixtures must be typed against the real schema for that to
catch anything, so `tests/utils/testData.ts` exports two helpers. Prefer
them over `Record<string, unknown>`, a bare object literal, or `as any`:

| Use | For |
| --- | ----- |
| `createData<'slug'>({ … })` | Anything you hand to `payload.create` as `data` |
| `FixtureOverrides<Doc>` | The param type of a spec's own fixture helper |

```typescript
import { createData, testData, type FixtureOverrides } from '../utils/testData'

const createRegion = (data: FixtureOverrides<Region>) =>
  payload.create({
    collection: 'regions',
    data: createData<'regions'>({ level: 'country', name: 'Region', ...data }),
  })

createRegion({ level: 'center' }) // TS2322 — 'center' was renamed to 'venue' (#605)
```

Each is needed for a different reason:

- **`createData`** — Payload derives the create `data` type from the
  *output* doc, so fields it fills itself (`slug`, …) are still demanded
  on input. Omit one and `tsc` falls through to the draft-create overload
  and reports `Property 'draft' is missing`, which points nowhere near the
  real problem.
- **`FixtureOverrides<T>`** — every field is optional at *every* depth.
  `Partial<T>` relaxes only the top level, so passing a group would
  otherwise oblige you to fill in its `defaultValue`-backed subfields.
  Unknown and mistyped properties still error at any depth, which is the
  part worth keeping.

Two more shared helpers: `runTaskHandler(task, { payload, … })`
(`tests/utils/taskRunner.ts`) invokes a job task without the queue and
returns its generated output type — don't hand-roll
`Parameters<typeof Task.handler>[0]`, which can't compile because
`handler` is `string | TaskHandler`. And `idOnlySelect()`
(`tests/utils/testHelpers.ts`) is the minimal `select` an API-client read
can pass. `select: {}` is **not** equivalent — the client gate rejects an
empty select with a 400.

### Driving the REST API from the integration lane

`createRestClient(env)` (`tests/utils/restRequest.ts`) issues authenticated
requests through `handleEndpoints` — Payload's public REST entry point, the
same one `@payloadcms/next`'s `REST_GET` calls. Reach for it **only** when
the behaviour under test lives in the REST layer and nowhere else. The
local API is faster and is right for everything else.

`createRestClientAs(env, manager)` does the same as any manager, and the
returned caller takes `(path, { method, json })` for a POST or DELETE.
**A third thing lives only in the REST layer: how `req.locale` is DERIVED.**
A spec that builds `req` by hand and hardcodes `locale: 'en'` cannot see a
request that names no locale at all — Payload then resolves the *default*
locale, and per-locale role gates deny anyone whose roles live elsewhere.
That is #701, and `frames-by-narrator` / `event-submissions-review` cover it
by logging in a French-only manager and varying `?locale=`.

Two things live only there, and both are why this exists (#684): **root
`afterError` hooks** (`databaseErrorPlugin`) run inside
`payload/dist/utilities/routeError.js`, which the local API throws
straight past — `payload.find()` surfaces the raw `DrizzleQueryError`, not
the 400. And the **`config.debug` redaction** that decides whether an
error body is the real message plus a stack, or `Something went wrong.`

`createTestEnvironment({ debug })` selects that flag (default `false`,
i.e. production's value) and returns the suite's `config`, which the
client needs. The helper logs the suite admin in and marks it `_verified`
first — `payload.login` refuses an unverified manager, and access control
answers **403 before any query runs**, so an anonymous request never
reaches Postgres at all.

⚠ **One environment per file still holds, and here is what violating it
looks like.** `getPayload` caches per config, so a second
`createTestEnvironment()` in the same file returns the **first**
instance — a pair of suites meant to compare two `debug` values would
silently assert one of them twice. It surfaces as the second call failing
to create its admin (`The following field is invalid: email`), because it
lands in the first suite's schema. Use two spec files, as
`error-disclosure.int.spec.ts` and `error-disclosure-debug.int.spec.ts`
do.

## Test file organization

| File                              | Purpose                                                                                                                                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collections-smoke.int.spec.ts`   | **One reachability canary per content-bearing collection** (create + read + relationship populate). Check this file before writing a dedicated `[collection].int.spec.ts`. Add a new file only for collection-specific custom behavior. |
| `client-hooks.int.spec.ts`        | Client beforeChange/afterChange hooks                                                                                                                                                                                                                                      |
| `meditation-duration.int.spec.ts` | Audio duration extraction + `durationMinutes` virtual field                                                                                                                                                                                                                |
| `field-utils.int.spec.ts`         | `processFile` utility                                                                                                                                                                                                                                                      |
| `storage-utils.int.spec.ts`       | URL field factories, R2 adapter                                                                                                                                                                                                                                            |
| `role-based-access.int.spec.ts`   | `hasPermission`, document-level manager access, locale permissions                                                                                                                                                                                                         |
| `usage-tracking.int.spec.ts`      | API usage tracking job handlers                                                                                                                                                                                                                                            |
| `[collection].int.spec.ts`        | **Collection-specific custom behavior only** — don't duplicate smoke coverage                                                                                                                                                                                              |

## Common testing patterns

### Upload collection filename assertions

Payload appends numeric suffixes to prevent collisions. Match with regex,
not an exact string:

```typescript
// ❌ Exact match — fails when a collision suffix is added
expect(song.filename).toBe('audio-42s.mp3')

// ✅ Regex pattern allowing an optional suffix
expect(song.filename).toMatch(/^audio-42s(-\d+)?\.mp3$/)

// For filenames with dots in the name
const escapedName = format.name.replace('.', '(-\\d+)?\\.')
expect(song.filename).toMatch(new RegExp(`^${escapedName}$`))
```

### Mock user objects for visibility tests

The bypass function checks `user.collection === 'managers'` before
`user.type === 'admin'`. A mock user **must** include `collection`:

```typescript
// ✅ bypass recognizes admin
const mockAdmin = { collection: 'managers', type: 'admin', currentProject: 'wemeditate-web' }
expect(hiddenFn({ user: mockAdmin as any })).toBe(false)

// ❌ bypass won't grant admin access — missing collection
const mockAdmin = { type: 'admin', currentProject: 'wemeditate-web' }
```

### PayloadCMS field sanitization

PayloadCMS sanitizes field configs during initialization — `localized:
true` is removed when the parent is already localized, or when
localization is disabled. That affects how you test:

```typescript
// ❌ Direct check on sanitized config — the property has been removed
const field = payload.globals.config.find((g) => g.slug === 'my-global')?.fields[0]
expect(field.localized).toBe(true) // FAILS

// ✅ Functional test — proves localization works
await payload.updateGlobal({ slug: 'my-global', locale: 'en', data: { field: 'English value' } })
await payload.updateGlobal({ slug: 'my-global', locale: 'cs', data: { field: 'Czech value' } })
const en = await payload.findGlobal({ slug: 'my-global', locale: 'en', fallbackLocale: false })
expect(en.field).toBe('English value')
```

Unit tests on raw config output (e.g. `buildTranslationTabs()`) can check
`localized: true`, because they run **before** sanitization. Integration
tests accessing `payload.globals.config` cannot.

The test environment in `testHelpers.ts` must configure `localization`
for localized-field tests to work.

## PayloadCMS field-behavior gotchas

| Scenario                             | Wrong assumption                                 | Correct behavior                                                                                                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hasMany` select, no values          | `null` / `undefined`                             | `[]` (empty array)                                                                                                                                                                                                                                           |
| Join field at `depth: 0`             | `{ id: number }[]`                               | `number[]` (raw IDs)                                                                                                                                                                                                                                         |
| `payload.create()` + relationship    | Returns the raw ID                                | Returns a populated object                                                                                                                                                                                                                                   |
| `filterOptions` fallback             | Return `{}`                                      | Return `true`                                                                                                                                                                                                                                                |
| Mixed-collection response assertions | `.docs.map(d => d.id)` uniquely identifies a row | Each collection has its own auto-increment, so `lectures.id=3` and `lecture-clips.id=3` both exist. Filter by discriminator first (`d.type === 'lecture'`) or match on `title`/slug — a raw numeric id against a mixed pool silently false-positives. |

```typescript
// hasMany select with no values
expect(tag.timings).toEqual([]) // not toBeFalsy() / toBeNull()

// Join at depth: 0
const childIds = children.docs.map((c) => (typeof c === 'number' ? c : c.id))

// payload.create() auto-populates
const child = await payload.create({ collection: 'tags', data: { parent: parentTag.id } })
const parentId =
  typeof child.parent === 'object' && child.parent !== null ? child.parent.id : child.parent
expect(parentId).toBe(parentTag.id)
```

## Meditations locale filtering in tests

The Meditations collection has a `filterMeditationsByLocale`
beforeOperation hook that reads `req.locale` and adds `{ locale: {
equals: req.locale } }` to `find`/`count`. In local API calls, `req.locale`
defaults to `'en'`.

When testing a non-English meditation query, you **must** pass `locale`
to `payload.find()` — otherwise the hook's implicit `locale: 'en'` filter
conflicts with your explicit where clause:

```typescript
// ❌ req.locale defaults to 'en', conflicts with where locale='cs'
const result = await payload.find({
  collection: 'meditations',
  where: { locale: { equals: 'cs' } },
})
// Returns empty — no doc matches locale='en' AND locale='cs'

// ✅ pass locale so req.locale='cs'
const result = await payload.find({
  collection: 'meditations',
  locale: 'cs',
  where: { locale: { equals: 'cs' } },
})
```

## Smoke specs (`tests/e2e/`)

The Tier-3 **smoke specs** are Playwright tests that exercise the REST API
of a **deployed** environment — they do not boot a local app or own a
database.

> **They need no browser, and CI must not install one.** Every spec uses
> only the `request` fixture (`APIRequestContext`), which is plain Node
> HTTP — nothing launches Chromium, despite the `chromium` project name in
> `playwright.config.ts`. CI used to run `playwright install --with-deps
> chromium`. That took **18 minutes**, blew the job's `timeout-minutes`, and
> the job reported as *cancelled* rather than failed, which reads as
> unexplained. Verified by running the whole suite with
> `PLAYWRIGHT_BROWSERS_PATH` pointed at an empty directory: all six specs
> issued real requests. If a future spec needs a page, install the browser
> in that spec's own job rather than the shared one.

CI points `PREVIEW_URL` at the per-PR **Railway preview** (discovered from
Railway's **GitHub commit status** by `scripts/get-railway-preview-url.ts`,
which needs no Railway API token) and runs `pnpm test:smoke`. Locally it falls back to
`http://localhost:3000` (the dev-server skill). Config:
`playwright.config.ts` (`testDir: ./tests/e2e`, `testMatch:
**/*.e2e.spec.ts`, `retries: 2` in CI).

| File                            | Purpose                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `tests/e2e/*.e2e.spec.ts`       | REST flows only a deployed environment can answer. Covers auth, content CRUD, CORS preflight, and what an error body discloses under the shipped `config.debug` (`error-disclosure`) |
| `tests/e2e/_helpers/preview.ts` | `ensureAdmin` (a login — the deploy provisions the admin) + auth headers |
| `tests/e2e/_helpers/runId.ts`   | Per-run record prefix so concurrent PR previews don't collide                    |
| `tests/files/`                  | Sample audio/image files used by upload specs                                    |

Specs **skip gracefully** when the preview DB has no seeded content (e.g.
no narrator/image/frame), so they never fail a fresh preview.

**A skipped smoke lane is not a passing one.** When
`get-railway-preview-url.ts` finds no preview, it exits cleanly and both
smoke steps skip, leaving the job green — so "Lint, Test & Smoke: pass"
can mean smoke never ran. CI now emits a `::warning` in that case. Read it
before trusting the check. Discovery budgets up to 12 min for the deploy
plus 5 min for health, so a slow Railway build can consume most of the job
on its own.

**A deploy that publishes no URL fails the job instead** (#661). Railway
can report `success` while the service has no domain, and that is broken
configuration, not an absent preview — so it must not skip quietly. The
script exits non-zero on the first such poll, and CI fails. Fix it on the
base environment, not the PR: `RAILWAY_RUNBOOK.md`. Discovery also returns
as soon as the status is terminal, so a healthy PR costs seconds, and only
a genuinely absent status still spends the full budget.

Records are namespaced by `runId()` (`SMOKE_RUN_ID` in CI), since runs
share the preview's cloned-prod data.

### Commands

```bash
pnpm test:smoke                                       # all smoke specs (vs PREVIEW_URL or localhost:3000)
PREVIEW_URL=https://<preview>.up.railway.app pnpm test:smoke
pnpm exec playwright test tests/e2e/auth.e2e.spec.ts  # one spec
pnpm exec playwright test --ui                        # debug UI
```

There is no `pnpm test:e2e` script or local-boot E2E config — the old
dedicated-`e2e`-schema / port-4567 setup was removed (#499 §4).
