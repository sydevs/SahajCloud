# Client API Authentication Architecture

The system implements secure REST API authentication for third-party clients with comprehensive usage tracking and access control.

## Key Components

### Clients Collection (`src/collections/access/Clients.ts`)

Manages API clients with authentication keys:
- `useAPIKey: true` enables API key generation for each client
- Managers can regenerate keys and manage client settings
- Virtual `highUsageAlert` field indicates when daily limits are exceeded
- `usage` field group contains: `dailyRequests`, `peakDailyRequests`, `lastRequestAt`

### Usage Plugin (`src/lib/usage/`)

Consolidated rate limiting and usage tracking via auto-applied hooks:
- `rateLimitHook` - beforeOperation hook for per-user rate limiting
- `usageTrackingHook` - afterRead hook queues tracking job
- `trackUsageTask` - task that increments dailyRequests, triggers high usage alerts
- `resetUsageTask` - scheduled task that resets counters at midnight UTC

### Client Hooks (`src/hooks/clientHooks.ts`)

Client-specific validation:
- `validateClientData` - Ensures primaryContact is in managers list

## API Authentication Flow

1. Client sends request with header: `Authorization: clients API-Key <key>`
2. Payload authenticates using the encrypted API key
3. `beforeOperation` hook checks rate limits (production only)
4. Access control middleware enforces read-only permissions
5. `afterRead` hook queues usage tracking job
6. Job handler increments usage stats asynchronously

## Security Features

- **Permission-Based Access**: API clients require explicit collection/locale permissions (Read or Manage levels)
- **No Delete Access**: API clients never get delete access, even with Manage permissions
- **Collection Restrictions**: Managers and Clients collections completely blocked for API clients
- **Active Status**: Only active clients can authenticate
- **Encrypted Keys**: API keys encrypted with PAYLOAD_SECRET
- **GraphQL Disabled**: All API access through REST endpoints only

## Query Parameter Requirements

All API client read requests must declare their data needs explicitly. This prevents clients from pulling entire documents or auto-populating every relationship at high `depth`.

| Rule | HTTP Status |
|------|-------------|
| `select` is required on every read request | 400 if missing |
| `populate` is required when `depth > 1` | 400 if missing |

The enforcement hook is `validateClientQueryParamsHook` in [src/lib/usage/hooks.ts](../../src/lib/usage/hooks.ts). It runs on `beforeOperation` before rate limiting, so a malformed request does not consume a rate-limit slot. Managers, admin UI requests, and write operations (POST/PATCH/DELETE) are unaffected.

### Examples

Valid:
```bash
GET /api/meditations?select=title,duration
GET /api/meditations?select=title,narrator&depth=1
GET /api/meditations?select=title,narrator&depth=2&populate=narrator.name
```

Invalid (400):
```bash
GET /api/meditations                              # missing select
GET /api/meditations?select=title&depth=2         # depth>1 without populate
```

See [PayloadCMS select docs](https://payloadcms.com/docs/queries/select) and [depth docs](https://payloadcms.com/docs/queries/depth) for valid query shapes.

## Usage Monitoring

- **Async Tracking**: Request counts updated via job queue for performance
- **Daily Limits**: Automatic alerts for high usage (>1,000 requests/day)
- **Peak Tracking**: `peakDailyRequests` tracks highest daily usage
- **Reset Schedule**: Daily counters reset at midnight UTC via scheduled job

## Rate Limiting Architecture

Per-user API rate limiting using Cloudflare Workers Rate Limiting Binding prevents "noisy neighbor" issues where one abusive user can exhaust rate limits for all users sharing the same API key.

### How It Works

1. Client sends request with API key and optional `X-User-ID` header
2. `beforeOperation` hook extracts client ID, IP address, and user ID
3. Composite rate limit key is built: `user:{clientId}:{ip}:{userId}`
4. Cloudflare Rate Limiter checks if limit is exceeded
5. Request is allowed (200) or rejected (429 Too Many Requests)

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
    "message": "Rate limit exceeded. Maximum 500 requests per minute."
  }]
}
```

### Excluded from Rate Limiting

- **Admin routes**: Managers collection (admin users)
- **Development environment**: Rate limiting disabled in development
- **Non-client requests**: Only API client requests are rate limited
- **Consumer collections**: Client collection excluded from tracking hooks

### Monitoring

- **Sentry Events**: Warning-level events captured when rate limits are hit
- **Pino Logging**: Rate limit events logged with client ID, IP, and timestamp
- **Fail-Open**: On rate limiter errors, requests are allowed (better to allow than incorrectly block)

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/usage/usagePlugin.ts` | Main plugin orchestration |
| `src/lib/usage/hooks.ts` | Rate limiting and tracking hooks |
| `src/lib/usage/tasks.ts` | trackUsage and resetUsage task factories |
| `src/lib/usage/types.ts` | Type definitions and constants |
| `wrangler.toml` | Cloudflare Rate Limiting Binding configuration |

## Testing

- **Integration Tests** (`tests/int/clients.int.spec.ts`): Client CRUD operations
- **API Tests** (`tests/int/api.int.spec.ts`): Usage tracking and reset jobs
- **E2E Tests** (`tests/e2e/clients.e2e.spec.ts`): Admin UI functionality
- **Test Helpers**: Factory functions for creating test clients and requests
