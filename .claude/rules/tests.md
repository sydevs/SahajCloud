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

## Writing Isolated Tests

Use `createTestEnvironment()` for complete test isolation.

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
