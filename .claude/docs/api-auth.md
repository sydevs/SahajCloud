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

## Rate Limiting Architecture

Per-user API rate limiting using Cloudflare Workers Rate Limiting Binding prevents "noisy neighbor" issues where one abusive user can exhaust rate limits for all users sharing the same API key.

### How It Works

1. Client sends request with API key and optional `X-User-ID` header
2. `beforeOperation` hook extracts client ID, IP address, and user ID
3. Composite rate limit key is built: `user:{clientId}:{ip}:{userId}`
4. Cloudflare Rate Limiter checks if limit is exceeded
5. Request is allowed (200) or rejected (429 with Retry-After header)

### Rate Limit Details

| Setting | Value |
|---------|-------|
| Limit | 500 requests |
| Period | 60 seconds |
| Scope | Per unique (Client + IP + User ID) combination |

### X-User-ID Header

Optional header for per-user rate limiting isolation:

- **Format**: 8-64 alphanumeric characters, dashes, and underscores
- **Pattern**: `^[a-zA-Z0-9-_]{8,64}$`
- **Purpose**: Provides separate rate limit quota per end-user
- **Without Header**: Falls back to IP-based rate limiting only
- **Privacy**: User ID is NOT included in error responses

**Example**:
```
GET /api/meditations HTTP/1.1
Authorization: clients API-Key abc123xyz
X-User-ID: user_12345678
```

### Error Responses

**400 Bad Request** - Invalid X-User-ID format:
```json
{
  "errors": [{
    "message": "Invalid X-User-ID format. Must be 8-64 alphanumeric characters, dashes, or underscores."
  }]
}
```

**429 Too Many Requests** - Rate limit exceeded:
```json
{
  "errors": [{
    "message": "Rate limit exceeded. Please wait before making more requests."
  }]
}
```
Includes `Retry-After` header with seconds until limit resets.

### Excluded from Rate Limiting

- **Admin routes**: Managers collection (admin users)
- **Development environment**: Rate limiting disabled in development
- **Non-client requests**: Only API client requests are rate limited

### Monitoring

- **Sentry Events**: Warning-level events captured when rate limits are hit
- **Pino Logging**: Rate limit events logged with client ID, IP, and timestamp
- **Fail-Open**: On rate limiter errors, requests are allowed (better to allow than incorrectly block)

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/rateLimiting.ts` | Core rate limiting logic and hook factory |
| `wrangler.toml` | Cloudflare Rate Limiting Binding configuration |
| `src/lib/openapi/rateLimitingDocs.ts` | X-User-ID parameter OpenAPI documentation |

## Testing

- **Integration Tests** (`tests/int/clients.int.spec.ts`): Client CRUD operations
- **API Auth Tests** (`tests/int/api-auth.int.spec.ts`): Authentication flow
- **E2E Tests** (`tests/e2e/clients.e2e.spec.ts`): Admin UI functionality
- **Test Helpers**: Factory functions for creating test clients and requests
