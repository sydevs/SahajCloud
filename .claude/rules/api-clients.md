---
paths:
  - src/lib/usage/**/*.ts
  - src/collections/access/Clients.ts
---

# API Client Authentication, Rate Limiting, Usage Tracking

REST API authentication for third-party clients lives in the `Clients`
collection plus the consolidated `usagePlugin`. The plugin auto-applies
hooks and registers two scheduled tasks. GraphQL is disabled — all client
access is REST-only.

## Clients collection (`src/collections/access/Clients.ts`)

- `useAPIKey: true` — Payload generates an API key per client.
- Managers can regenerate keys and manage settings.
- Virtual `highUsageAlert` field surfaces when daily limits are exceeded.
- `usage` group: `dailyRequests`, `peakDailyRequests`, `lastRequestAt`.
- Custom hook in `src/hooks/clientHooks.ts`:
  - `validateClientData` — ensures `primaryContact` is in the managers list.

## Usage plugin (`src/lib/usage/`)

| File | Purpose |
|---|---|
| `usagePlugin.ts` | Plugin orchestration |
| `hooks.ts` | `rateLimitHook` (beforeOperation), `usageTrackingHook` (afterRead) |
| `tasks.ts` | `trackUsageTask`, `resetUsageTask` factories |
| `types.ts` | Type definitions and constants |
| `wrangler.toml` | Cloudflare Rate Limiting Binding configuration |

## Authentication flow

1. Client sends `Authorization: clients API-Key <key>` (+ optional `X-User-ID`).
2. Payload authenticates via the encrypted API key.
3. `rateLimitHook` checks rate limits (production only).
4. Access middleware enforces read-only RBAC permissions.
5. `usageTrackingHook` queues a `trackUsageTask` (afterRead).
6. Task increments stats asynchronously.

## Security

- **Permission-based access** via `accessPlugin` — clients require explicit
  permissions. **No delete access**, ever. Managers and Clients collections
  completely blocked for API clients.
- **Active status** — only active clients authenticate.
- **Encrypted keys** with `PAYLOAD_SECRET`.
- **GraphQL disabled** — REST only.

## Usage monitoring

- **Async tracking** via job queue (no in-request DB write).
- **Daily limits** — alerts logged when daily count exceeds threshold (>1,000/day).
- **Peak tracking** — `peakDailyRequests` records the historical max.
- **Reset schedule** — `resetUsageTask` runs daily at midnight UTC.

## Rate limiting (Cloudflare Workers Rate Limiting Binding)

Per-user rate limiting prevents one abusive end-user from exhausting
quota for everyone sharing a client's API key.

### How it works

1. Request arrives with API key (+ optional `X-User-ID`).
2. `rateLimitHook` extracts `clientId`, IP, `userId`.
3. Composite key: `user:{clientId}:{ip}:{userId}`.
4. Cloudflare Rate Limiter checks; allow → 200, exceeded → 429.

### Limits

| Setting | Value |
|---|---|
| Limit | 500 requests |
| Period | 60 seconds |
| Scope | per `(client, IP, user-id)` triple |

### `X-User-ID` header

Optional, for per-end-user isolation:

- Format: `^[a-zA-Z0-9-_]{8,64}$`
- Without the header: rate-limit falls back to IP-only.
- **Privacy**: user ID is **never** included in error responses.

```http
GET /api/meditations HTTP/1.1
Authorization: clients API-Key abc123xyz
X-User-ID: user_12345678
```

### Error responses

```json
// 400 — invalid X-User-ID
{ "errors": [{ "message": "Invalid X-User-ID format. Must be 8-64 alphanumeric characters, dashes, or underscores." }] }

// 429 — rate limit exceeded
{ "errors": [{ "message": "Rate limit exceeded. Maximum 500 requests per minute." }] }
```

### Excluded from rate limiting

- Admin/manager routes (Managers collection).
- Development environment (rate limiting disabled).
- Non-client requests (only API clients are tracked).
- Consumer collections — Client collection is excluded from tracking hooks.

### Monitoring

- Sentry: warning-level events when limits are hit.
- Pino: `clientId`, IP, timestamp logged.
- **Fail-open**: rate-limiter errors allow the request through (better to
  allow than incorrectly block).

## Testing

- `tests/int/clients.int.spec.ts` — Client CRUD + hooks
- `tests/int/api.int.spec.ts` — usage tracking + reset jobs
- `tests/e2e/clients.e2e.spec.ts` — admin UI flows
- `tests/utils/` — factories for clients and authenticated requests
