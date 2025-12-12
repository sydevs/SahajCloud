# Testing Strategy

This project uses a comprehensive testing approach with complete test isolation:

## What to Test vs What NOT to Test

### DO Test (Our Custom Code)

- **Custom hooks** (`src/hooks/`) - Business logic like `validateClientData`, `checkHighUsageAlert`
- **Custom utilities** (`src/lib/fieldUtils.ts`) - `sanitizeFilename`, `processFile`
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

## Test Isolation (In-Memory SQLite)

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

## Test Configuration

- Tests run sequentially (`maxConcurrency: 1`) to prevent resource conflicts
- Each test suite gets a unique in-memory SQLite database
- Automatic database cleanup ensures no test data persists between runs
