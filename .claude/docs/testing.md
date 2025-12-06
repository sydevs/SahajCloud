# Testing Strategy

This project uses a comprehensive testing approach with complete test isolation:

## Test Types

### Integration Tests

Located in `tests/int/` directory using Vitest:
- Collection API tests for CRUD operations and relationships
- Component logic tests for validation and data processing
- MeditationFrameEditor tests for frame management and synchronization

### E2E Tests

Playwright tests for full application workflows:
- Admin panel user interface testing
- MeditationFrameEditor modal and interaction testing

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
