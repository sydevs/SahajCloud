---
paths: tests/**/*.spec.ts
---

# Testing Rules

Rules for writing tests in this codebase.

## What to Test vs What NOT to Test

### DO Test (Our Custom Code)
- Custom hooks (`src/hooks/`)
- Custom utilities (`src/lib/`)
- Access control functions (`hasPermission()`, `roleBasedAccess()`)
- Custom field logic (virtual fields, computed values)
- Business-critical workflows
- Collection relationships

### DO NOT Test (Payload CMS Core)
- Basic CRUD operations
- Field validation (required fields, types)
- Slug generation
- Localization behavior
- Email/Auth flows
- File upload mechanics
- minRows/maxRows validation

## Verifying "coverage gap" claims before writing tests

When an issue or PR description asserts that some behavior is under-tested, **verify the claim before writing the test**. Grep the existing suite for the behavior under test — a surprising share of claimed gaps turn out to be already covered, and writing redundant tests is the #1 form of scope creep on test-audit work.

Practical approach:

```bash
# 1. Find files that already touch the claimed area
rg -l "RRuleTemporal|DST|timezone" tests/
rg -l "filterMeditationsByLocale|locale.*filter" tests/

# 2. List their existing cases
grep -E "^\s*(it|describe)\(" tests/int/schedule-hooks.int.spec.ts
```

If the cases are already covered, **document that finding in the PR description** and move on. Add a test only when you can point to a specific behavior the existing suite does not assert. Examples from #281: claimed schedule-DST gaps were already covered by `schedule-hooks.spec.ts`; real gap was OpenAPI DELETE/PATCH filtering across every content collection (not just `/api/pages`).

## Pure Functions vs Payload-backed Tests

**Rule of thumb**: if the code under test doesn't touch Payload (no `req.payload`, no collection queries, no access control), skip `createTestEnvironment()` and import the module directly. A pure-function test suite runs in ~200ms; a `createTestEnvironment()` suite runs in ~8s minimum. Over a full suite the difference is huge.

### When to use pure-function tests
- Utilities in `src/lib/` with no Payload dependency (e.g., `cloudflareStreamWebhook.ts`, `mimeUtils.ts`, `schemaUtils.ts`)
- Signature verification, parsing, validation logic
- Pure helpers extracted from route handlers (the thin-wrapper pattern — see `.claude/rules/routes.md`)

### Pattern

Use `vi.resetModules()` + dynamic `await import(...)` in `beforeEach` to swap env vars between cases. Inject dependencies (e.g., `fetchFn`, `logger`) as function arguments rather than stubbing globals, so tests don't leak state.

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

Examples in the codebase: `tests/int/storage-utils.int.spec.ts`, `tests/int/cloudflare-stream-webhook.int.spec.ts`.

## Writing Payload-backed Tests

Use `createTestEnvironment()` for tests that need a real Payload instance (collection operations, hooks, access control integration, relationships).

**IMPORTANT**: Only call `createTestEnvironment()` once per test file. Multiple calls cause Payload global state conflicts. Use nested `describe` blocks to organize tests within a single environment.

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
    // Test operations here
  })

  describe('nested feature tests', () => {
    // Share the same payload instance - do NOT create a new environment
    it('tests a specific feature', async () => {
      // Uses the same payload from outer describe
    })
  })
})
```

## Upload Collection Filename Assertions

Payload adds numeric suffixes to prevent collisions. Use regex patterns:

```typescript
// DON'T: Exact match
expect(song.filename).toBe('audio-42s.mp3')

// DO: Regex pattern allowing optional suffix
expect(song.filename).toMatch(/^audio-42s(-\d+)?\.mp3$/)
```

## Test File Organization

| File | Purpose |
|------|---------|
| `client-hooks.int.spec.ts` | Client beforeChange/afterChange hooks |
| `field-utils.int.spec.ts` | processFile utility |
| `storage-utils.int.spec.ts` | URL field factories, R2 adapter |
| `role-based-access.int.spec.ts` | hasPermission(), customResourceAccess |
| `[collection].int.spec.ts` | Collection-specific business logic |

## PayloadCMS Field Behavior Gotchas

| Scenario | Wrong Assumption | Correct Behavior |
|----------|-----------------|------------------|
| `hasMany` select, no values | `null` / `undefined` | `[]` (empty array) |
| Join field at `depth: 0` | `{ id: number }[]` | `number[]` (raw IDs) |
| `payload.create()` + relationship | Returns raw ID | Returns populated object |
| `filterOptions` fallback | Return `{}` | Return `true` |

## Meditations Locale Filtering in Tests

The Meditations collection has a `filterMeditationsByLocale` beforeOperation hook that reads `req.locale` and adds a `{ locale: { equals: req.locale } }` where clause. In local API calls, `req.locale` defaults to `'en'`.

When testing non-English meditation queries, you **must** pass `locale` to `payload.find()` — otherwise the hook's implicit `locale: 'en'` filter conflicts with your explicit where clause:

```typescript
// ❌ WRONG: req.locale defaults to 'en', hook adds locale='en', conflicts with where locale='cs'
const result = await payload.find({
  collection: 'meditations',
  where: { locale: { equals: 'cs' } },
})
// Returns empty — no doc has locale='en' AND locale='cs'

// ✅ CORRECT: pass locale so req.locale='cs' matches the where clause
const result = await payload.find({
  collection: 'meditations',
  locale: 'cs',
  where: { locale: { equals: 'cs' } },
})
```

Full details: @.claude/docs/testing.md

## E2E Test Commands

```bash
pnpm test:e2e                    # Run all E2E tests
pnpm exec playwright test --ui   # Run with UI mode
CLEAN_E2E_DB=true pnpm test:e2e  # Clean database first
```

Full testing reference: @.claude/docs/testing.md
