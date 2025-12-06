# Client API Authentication Architecture

The system implements secure REST API authentication for third-party clients with comprehensive usage tracking and access control.

## Key Components

### Clients Collection (`src/collections/Clients.ts`)

Manages API clients with authentication keys:
- `useAPIKey: true` enables API key generation for each client
- Managers can regenerate keys and manage client settings
- Virtual `highUsageAlert` field indicates when daily limits are exceeded

### Usage Tracking (`src/lib/apiUsageTracking.ts`)

Simplified request monitoring:
- In-memory counter with batch database updates every 10 requests
- Automatic daily counter reset at midnight UTC
- High usage alerts via Sentry when exceeding 1,000 requests/day

### Client Hooks (`src/hooks/clientHooks.ts`)

Collection-level tracking:
- `createAPITrackingHook()`: Applied to all collections for usage monitoring
- Validates client data and manages relationships

## API Authentication Flow

1. Client sends request with header: `Authorization: clients API-Key <key>`
2. Payload authenticates using the encrypted API key
3. Access control middleware enforces read-only permissions
4. Usage tracking records the request in memory
5. Batch updates persist usage stats to database

## Security Features

- **Permission-Based Access**: API clients require explicit collection/locale permissions (Read or Manage levels)
- **No Delete Access**: API clients never get delete access, even with Manage permissions
- **Collection Restrictions**: Managers and Clients collections completely blocked for API clients
- **Active Status**: Only active clients can authenticate
- **Encrypted Keys**: API keys encrypted with PAYLOAD_SECRET
- **GraphQL Disabled**: All API access through REST endpoints only

## Usage Monitoring

- **Real-time Tracking**: Request counts updated in memory
- **Efficient Storage**: Batch updates reduce database load
- **Daily Limits**: Automatic alerts for high usage (>1,000 requests/day)
- **Sentry Integration**: High usage events logged with client details

## Testing

- **Integration Tests** (`tests/int/clients.int.spec.ts`): Client CRUD operations
- **API Auth Tests** (`tests/int/api-auth.int.spec.ts`): Authentication flow
- **E2E Tests** (`tests/e2e/clients.e2e.spec.ts`): Admin UI functionality
- **Test Helpers**: Factory functions for creating test clients and requests
