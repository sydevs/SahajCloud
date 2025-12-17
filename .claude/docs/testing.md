# Testing Strategy

This project uses a comprehensive testing approach with complete test isolation:

## What to Test vs What NOT to Test

### DO Test (Our Custom Code)

- **Custom hooks** (`src/hooks/`) - Business logic like `validateClientData`, `checkHighUsageAlert`
- **Custom utilities** (`src/lib/fieldUtils.ts`) - `sanitizeFilename`, `processFile`
- **Storage utilities** (`src/lib/storage/`) - URL field factories, adapter filename sanitization
- **Access control functions** (`src/lib/accessControl.ts`) - `hasPermission()`, `roleBasedAccess()`
- **Custom field logic** - Virtual fields, computed values, custom validation
- **Document-level permissions** - `customResourceAccess` behavior
- **Business-critical workflows** - Usage tracking, API authentication
- **Collection relationships** - Custom relationship behavior and joins
- **Locale-specific logic** - Custom locale filtering in meditations

### DO NOT Test (Payload CMS Core)

- **Basic CRUD operations** - Payload handles create/read/update/delete
- **Field validation** - Required fields, type validation (Payload's job)
- **Slug generation** - Better Fields plugin handles this automatically
- **Localization behavior** - Payload's locale fallback and storage
- **Email/Auth flows** - Payload's built-in authentication system
- **File upload mechanics** - Payload's upload handling and storage adapters
- **minRows/maxRows validation** - Payload's array field validation

### Test File Organization

| File | Purpose |
|------|---------|
| `client-hooks.int.spec.ts` | Tests for client beforeChange/afterChange hooks |
| `field-utils.int.spec.ts` | Tests for sanitizeFilename and processFile utilities |
| `storage-utils.int.spec.ts` | Tests for URL field factories and R2 adapter filename sanitization |
| `role-based-access.int.spec.ts` | Tests for hasPermission(), customResourceAccess, locale permissions |
| `usage-tracking.int.spec.ts` | Tests for API usage tracking job handlers |
| `[collection].int.spec.ts` | Collection-specific business logic (relationships, custom fields) |

## Test Types

### Integration Tests

Located in `tests/int/` directory using Vitest:
- Custom hook logic tests
- Access control function tests
- Business-critical workflow tests
- Collection relationship tests

### E2E Tests

Playwright tests for full application workflows:
- Admin panel user interface testing
- File upload workflows
- Role-based UI visibility

## E2E Test Database Isolation

E2E tests use a separate file-based SQLite database, isolated from the development D1 database:

### Architecture

- **Database**: File-based SQLite at `tests/.e2e.sqlite`
- **Global Setup**: `tests/setup/playwright.global-setup.ts` - Seeds test data before tests run
- **Global Teardown**: `tests/setup/playwright.global-teardown.ts` - Optional cleanup after tests
- **Config**: `tests/config/e2e-payload.config.ts` - E2E-specific Payload configuration

### Seeded Test Data

Global setup automatically seeds:
- **Default Manager**: `contact@sydevelopers.com` / `evk1VTH5dxz_nhg-mzk` (admin, verified)
- **Test Narrator**: Male narrator for meditation testing
- **Test Image**: Sample thumbnail image
- **Test Meditation**: Meditation with audio file
- **Test Frames**: Sample frames for frame editor testing

### Running E2E Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run specific E2E test file
pnpm exec playwright test tests/e2e/clients.e2e.spec.ts

# Run with UI mode for debugging
pnpm exec playwright test --ui

# Clean E2E database before run
CLEAN_E2E_DB=true pnpm test:e2e
```

### Environment Variables

- `E2E_TEST=true` - Enables E2E test mode (uses file-based SQLite instead of D1)
- `CLEAN_E2E_DB=true` - Removes E2E database in global teardown
- `PAYLOAD_SECRET` - Set to `e2e-test-secret-key` for E2E tests

### Key Implementation Details

- E2E tests run on port 4567 (separate from dev server)
- Manager must have `_verified: true` for login to work (bypasses email verification)
- Database is preserved between runs for faster iteration (use `CLEAN_E2E_DB=true` to reset)
- Test files directory: `tests/files/` contains sample audio/image files for seeding

## Integration Test Isolation (In-Memory SQLite)

- **Complete Isolation**: Each test suite runs in its own in-memory SQLite database
- **Automatic Cleanup**: Databases are automatically created and destroyed per test suite
- **No Data Conflicts**: Tests can run in parallel without data interference
- **Fast Execution**: In-memory database provides rapid test execution
- **No external dependencies**: No database server required (using better-sqlite3)

## Test Environment Setup

- `tests/setup/globalSetup.ts` - Test environment setup
- `tests/config/test-payload.config.ts` - Test-specific Payload configuration with in-memory SQLite
- `tests/utils/testHelpers.ts` - Utilities for creating isolated test environments

## Writing Isolated Tests

Use the `createTestEnvironment()` helper for complete test isolation:

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { User } from '@/payload-types'
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
    // Test operations here - completely isolated from other tests
  })
})
```

## Common Testing Patterns

### Upload Collection Filename Assertions

When testing upload collections (Files, Music, Meditations, etc.), Payload CMS automatically adds numeric suffixes to filenames to prevent collisions. Tests should use regex patterns instead of exact matches:

```typescript
// ❌ DON'T: Exact match (fails when Payload adds collision suffix)
expect(music.filename).toBe('audio-42s.mp3')

// ✅ DO: Regex pattern allowing optional numeric suffix
expect(music.filename).toMatch(/^audio-42s(-\d+)?\.mp3$/)

// For filenames with dots in the name
const escapedName = format.name.replace('.', '(-\\d+)?\\.')
expect(music.filename).toMatch(new RegExp(`^${escapedName}$`))
```

This pattern accounts for filenames like:
- `audio-42s.mp3` (no collision)
- `audio-42s-10.mp3` (collision avoided)

## Test Configuration

- Tests run sequentially (`maxConcurrency: 1`) to prevent resource conflicts
- Each test suite gets a unique in-memory SQLite database
- Automatic database cleanup ensures no test data persists between runs
