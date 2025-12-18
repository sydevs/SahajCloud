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

Use `createTestEnvironment()` for complete test isolation:

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
})
```

## Upload Collection Filename Assertions

Payload adds numeric suffixes to prevent collisions. Use regex patterns:

```typescript
// DON'T: Exact match
expect(music.filename).toBe('audio-42s.mp3')

// DO: Regex pattern allowing optional suffix
expect(music.filename).toMatch(/^audio-42s(-\d+)?\.mp3$/)
```

## Test File Organization

| File | Purpose |
|------|---------|
| `client-hooks.int.spec.ts` | Client beforeChange/afterChange hooks |
| `field-utils.int.spec.ts` | processFile utility |
| `storage-utils.int.spec.ts` | URL field factories, R2 adapter |
| `role-based-access.int.spec.ts` | hasPermission(), customResourceAccess |
| `[collection].int.spec.ts` | Collection-specific business logic |

## E2E Test Commands

```bash
pnpm test:e2e                    # Run all E2E tests
pnpm exec playwright test --ui   # Run with UI mode
CLEAN_E2E_DB=true pnpm test:e2e  # Clean database first
```

Full testing reference: @.claude/docs/testing.md
