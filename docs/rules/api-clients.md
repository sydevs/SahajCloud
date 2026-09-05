---
paths:
  - src/plugins/usage/**/*.ts
  - src/collections/Clients/Clients.ts
---

# API Client Authentication, Rate Limiting, Usage Tracking

REST authentication for third-party clients lives in the `Clients` collection plus the `usagePlugin`, which auto-applies hooks and registers two scheduled tasks. GraphQL is disabled — all client access is REST-only.

## Clients collection (`src/collections/Clients/Clients.ts`)

- `useAPIKey: true` — Payload generates an API key per client. Managers can regenerate keys and manage settings.
- A virtual `highUsageAlert` field surfaces when daily limits are exceeded. The `usage` group holds `dailyRequests`, `peakDailyRequests`, `lastRequestAt`.
- Custom hooks (`src/collections/Clients/hooks/`): `validateClientData` (`primaryContact` must be in the managers list) and `validateCanonicalOwnership` (below).

## Canonical ownership + observed embeds (#633)

Two Atlas white-label fields, split across the **Config** and **SEO** tabs. `canonical.enabled` defaults false, so a client owns nothing until opted in — but once opted in **and verified**, these fields build `webUrl` for the client's region (#634, below).

### `canonical` — who owns a region's canonical URLs

`client.region` alone can't identify an owner — several published clients can map to one country. Ownership is an explicit opt-in with a uniqueness rule:

| Field | Notes |
| --- | --- |
| `canonical.enabled` | checkbox, default false — every other field is `admin.condition`-gated on it |
| `canonical.embed` | required when enabled. Which reported mount owns the URLs, chosen from a picker, never typed |
| `canonical.verification` | json, admin-readonly — written only by the CMS: the verified snapshot, a consecutive-failure count, a bounded attempt log |
| `canonical.nextVerifyAt` | date, indexed, hidden — the verification job's watermark, a real column so it stays a cheap predicate |

`validateCanonicalOwnership` (beforeChange) enforces this: enabling requires `region` and `canonical.embed`, and a second enabled client on a region is rejected, naming the incumbent. It watches `region` too, so moving an enabled client onto an owned region can't dodge the check, and skips when nothing the rule reads has moved. Uniqueness checks against **committed** state, so a conflicting draft is caught only on publish.

`required` plus an `admin.condition` is the mechanism, not a hazard — Payload skips both `required` and a custom `validate` while the condition is false, so `required` on `embed` reads as "required when ownership is on." An integration test saves a canonical-disabled service with no embed through a plain API write, proving this holds for non-admin writes too. The whole gating design rests on it.

### Verification — how a nomination becomes a canonical URL

`canonical.embed` is only a nomination. A canonical URL is built from `canonical.verification.verified`, written **solely** by the CMS after it loads the page itself — a real browser is required, since the widget is JavaScript and fetching HTML would only prove a `<script>` tag exists.

- **`src/lib/embedVerification/`** — a Cloudflare Browser Rendering client, the readiness-marker parser, and the render-to-result routine.
- **The marker** is `data-sahaj-atlas-ready` on `<html>`, carrying `{ v, routing, topLevel, urlWritable }` (the cross-repo contract from sydevs/SahajAtlasWeb#153, #159). Reading `routing` off the rendered page makes verification server-attested, not self-reported.
- **`src/jobs/VerifyEmbeds`** runs nightly, watermarked on `nextVerifyAt`, bounded to enabled services. Three consecutive failures turn ownership off and notify `primaryContact`, via the atomic-SQL seam, not `payload.update`.
- **`POST /api/clients/:id/verify-embed`** — manager-authenticated, the same routine on demand. It never disables.

**`failed` vs `inconclusive` is load-bearing.** `failed` counts toward the three-strike budget. `inconclusive` (a provider error, exhausted quota, a bot challenge, missing credentials) means we couldn't look, and changes nothing. `classifyRenderError` biases an unrecognized message to inconclusive, and checks quota before timeout, so an exhausted allowance of our own is never misread as the embed timing out.

**Exercised for real** by `pnpm tsx scripts/verify-embed-live.ts --self-test`, which drives all four outcomes against the live API — every unit test stubs the render. Its error codes (`6002` selector timeout, `5006` network/DNS, `10000` auth) are pinned in `tests/unit/embed-verification.spec.ts`. Prose matching is a fallback only, since the messages are generic enough to be misleading.

**What the marker proves, precisely.** It detects an embed that is installed and *not working* — the one thing a client-sent report can never reveal. It does **not** prove the page is honest: the attribute carries no nonce, so any host running our script can hand-write it. The trust boundary stays `allowedDomains`. What the marker buys is that a stolen key can claim a mount on the client's domain, but can't make that domain serve a marker it doesn't control.

Vocabulary lives in `src/lib/clients/canonical.ts`, the verification contract in `src/lib/clients/verification.ts` — not the collection folder, since the job and the verifier both need it (`src/AGENTS.md` rule 4). `legacyConfig` was removed, not promoted: nothing backfills from it, since ownership now requires a verified reported embed.

### `embedMetadata` — what the widget observed

Admin-readonly JSON, keyed by **origin + pathname**, one record per mount (`mode`, `topLevel`, `urlWritable`, `paramPersisted`, `routing`, `lastSeen`). It stays a JSON column because nothing queries it — the ownership resolver loads every client (`pagination: false`, ~31 rows) and filters in memory. ⚠ Revisit if the client count grows an order of magnitude. A `jsonSchema` lets Payload generate the type and reject a malformed write.

**Canonical viability is automatic. Canonical *identity* is not.** A human designates which discovered mount is canonical. The metadata only decides whether that mount still qualifies. This bounds tampering: a forged report can assert viability only for a mount someone already chose, never invent one the verifier hasn't seen.

**The body is `origin` + `pathname`, two fields.** A query string or fragment is refused, since the endpoint can only enforce "path alone" that way — except a WordPress permalink (`?p=<digits>`), where discarding it would collapse the whole site onto one mount with no way to name the operator's intended page.

**The write is raw SQL, and has to be.** `payload.update` deadlocks here: the usage plugin increments `usage_daily_requests` on the caller's own row on its own connection, for the very request being served, while `payload.update` holds that row inside the request transaction — both then wait on `Lock: transactionid` forever. An autocommit `jsonb ||` merge has no transaction to overlap with.

### `POST /api/clients/report`

The write path (`Clients/endpoints/report.ts`). Merges into the keyed object. It never replaces it. Since `clients` is excluded from the usage plugin, no `beforeOperation` hook fires here — the handler calls `assertClientOriginAllowed(req)` itself, right after `requireActiveClient`, and usage tracking likewise does not apply.

Two origin checks apply: the request's `Origin`/`Referer` must be in `allowedDomains`, and so must the reported `url`'s host — a client can only describe pages on domains it owns. `url` is origin plus pathname only. A query string or fragment is rejected (`400`, `query_or_fragment`), not stripped, since the widget already strips them and a payload carrying either means the widget is misbehaving.

Rate limiting is Cloudflare's, at the edge, as for every client route. On top of that, a repeat of a recent identical observation gets `updated: false` with **no read and no write** — the widget reports on every page load, so this path carries most of the traffic.
- **The cap bounds storage, never which mounts are knowable** (#639). `MAX_EMBED_MOUNTS` (50) caps what a forger can accumulate. A client at the cap still reports a new mount, evicting the least-recently-seen entry, so the held 50 reflect what is currently live. There is no 429 — refusing growth was tried first, and once ordinary traffic filled the budget an operator's intended page could never get reported. Two exceptions to eviction: the designated `canonical.embed` is never evicted, and the mount just reported can't be evicted by the write that reports it.

  `mergeEmbedReport` (`embedMetadata.ts`) computes the decision. The endpoint applies it in one statement — `|| $1::jsonb` merges, `- $2::text[]` deletes evicted keys. Both halves matter: `||` alone can't delete, so the column would grow unbounded while the cap stayed inert.
- Registered in the OpenAPI shim but stays `x-internal` (`docs/rules/openapi.md`).

Tests: `tests/unit/client-embed-metadata.spec.ts` (mount keys incl. `?p=`, the merge), `tests/unit/embed-verification.spec.ts` (marker parsing, error classification, failed/inconclusive), `tests/unit/canonical-embed-picker.spec.ts` (URL building, the three-strike ladder, picker options), `tests/int/client-canonical.int.spec.ts` (the hook, the endpoint, the job ladder, the cap, and that enabling ownership re-roots `webUrl` while `webPath` stays byte-identical).

## Per-region canonical `webUrl` (#634)

`webUrl` is not one global base. It resolves to the client owning the document's region, or the nearest owning ancestor, and falls back to the We Meditate surface when nothing in the ancestry is owned. `SAHAJATLAS_URL` is no longer a canonical base anywhere — it survives only in the two live-preview URLs.

| Piece | Where |
| --- | --- |
| The two URL shapes (`path` / `query`), and the cross-repo fixture | `src/lib/atlas/canonicalUrl.ts`, `atlas-url-contract.json` |
| Region tree + ancestor chains, one query per request | `src/lib/atlas/regionTree.ts` |
| Ownership: the `clients` read + nearest-ancestor walk | `src/lib/atlas/regionOwners.ts` |

```
path :  https://{domain}{mount}{webPath}   → https://wemeditate.com/map/nl/amsterdam/1204
query:  https://{domain}{mount}{?|&}atlas={webPath}
                                           → https://sahajayoga.nl/locatelessons/?atlas=/nl/amsterdam/1204
```

- **`webPath` never changes** — the bare ancestor slug chain. Ownership only decides what it's joined to.
- **Two extra queries per request, total** (one `regions`, one `clients`), memoized on the `PayloadRequest`, loaded lazily — a `webPath`-only read never touches ownership.
- **Never a fragment.** Hash routing is gone from the widget with no back-compat.
- **The verified host is re-checked at read time, not trusted** — `VerifyEmbeds` writes via raw SQL, bypassing the JSON schema's domain pattern. `loadDirectOwners` re-validates before the ancestor walk, so an unusable client is skipped rather than collapsing its whole subtree to the fallback.
- **The path is emitted raw**, not percent-encoded — safe only because region slugs are `[a-z0-9-]` and event ids are numeric (`tests/unit/atlas-canonical-url.spec.ts` pins this).
- **Region paths are queryable** via `where[breadcrumbs.url][equals]='/nl/amsterdam'`, but this matches descendants too — add `slug` to resolve exactly one. Existing rows need `pnpm tsx scripts/backfill-region-breadcrumb-urls.ts` once.

## Usage plugin (`src/plugins/usage/`)

| File | Purpose |
| --- | --- |
| `usagePlugin.ts` | Plugin orchestration |
| `hooks.ts` | `usageTrackingBeforeOperationHook`, `rateLimitHook` (no-op on Railway) |
| `tasks.ts` | `trackUsageTask`, `resetUsageTask` (atomic Postgres ops) |
| `types.ts` | Type definitions and constants |

## Authentication flow

1. The client sends `Authorization: clients API-Key <key>` (plus optional `X-User-ID`).
2. Payload authenticates via the encrypted API key.
3. Cloudflare's edge rate-limiting rules check the request — no app-level limiter is needed.
4. Access middleware enforces read-only RBAC.
5. `usageTrackingBeforeOperationHook` counts one use per top-level client read, skipping internal relationship-population sub-reads (`depth >= 1`) so those don't over-count (#559).
6. The increment is a single atomic Postgres UPDATE.

## Security

Access is permission-based via `accessPlugin` — a client needs an explicit permission for everything, gets **no delete access, ever**, and cannot reach `Managers` or `Clients` at all. Only an active client can authenticate. Keys are encrypted with `PAYLOAD_SECRET`. GraphQL is disabled.

### Every public write path requires Turnstile

`writeGuardPlugin` runs anti-spam checks on **client-originated** writes. `turnstile: true` in `DEFAULT_WRITE_GUARD_POLICIES` requires a solved token in the **`x-turnstile-token`** header, kept out of the document shape. Registrations were the last public write without it (#629) — the gate could only turn on once the Atlas widget sent the header (sydevs/SahajAtlasWeb#182), so the two shipped in that order.

| Outcome | Status | `errors[0].code` | Client action |
| --- | --- | --- | --- |
| Missing, forged, expired, or **replayed** token | 403 | `captcha_failed` | Reset the challenge, retry with a fresh token |
| Our secret unset, or Cloudflare unreachable | 500 | `captcha_unavailable` | Retry later — never a pass |

⚠ **Tokens are single-use** — a replay is refused exactly like a forgery, so retrying with the *same* token after any error gets a second 403.

⚠ **The gate fails closed on our own misconfiguration, on purpose.** A captcha that silently disables itself on a missing secret is worse than none, since nothing would surface the misconfiguration. There is no dev/test bypass — point `TURNSTILE_SECRET_KEY` at Cloudflare's always-passes test key locally.

## Query parameter validation

An API client read must declare its data needs: `select` is required on every read, and `populate` is required whenever effective `depth > 1` (explicit or the server default). `validateClientQueryParamsHook` enforces this before rate limiting, so a malformed read costs no rate-limit slot. Managers, admin UI requests, and writes are unaffected.

### Expected REST format (bracket notation)

Payload's REST layer parses query strings into **nested objects** via `qs-esm`, not comma-separated strings. The hook checks `typeof args.select === 'object'`, so only bracket notation passes — the format the [official docs](https://payloadcms.com/docs/queries/select) describe.

```
✅ GET /api/meditations?select[title]=true&select[slug]=true&depth=2&populate[narrators][name]=true
   → { select: { title: true, slug: true }, depth: 2, populate: { narrators: { name: true } } }

❌ GET /api/meditations?select=title,slug&populate=narrator.name
   → { select: 'title,slug', populate: 'narrator.name' }  — fails typeof === 'object', returns 400
```

Nested `select` is valid (`select[meta][image]=true`). When a selected field is itself a relationship, Payload's internal population reads count as part of the already-validated request. With no relationship traversal needed, pass `depth=1` (or `0` for raw IDs) — omitting `depth` uses the server default (currently `2`), so `populate` is still required.

On rejection the hook logs the offending shape at WARN (type, top-level keys, a 100-char preview for a string value — never the full payload or a secret). Filter `railway logs` by `clientId` to see whether a param arrived as a string, an empty object, or was missing. The full contract is pinned in `tests/int/client-query-validation.int.spec.ts`.

### Internal-endpoint bypass

A trusted internal handler forwarding a client `req` to `payload.find`/`findByID` should wrap it via `asTrustedReq()` (sets `req.context.skipClientQueryValidation`), so it need not enumerate `select` while rate limiting and usage tracking still see the authenticated client. The companion `isTrustedReq(req)` reads that flag back. Honour it in a hook shaping the **client-facing result** (`excludeFinishedEvents` exempts a trusted req so registration can answer 409 instead of 404), but never in a security gate — `validateClientOriginHook` does not honour it.

### System writes: `asSystemReq`, and why `overrideAccess` isn't enough

`asSystemReq(req)` returns the same request with **no user** — reach for it when a client-triggered write isn't on the caller's own authority (the registration vote-sync hook updating the *event*). `overrideAccess: true` alone is not enough: it skips collection access but **not** `filterOptions`, which Payload validates against `req.user` — a write touching an owner-scoped picker would 400 for a caller entitled to trigger the operation but not to perform it directly. `context`, `transactionID`, and `payload` still travel by reference. Only the authority changes. `asTrustedReq` keeps the user and relaxes the query-shape gate instead — the two compose.

### Live preview bypass

Admin live preview loads the external We Meditate Web frontend, which fetches draft content back as a client, forwarding `SAHAJCLOUD_PREVIEW_SECRET` in `x-sahajcloud-preview-secret`. Since that request renders the whole document, `validateClientQueryParamsHook` skips it via `hasValidPreviewSecret(req)` — the same helper the access layer uses to unlock drafts. Rate limiting and usage tracking still apply.

## Client read contract: finished events (#603)

A **finished** event (its schedule fully run out) stays `published`, since its Atlas page must keep resolving for an old link — but it drops out of public *feeds*:

| Read | Finished events |
| --- | --- |
| `GET /api/events` | Excluded by default. An explicit `where` on `schedule.lastDate` opts out |
| `GET /api/events/geojson` | Always excluded, no opt-out |
| `GET /api/events/{id}` | Returned normally |
| `GET /api/atlas/seo` | A region listing excludes them. A single-event read returns it |
| `GET /api/atlas/sitemap` | Excluded — the page still resolves, but a sitemap shouldn't ask a crawler to index it |
| Admin / manager / job reads | Unaffected |

"Finished" means `schedule.lastDate` (the final occurrence's local end-of-day) is in the past — an event running today stays listed until midnight in its own timezone. A NULL `lastDate` (open-ended recurrence) and an `inactive` event are never finished. One definition, two expressions: `shouldFinish` in memory, `notFinishedWhere` as SQL, pinned to agree by `tests/unit/schedule-status.spec.ts`.

The default is applied by the `excludeFinishedEvents` beforeOperation hook on Events. The opt-out is a `where` naming `schedule.lastDate` by **dotted path only** (Payload rejects the nested-group form). `POST /api/events/{id}/register` refuses a finished event with **409** ("This event has ended"), since the published-only access filter no longer catches it.

> Existing clients see fewer docs from `GET /api/events`. This is deliberate, and published on the geojson operation's OpenAPI `description` (the generated `/api/events` path has no description seam to annotate).

## Origin / Referer enforcement

`validateClientOriginHook` is the usage plugin's second beforeOperation gate, run **first** on every non-excluded collection, ahead of the query-param gate and rate accounting. It covers standard client reads and the custom Atlas endpoints, whose internal `payload.find`/`create` calls forward the client `req`.

The rule itself lives in `assertClientOriginAllowed(req)`. The hook is a thin wrapper adding the `currentDepth` exemption. An endpoint whose handler touches no collection runs no beforeOperation hook, so it must call the assertion itself — both `GET /api/atlas/seo` and `GET /api/atlas/sitemap` do, right after `requireActiveClient`. Don't lean on an incidental collection read to trigger it instead — `clients` is excluded from the plugin, so reading the caller's own record wouldn't fire it either.

**Rule**: runs only when `req.user?.collection === 'clients'`. An empty/unset `allowedDomains` allows any origin (the default). A non-empty list requires the request `Origin` (or `Referer` as fallback) to match an entry, else **403**. No `Origin`/`Referer` at all (server-to-server, cron) is allowed — the API key is the gate there.

**Matching** (`originEnforcement.ts`): both sides normalize to a bare host (scheme, userinfo, port, path, trailing dot stripped, lowercased). An exact host matches only itself. A `*.` wildcard matches any subdomain but not the apex, and blocks the injection `evil-example.org` against `*.example.org`.

**Bypasses**: a valid live-preview secret, or an internal relationship-population read (reusing the top-level origin already validated). `asTrustedReq()` does **not** bypass this — its flag is a query-shape opt-out, not a security one.

**CORS**: `cors: { origins: '*', headers: ['x-sahajcloud-preview-secret'] }`. Per-client CORS is impossible, since a preflight is anonymous — the browser omits `Authorization`, so the server can't return a per-client allowlist at that point. The wildcard lets an embedded widget's preflight succeed on any host page. The real per-domain gate is this hook plus the API key. Payload omits `Access-Control-Allow-Credentials` for wildcard origins, so cookie-based admin sessions stay protected. The `headers` list **appends** to Payload's defaults (#575), so the live-preview widget's `x-sahajcloud-preview-secret` still clears preflight. Guarded by `tests/int/cors-config.int.spec.ts` and `tests/e2e/cors-preflight.e2e.spec.ts`.

Tests: `tests/unit/origin-enforcement.spec.ts` (normalization and matching), `tests/int/client-origin-enforcement.int.spec.ts` (wiring through `payload.find` and the geojson/register endpoints).

## Usage monitoring

Tracking is async, via the Payload job queue (no in-request DB write). An alert logs when the daily count passes 1,000 requests. `peakDailyRequests` records the historical max. `resetUsageTask` runs daily at midnight UTC. The increment is one atomic Postgres UPDATE via the Drizzle pool — a single transaction, no race.

## Rate limiting (Cloudflare edge)

Per-user rate limiting runs at the Cloudflare edge, in front of Railway, so no app-level limiter binding is needed. A request that fails the edge's rate-limiting rules gets a 429 before it ever reaches Railway, and `rateLimitHook` is a no-op.

| Setting | Value |
| --- | --- |
| Limit | 500 requests |
| Period | 60 seconds |
| Scope | per `(client, IP)` tuple, at the edge |

`X-User-ID` (`^[a-zA-Z0-9-_]{8,64}$`) still travels for semantic clarity and log identification, but the edge does not rate-limit on it, and it is visible to the app but not privacy-enforced.

```http
GET /api/meditations HTTP/1.1
Authorization: clients API-Key abc123xyz
X-User-ID: user_12345678
```

A 429 returns `{ "errors": [{ "message": "Rate limit exceeded. Maximum 500 requests per minute." }] }`. Monitor via Cloudflare Analytics (rate-limit hits per rule), Sentry (`usageTrackingBeforeOperationHook` logs client requests), and Pino (`clientId`, IP, timestamp).

## Testing

- `tests/int/clients.int.spec.ts` — Client CRUD and hooks.
- `tests/int/api.int.spec.ts` — usage tracking and reset jobs.
- `tests/e2e/clients.e2e.spec.ts` — admin UI flows.
- `tests/utils/` — factories for clients and authenticated requests.
