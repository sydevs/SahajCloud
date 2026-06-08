---
paths:
  - src/plugins/usage/**/*.ts
  - src/collections/Clients/Clients.ts
---

# API Client Authentication, Rate Limiting, Usage Tracking

REST API authentication for third-party clients lives in the `Clients`
collection plus the consolidated `usagePlugin`. The plugin auto-applies
hooks and registers two scheduled tasks. GraphQL is disabled — all client
access is REST-only.

## Clients collection (`src/collections/Clients/Clients.ts`)

- `useAPIKey: true` — Payload generates an API key per client.
- Managers can regenerate keys and manage settings.
- Virtual `highUsageAlert` field surfaces when daily limits are exceeded.
- `usage` group: `dailyRequests`, `peakDailyRequests`, `lastRequestAt`.
- Custom hook in `src/collections/Clients/hooks/validateClientData.ts`:
  - `validateClientData` — ensures `primaryContact` is in the managers list.

## Usage plugin (`src/plugins/usage/`)

| File             | Purpose                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `usagePlugin.ts` | Plugin orchestration                                                |
| `hooks.ts`       | `usageTrackingHook` (afterRead); `rateLimitHook` (no-op on Railway) |
| `tasks.ts`       | `trackUsageTask`, `resetUsageTask` factories (Postgres atomic ops)  |
| `types.ts`       | Type definitions and constants                                      |

## Authentication flow

1. Client sends `Authorization: clients API-Key <key>` (+ optional `X-User-ID`).
2. Payload authenticates via the encrypted API key.
3. Cloudflare edge (rate limiting rules) checks rate limits (no app-level limiter needed).
4. Access middleware enforces read-only RBAC permissions.
5. `usageTrackingHook` queues a `trackUsageTask` (afterRead).
6. Task increments stats asynchronously via atomic Postgres UPDATE.

## Security

- **Permission-based access** via `accessPlugin` — clients require explicit
  permissions. **No delete access**, ever. Managers and Clients collections
  completely blocked for API clients.
- **Active status** — only active clients authenticate.
- **Encrypted keys** with `PAYLOAD_SECRET`.
- **GraphQL disabled** — REST only.

## Query Parameter Validation

API client read requests must declare their data needs explicitly:

- `select` is required on every read request.
- `populate` is required when effective `depth > 1` (explicit `depth` or the
  server default depth when omitted).

`validateClientQueryParamsHook` in `src/plugins/usage/hooks.ts` enforces this
before rate limiting, so malformed reads do not consume a rate-limit slot.
Managers, admin UI requests, and writes are unaffected.

### Expected REST format (bracket notation)

PayloadCMS REST uses `qs-esm` to parse query strings into **nested objects** —
NOT comma-separated strings. The hook checks `typeof args.select === 'object'`,
so only bracket notation passes. This is the format the official
[PayloadCMS docs](https://payloadcms.com/docs/queries/select) describe.

✅ Correct — bracket notation:

```
GET /api/meditations?select[title]=true&select[slug]=true&depth=2&populate[narrators][name]=true
```

Parses to:

```ts
{
  select: { title: true, slug: true },
  depth: 2,
  populate: { narrators: { name: true } },
}
```

Passes validation.

Nested select example:

```
GET /api/pages/69?select[meta][image]=true&depth=1
```

Nested `select` is valid. When a selected field is a relationship/upload field
such as `meta.image`, Payload may perform internal population reads; the
validator treats those internal reads as part of the already-validated top-level
request.

If the client does not need nested relationship traversal, pass `depth=1` (or
`depth=0` for raw relationship IDs). Omitting `depth` uses Payload's server
default, currently `2`, so `populate` is still required.

❌ Wrong — comma-separated strings (rejected):

```
GET /api/meditations?select=title,slug&populate=narrator.name
```

Parses to:

```ts
{ select: 'title,slug', populate: 'narrator.name' }
```

Fails the `typeof === 'object'` check, returns 400.

### Diagnostic logging

On rejection the hook logs the offending shape at WARN level — type +
top-level keys + a 100-char preview when the value is a string (no full
payload, no secrets). Filter the application logs (`railway logs`) by `clientId` if a client reports
an unexpected 400; the log entry identifies whether the param arrived as a
string, an empty object, or missing entirely.

The full URL → args parse contract is locked in by
`tests/int/client-query-validation.int.spec.ts` (`describe('REST URL format (via qs.parse + sanitize)', ...)`).

### Internal-endpoint bypass

Trusted internal endpoint handlers that forward a client `req` to
`payload.find(...)` or `payload.findByID(...)` should wrap the request via the
`asTrustedReq()` helper exported from `src/plugins/usage/hooks.ts` (which sets the
`req.context.skipClientQueryValidation` flag). These handlers shape their own
response and should not require every endpoint caller to enumerate internal
fields with `select`, while rate limiting and usage tracking still see the
authenticated client.

### Live preview bypass

Admin live preview loads the external We Meditate Web frontend, which fetches
draft content back from this CMS as a client and forwards the
`SAHAJCLOUD_PREVIEW_SECRET` in the `x-sahajcloud-preview-secret` header. A
request carrying the valid secret renders the **whole** document, so requiring
it to enumerate `select`/`populate` is meaningless — and forcing it 400s the
preview. `validateClientQueryParamsHook` skips validation for such requests via
`hasValidPreviewSecret(req)` from `src/lib/utilities/previewSecret.ts` (the same helper
the access layer uses to unlock drafts in `createAccessConfig`). Rate limiting
and usage tracking still apply. Without this, PR #294's gate breaks the
meditations, pages, and wemeditate-web live previews.

## Usage monitoring

- **Async tracking** via Payload job queue (no in-request DB write).
- **Daily limits** — alerts logged when daily count exceeds threshold (>1,000/day).
- **Peak tracking** — `peakDailyRequests` records the historical max.
- **Reset schedule** — `resetUsageTask` runs daily at midnight UTC.
- **Implementation** — atomic Postgres UPDATE via Drizzle pool (single transaction, no race conditions)

## Rate limiting (Cloudflare Edge)

Per-user rate limiting is now handled by **Cloudflare Rate Limiting Rules** at the edge, in front of Railway. This eliminates the need for an app-level rate limiter binding.

### How it works

1. Request arrives at Cloudflare edge (reverse proxy).
2. Cloudflare Rate Limiting Rules evaluate the request.
3. Allow → forwards to Railway, blocked → returns 429.
4. No app-level `rateLimitHook` needed; it's a no-op.

### Limits

| Setting | Value                              |
| ------- | ---------------------------------- |
| Limit   | 500 requests                       |
| Period  | 60 seconds                         |
| Scope   | per `(client, IP)` tuple (at edge) |

### `X-User-ID` header

The header is still present for API semantic clarity but is not rate-limited at the edge. Clients can pass it to identify their end-users in logs.

- Format: `^[a-zA-Z0-9-_]{8,64}$`
- **Privacy**: user ID is visible to the app but not enforced by Cloudflare rules.

```http
GET /api/meditations HTTP/1.1
Authorization: clients API-Key abc123xyz
X-User-ID: user_12345678
```

### Error responses

```json
// 429 — rate limit exceeded (Cloudflare)
{ "errors": [{ "message": "Rate limit exceeded. Maximum 500 requests per minute." }] }
```

### Monitoring

- Cloudflare Analytics: view rate limit hits per rule.
- Sentry: `usageTrackingHook` logs client requests (no rate limiter events).
- Pino: `clientId`, IP, timestamp logged at usage tracking time.

## Testing

- `tests/int/clients.int.spec.ts` — Client CRUD + hooks
- `tests/int/api.int.spec.ts` — usage tracking + reset jobs
- `tests/e2e/clients.e2e.spec.ts` — admin UI flows
- `tests/utils/` — factories for clients and authenticated requests
