---
paths:
  - tests/**/*.spec.ts
---

# Testing

Rules for writing and running tests in this codebase.

## What to test (and what NOT to test)

### DO test

- Custom hooks (`src/hooks/`) — `validateClientData`, `checkHighUsageAlert`, etc.
- Storage utilities (`src/lib/storage/`) — URL field factories, R2 filename sanitization
- Access control (`hasPermission`, `roleBasedAccess`, `customResourceAccess`)
- Custom field logic — virtual fields, computed values, custom validators
- Document-level permissions
- Business-critical workflows — usage tracking, API auth
- Custom collection relationships and joins
- Locale-specific custom logic — e.g., the Meditations locale filter

### DO NOT test (PayloadCMS internals)

- Basic CRUD operations
- Field validation (required, type checks)
- Slug generation
- Localization fallback behavior
- Email / auth flows
- File upload mechanics
- `minRows` / `maxRows` array validation

## Test lanes (Vitest projects)

| Lane            | Files                        | Speed                   | When                                                                                  |
| --------------- | ---------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| **Unit**        | `tests/unit/**/*.spec.ts`    | ~1–2 s for ~200 cases   | Pure functions, no Payload bootstrap. **No** `globalSetup`/`setupFiles`.              |
| **Integration** | `tests/int/**/*.int.spec.ts` | ~8 s bootstrap per file | Calls `createTestEnvironment()`, exercises hooks/access/virtual fields/relationships. |
| **E2E**         | `tests/e2e/**/*.e2e.spec.ts` | Playwright              | Full UI flows, file-based SQLite.                                                     |

### When to put a test in `tests/unit/`

- Has no `createTestEnvironment()` call.
- Doesn't touch `payload.*` or collection operations.
- Is a utility, helper, factory, or schema validator.

Examples already in the codebase: rule evaluation, color utilities,
weighted sampling, locale builder, duration extraction, schedule
RRULE/DST computations, Lexical block migration helpers,
filterAvailableLocales, buildRateLimitKey, seed pagination helpers,
unify-index-blocks migration transforms.

### When to put a test in `tests/int/`

- The test calls `createTestEnvironment()`.
- The code under test takes a `Payload` instance as a parameter.
- You need hooks, access control, or actual collection state.

### Pattern for env-var swapping (unit lane)

Use `vi.resetModules()` + dynamic `await import(...)` to swap env vars
between cases. Inject dependencies (`fetchFn`, `logger`) as function
arguments instead of stubbing globals — keeps tests state-clean.

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

CI (`.github/workflows/ci.yml`) runs the full suite on every PR — locally, run **targeted**:

```bash
pnpm test:unit                                                                      # whole unit lane (fast)
pnpm exec vitest run tests/int/albums.int.spec.ts --config ./vitest.config.mts      # one integration file
pnpm exec vitest run tests/int/albums.int.spec.ts -t "creates an album"             # one case by name
pnpm exec vitest run tests/unit/convert-vimeo.spec.ts --config ./vitest.config.mts  # one unit file
```

The `--config ./vitest.config.mts` flag is required — the config defines the `unit`/`int` projects and injects test env vars. Reserve the full `pnpm test:int` / `pnpm build` for reproducing a red CI check. See `.claude/rules/testing-reqs.md` for the local-vs-CI split.

## Verifying "coverage gap" claims

When an issue or PR description claims behavior is under-tested,
**verify the claim before writing the test**. Grep the existing suite —
a surprising share of "gaps" are already covered, and writing redundant
tests is the #1 form of scope creep on test-audit work.

```bash
rg -l "RRuleTemporal|DST|timezone" tests/
rg -l "filterMeditationsByLocale|locale.*filter" tests/
grep -E "^\s*(it|describe)\(" tests/int/schedule-hooks.int.spec.ts
```

If existing cases cover the claim, **document that finding in the PR
description** and move on. Add a test only when you can point to a
specific behavior the existing suite does not assert.

Real example from #281: claimed schedule-DST gaps were already covered
by `schedule-hooks.spec.ts`; the actual gap was OpenAPI DELETE/PATCH
filtering across every content collection.

## Writing Payload-backed tests

Use `createTestEnvironment()` from `tests/utils/testHelpers.ts`. **Only
call it once per file** — multiple calls cause Payload global-state
conflicts (`TypeError: Cannot read properties of undefined`). Use nested
`describe` blocks to organize cases inside a single environment.

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

Each integration test file gets its own in-memory SQLite database (via
`better-sqlite3`). Automatic creation/destruction per test suite. No
external dependencies. No data conflicts between suites. Tests run
sequentially (`maxConcurrency: 1`) to prevent resource conflicts.

## Test file organization

| File                              | Purpose                                                                                                                                                                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collections-smoke.int.spec.ts`   | **One reachability canary per content-bearing collection** (create + read + relationship populate). Before creating a dedicated `[collection].int.spec.ts`, check if the smoke file already covers your case. Only add a new file for collection-specific custom behavior. |
| `client-hooks.int.spec.ts`        | Client beforeChange/afterChange hooks                                                                                                                                                                                                                                      |
| `meditation-duration.int.spec.ts` | Audio duration extraction + `durationMinutes` virtual field                                                                                                                                                                                                                |
| `field-utils.int.spec.ts`         | `processFile` utility                                                                                                                                                                                                                                                      |
| `storage-utils.int.spec.ts`       | URL field factories, R2 adapter                                                                                                                                                                                                                                            |
| `role-based-access.int.spec.ts`   | `hasPermission`, `customResourceAccess`, locale permissions                                                                                                                                                                                                                |
| `usage-tracking.int.spec.ts`      | API usage tracking job handlers                                                                                                                                                                                                                                            |
| `[collection].int.spec.ts`        | **Collection-specific custom behavior only** — don't duplicate smoke coverage                                                                                                                                                                                              |

## Common testing patterns

### Upload collection filename assertions

Payload appends numeric suffixes to prevent collisions. Match with regex,
not exact strings:

```typescript
// ❌ Exact match — fails when collision suffix is added
expect(song.filename).toBe('audio-42s.mp3')

// ✅ Regex pattern allowing optional suffix
expect(song.filename).toMatch(/^audio-42s(-\d+)?\.mp3$/)

// For filenames with dots in the name
const escapedName = format.name.replace('.', '(-\\d+)?\\.')
expect(song.filename).toMatch(new RegExp(`^${escapedName}$`))
```

### Mock user objects for visibility tests

The bypass function checks `user.collection === 'managers'` before
`user.type === 'admin'`. Mock users **must** include `collection`:

```typescript
// ✅ bypass recognizes admin
const mockAdmin = { collection: 'managers', type: 'admin', currentProject: 'wemeditate-web' }
expect(hiddenFn({ user: mockAdmin as any })).toBe(false)

// ❌ bypass won't grant admin access — missing collection
const mockAdmin = { type: 'admin', currentProject: 'wemeditate-web' }
```

### PayloadCMS field sanitization

PayloadCMS sanitizes field configs during initialization — `localized: true`
is removed when the parent is already localized (or when localization is
disabled). This affects how you test:

```typescript
// ❌ Direct check on sanitized config — property has been removed
const field = payload.globals.config.find((g) => g.slug === 'my-global')?.fields[0]
expect(field.localized).toBe(true) // FAILS

// ✅ Functional test — proves localization works
await payload.updateGlobal({ slug: 'my-global', locale: 'en', data: { field: 'English value' } })
await payload.updateGlobal({ slug: 'my-global', locale: 'cs', data: { field: 'Czech value' } })
const en = await payload.findGlobal({ slug: 'my-global', locale: 'en', fallbackLocale: false })
expect(en.field).toBe('English value')
```

Unit tests on raw config output (e.g. `buildTranslationTabs()`) can check
`localized: true` because they run **before** sanitization. Integration
tests accessing `payload.globals.config` cannot.

The test environment in `testHelpers.ts` must have `localization`
configured for localized-field tests to work properly.

## PayloadCMS field-behavior gotchas

| Scenario                             | Wrong assumption                                 | Correct behavior                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hasMany` select, no values          | `null` / `undefined`                             | `[]` (empty array)                                                                                                                                                                                                                                           |
| Join field at `depth: 0`             | `{ id: number }[]`                               | `number[]` (raw IDs)                                                                                                                                                                                                                                         |
| `payload.create()` + relationship    | Returns raw ID                                   | Returns populated object                                                                                                                                                                                                                                     |
| `filterOptions` fallback             | Return `{}`                                      | Return `true`                                                                                                                                                                                                                                                |
| Mixed-collection response assertions | `.docs.map(d => d.id)` uniquely identifies a row | Each collection has its own auto-increment, so `lectures.id=3` and `lecture-clips.id=3` both exist. Filter by discriminator first (`d.type === 'lecture'`) or match on `title`/slug. Asserting raw numeric id against a mixed pool silently false-positives. |

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
beforeOperation hook that reads `req.locale` and adds
`{ locale: { equals: req.locale } }` to `find`/`count`. In local API
calls `req.locale` defaults to `'en'`.

When testing non-English meditation queries you **must** pass `locale`
to `payload.find()` — otherwise the hook's implicit `locale: 'en'`
filter conflicts with your explicit where clause:

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

## E2E test database isolation

E2E tests use a separate file-based SQLite DB at `tests/.e2e.sqlite`,
isolated from the dev D1 database. Run on port 4567 (separate from dev
server).

| File                                        | Purpose                              |
| ------------------------------------------- | ------------------------------------ |
| `tests/setup/playwright.global-setup.ts`    | Seeds test data before E2E tests     |
| `tests/setup/playwright.global-teardown.ts` | Optional cleanup                     |
| `tests/config/e2e-payload.config.ts`        | E2E-specific Payload config          |
| `tests/files/`                              | Sample audio/image files for seeding |

### Seeded test data

- Default Manager: `contact@sydevelopers.com` / `evk1VTH5dxz_nhg-mzk` (admin, `_verified: true`)
- Test Narrator (male)
- Test Image (sample thumbnail)
- Test Meditation (with audio file)
- Test Frames

### Env vars

| Var                 | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `E2E_TEST=true`     | Enables E2E mode (file-based SQLite, not D1) |
| `CLEAN_E2E_DB=true` | Removes the E2E database after teardown      |
| `PAYLOAD_SECRET`    | `e2e-test-secret-key` for E2E                |

The DB is reset at the start of every run to prevent `drizzle-kit push`
from prompting on stale schemas (which would hang Playwright's
subprocess). Manager must have `_verified: true` for login (bypasses
email verification).

### E2E commands

```bash
pnpm test:e2e                              # all E2E tests
pnpm exec playwright test tests/e2e/clients.e2e.spec.ts
pnpm exec playwright test --ui             # debug UI
CLEAN_E2E_DB=true pnpm test:e2e            # clean teardown
```

The `tests/e2e/` directory is currently empty; `pnpm test:e2e` no-ops
until a spec is added.
