# Test Isolation Setup

This directory contains the test isolation implementation using MongoDB Memory Server to ensure complete data isolation between tests.

## Overview

The test isolation system creates a unique in-memory MongoDB database for each test suite, ensuring:
- No data leakage between tests
- Fast test execution (in-memory database)
- Complete cleanup after each test run
- Parallel test execution without conflicts

## Files

### Configuration
- `tests/config/test-payload.config.ts` - Test-specific Payload configuration that uses MongoDB Memory Server
- `tests/setup/globalSetup.ts` - Vitest global setup that starts/stops MongoDB Memory Server
- `vitest.config.mts` - Vitest configuration with globalSetup reference

### Utilities
- `tests/utils/testHelpers.ts` - Utilities for creating isolated test environments and test data factories

### Example Tests
- `tests/int/users-isolated.int.spec.ts` - Demonstrates complete test isolation with Users collection

## How It Works

1. **Global Setup**: `globalSetup.ts` starts a MongoDB Memory Server instance and makes the connection URI available via environment variable
2. **Test Environment**: Each test suite calls `createTestEnvironment()` which:
   - Creates a unique database name with timestamp and random string
   - Initializes a Payload instance with the isolated database
   - Returns cleanup function to drop the database after tests
3. **Isolation**: Each test suite gets its own database, ensuring complete data separation

## Usage

### Creating an Isolated Test

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { User, Payload } from '@/payload-types'
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
    const result = await payload.create({
      collection: 'users',
      data: { email: 'test@example.com', password: 'password123' }
    })
    expect(result).toBeDefined()
  })
})
```

### Test Data Factories

```typescript
import { testData } from '../utils/testHelpers'

// Create test data with consistent defaults and overrides
const userData = testData.user({ email: 'custom@example.com' })
```

## Benefits

1. **Complete Isolation**: Each test suite runs in its own database
2. **No Cleanup Conflicts**: No need to carefully clean up data between tests
3. **Parallel Execution**: Tests can run safely in parallel
4. **Fast Execution**: In-memory database is much faster than persistent storage
5. **Consistent State**: Each test starts with a clean database state

## Running Isolated Tests

```bash
# Run a specific isolated test
npx vitest run tests/int/users-isolated.int.spec.ts

# Run all tests (includes both isolated and non-isolated)
pnpm test
```

## Migration from Existing Tests

To migrate existing tests to the isolated approach:

1. Follow the usage pattern above
2. Replace manual database cleanup with the `createTestEnvironment()` approach
3. Use test data factories for consistent test data creation
4. Remove manual data cleanup logic (it's handled automatically)

## Notes

- The isolated setup requires collections to exist in the test configuration
- Only collections that exist in the main codebase can be tested with this approach
- For testing collections on feature branches, ensure they're included in the test config
- File uploads may require additional configuration for the in-memory environment