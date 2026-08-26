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
- Custom hooks in `src/collections/Clients/hooks/`:
  - `validateClientData` — ensures `primaryContact` is in the managers list.
  - `validateCanonicalOwnership` — the canonical-ownership rule, below.

## Canonical ownership + observed embeds (#633)

Two Atlas white-label fields, split across the **Config** and **SEO** tabs.
`canonical.enabled` defaults false, so a client owns nothing until someone opts
it in — but once opted in **and verified**, these fields do resolve: they are
what `webUrl` is built from, per region (#634, below).

### `canonical` — who owns a region's canonical URLs

`client.region` alone cannot identify an owner: three published clients map to
Czechia, two to Finland, two to Australia. So ownership is an explicit opt-in
with a uniqueness rule.

| Field | Notes |
| --- | --- |
| `canonical.enabled` | checkbox, **default false**. The master switch — every other canonical field is `admin.condition`-gated on it |
| `canonical.embed` | **required when enabled.** Which reported mount owns the canonical URLs, chosen from a picker, never typed. Host, mount and routing all follow from it |
| `canonical.verification` | json, admin-readonly. **Written only by the CMS**, from what it observed loading the page: the verified snapshot, a consecutive-failure count, and a bounded attempt log |
| `canonical.nextVerifyAt` | date, indexed, hidden. The verification job's watermark — a real column so it stays a cheap predicate |

`validateCanonicalOwnership` (beforeChange) enforces the rule: enabling requires
`region` **and** `canonical.embed`, and a second enabled client on a region is
rejected with the incumbent named. It watches `region` as well as `canonical`,
so moving an already-enabled client onto an owned region can't walk around it,
and it skips when nothing the rules read has actually moved — which also stops
an unrelated edit being *refused* because two services were left enabled on one
region. Uniqueness is checked against **committed** state, so a conflicting
draft is caught on publish.

**`required` + a condition is the mechanism, not a hazard.** Payload skips both
`required` and any custom `validate` while `admin.condition` is false and runs
them normally when it is true, so `required` on `embed` reads as exactly
"required when canonical ownership is on" — the same shape as `primaryContact`.
Verified for **non-admin writes** too by an integration test that saves a
canonical-disabled service with no embed through a plain API write; the whole
gating design rests on it, so that test is load-bearing.

### Verification — how a nomination becomes a canonical URL

`canonical.embed` is only a nomination. What a canonical URL is built from is
`canonical.verification.verified`, written **solely** by the CMS after it loads
the page itself.

- **`src/lib/embedVerification/`** — a Cloudflare Browser Rendering client, the
  readiness-marker parser, and the routine that turns a render into a result. A
  real browser is required: the widget is JavaScript, so fetching HTML would only
  prove a `<script>` tag exists and would false-FAIL every client-rendered site.
- **The marker** is `data-sahaj-atlas-ready` on `<html>`, carrying
  `{ v, routing, topLevel, urlWritable }` — the cross-repo contract from
  sydevs/SahajAtlasWeb#153, shipped in #159. Reading `routing` off the rendered
  page is what makes it server-attested rather than self-reported.
- **`src/jobs/VerifyEmbeds`** — nightly (`0 3 * * *`), watermarked on
  `canonical.nextVerifyAt`, bounded to enabled services. Three consecutive
  definitive failures switch ownership off and notify the `primaryContact`.
  Writes go through the atomic-SQL seam, not `payload.update`.
- **`POST /api/clients/:id/verify-embed`** — manager-authenticated, the same
  routine on demand so setup isn't gated on the cron. It never disables.

**`failed` vs `inconclusive` is the load-bearing distinction.** `failed` is
evidence about the customer's embed and counts toward the budget.
`inconclusive` — provider error, exhausted quota, bot challenge, missing
credentials — means we could not look, and changes nothing. Cloudflare reports
both through one error channel, so `classifyRenderError` biases every
unrecognised message to inconclusive, and matches quota *before* timeout (a
"quota exceeded" message matches both, and reading our own exhausted allowance
as their embed timing out would count a strike against them).

**Exercising it for real.** Every test stubs the render, so the integration itself — request
shape, auth, and how Cloudflare's errors map onto our vocabulary — is proven by
`pnpm tsx scripts/verify-embed-live.ts --self-test`, which drives all four outcomes against the
live API. The error codes it classifies on (`6002` selector timeout, `5006` network/DNS, `10000`
auth) were captured from real responses and are pinned in
`tests/unit/embed-verification.spec.ts`; prose matching is only the fallback, because the messages
are generic enough to be dangerous (`Network connection closed.` is what a dead customer domain
returns).

**What the marker proves, precisely.** It detects an embed that is installed and
*not working* — the case a report can never reveal, since the report is sent by
the same widget whose health is in question. It does **not** prove the page is
honest: the attribute carries no nonce, and any host that can run our script can
hand-write it. The trust boundary stays `allowedDomains`. What it buys against a
third party holding a stolen key is real though — they can claim a mount on the
client's domain in a report, but cannot make that domain serve a marker they
control.

Vocabulary lives in `src/lib/clients/canonical.ts` and the verification contract
in `src/lib/clients/verification.ts` (there, not in the collection folder,
because the job and the verifier both need them — see
`.claude/rules/project-structure.md` rule 4). `legacyConfig` was **removed**
rather than promoted, and nothing backfills from it any more: canonical
ownership now requires a *verified reported* embed, which legacy Atlas config can
never produce.

### `embedMetadata` — what the widget observed

Admin-readonly JSON, keyed by **origin + pathname**, one record per mount
(`mode`, `topLevel`, `urlWritable`, `paramPersisted`, `routing`, `lastSeen`). A
JSON column because nothing queries it — the ownership resolver loads every
client with `pagination: false` (~31 rows) and filters in memory. ⚠ Revisit if
the client count grows by an order of magnitude. The field carries a
`jsonSchema`, so Payload both generates the type and rejects a malformed write.

Observed, never configured: the hand-maintained legacy `embed_type` was wrong in
the field (`sahajayoga.at` is recorded as `script` and in fact serves an
`<iframe>`).

**Canonical viability is automatic; canonical *identity* is not.** A human
designates which discovered mount is canonical; the reported metadata only
decides whether that mount currently qualifies, in both directions. That stops a
canonical flip-flopping between two embeds on one site, and bounds the tampering
surface — a forged report can only assert viability for a mount someone already
chose, and cannot make the *verifier* see something that is not there.

**The body is `origin` + `pathname`, two fields**, matching what the widget
sends (sydevs/SahajAtlasWeb#159). The split is not cosmetic: the endpoint refuses
a path carrying a query string, and can only enforce that if the path arrives on
its own. The single exception is a WordPress default permalink, `?p=<digits>` —
discarding the query would collapse such a site onto one mount and leave the page
an operator must name as canonical unnameable, for exactly this feature's
audience. Every other query string is still refused, `?p=123&utm_source=…`
included.

**The write is raw SQL, and has to be.** `payload.update` deadlocks here: the
usage plugin increments `usage_daily_requests` on the caller's own row, on its
own connection, for the very request being served, while `payload.update` holds
that row inside the request transaction — both sides then sit on
`Lock: transactionid` and the request never returns. A single autocommit
`jsonb ||` merge has no transaction to overlap with, and closes the
read-modify-write window as a side effect.

### `POST /api/clients/report`

The write path (`src/collections/Clients/endpoints/report.ts`). Merges into the
keyed object; never replaces it.

- **`clients` is excluded from the usage plugin** (`usagePlugin.ts`), so **no**
  `beforeOperation` hook fires on this route. The handler calls
  `assertClientOriginAllowed(req)` itself, right after `requireActiveClient` —
  the same compensation a root endpoint makes. Usage tracking likewise does not
  apply.
- **Two origin checks.** The request's `Origin`/`Referer` must be in
  `allowedDomains`, *and* so must the reported `url`'s host — a client can only
  describe pages on domains it owns, whether or not a browser sent an `Origin`.
- **`url` is origin + pathname only.** A query string or fragment is rejected
  (`400`, `errors[0].code: query_or_fragment`), not stripped: the widget already
  strips them (as `hostPageUrl()` does for Sentry), so a payload carrying either
  means the widget is misbehaving and cleaning it up quietly would hide that.
- **Rate limiting is Cloudflare's**, at the edge, as for every other client
  route (this app's `rateLimitHook` is a no-op on Railway). On top of that the
  handler is free when there's nothing new to say: a repeat of a recent
  identical observation is answered `updated: false` with **no read and no
  write**. That path carries the traffic — since sydevs/SahajAtlasWeb#153 the
  widget reports on **every page load**, not only when something changed.
- **The cap bounds storage, never which mounts are knowable** (#639).
  `MAX_EMBED_MOUNTS` (50) caps what a forger can accumulate, but a client at the
  cap still reports a **new** mount: the least-recently-seen entry is evicted to
  make room, so which 50 are held reflects what is currently live rather than
  what arrived first. **There is no 429** — refusing growth was first-50-wins,
  and once ordinary traffic could fill the budget (see the bullet above) it meant
  the page an operator wanted to nominate could never be reported and so never
  appeared in the picker.

  Two things the rule will not spend:

  - **The designated `canonical.embed` is never evicted**, whatever its
    `lastSeen`. It is one page competing with however many the site's traffic
    touches, and the picker's selection and the verification job's subject both
    resolve through that key — evicting it would cost a live canonical URL the
    mount it is built from.
  - **The mount just reported**, so a clock running behind can't delete the very
    write the request came to make.

  The decision is pure (`mergeEmbedReport` in `src/lib/clients/embedMetadata.ts`)
  and the endpoint applies it in one statement: `|| $1::jsonb` merges the record
  and `- $2::text[]` deletes the evicted keys. **Both halves are load-bearing** —
  `||` cannot delete, so merging the post-eviction record alone would re-compute
  and re-drop the same mounts on every report while the column grew without
  bound, leaving the cap inert.
- It is registered in the OpenAPI shim but stays `x-internal`; see
  `.claude/rules/openapi.md`.

Tests: `tests/unit/client-embed-metadata.spec.ts` (mount keys incl. the `?p=`
carve-out, and the merge), `tests/unit/embed-verification.spec.ts` (marker
parsing, error classification, and the failed/inconclusive split),
`tests/unit/canonical-embed-picker.spec.ts` (canonical-URL building incl. the `&`
join, the three-strikes ladder, picker option derivation), and
`tests/int/client-canonical.int.spec.ts` (the hook, the endpoint, the job ladder,
reaching the cap and reporting past it, and that enabling ownership re-roots an
event's `webUrl` while leaving `webPath` byte-identical).

## Per-region canonical `webUrl` (#634)

`webUrl` is **not** one global base. It resolves to the client that owns the
document's region — or the nearest owning ancestor — and falls back to the We
Meditate surface when nothing in the ancestry is owned. `SAHAJATLAS_URL` is no
longer a canonical base anywhere; it survives only in the two live-preview URLs.

| Piece | Where |
| --- | --- |
| The two URL shapes (`path` / `query`), and the cross-repo fixture | `src/lib/atlas/canonicalUrl.ts`, `atlas-url-contract.json` |
| Region tree + ancestor chains, one query per request | `src/lib/atlas/regionTree.ts` |
| Ownership: the `clients` read + nearest-ancestor walk | `src/lib/atlas/regionOwners.ts` |

```
path :  https://{domain}{mount}{webPath}   → https://wemeditate.com/map/nl/amsterdam/1204
query:  https://{domain}{mount}{?|&}atlas={webPath}
                                           → https://sahajayoga.nl/locatelessons/?atlas=/nl/amsterdam/1204
                                           → https://host.example/?p=42&atlas=/nl/amsterdam/1204
```

Things worth knowing before touching it:

- **`webPath` is unchanged by any of this** — still the bare ancestor slug chain,
  no base, no owner. Ownership only decides what it is joined to.
- **Two extra queries per request, total** — one `regions`, one `clients`, both
  memoized on the `PayloadRequest`, independent of how many documents resolve.
  Ownership loads **lazily**: a `webPath`-only read (the widget's geojson feed)
  still issues one query and never looks at ownership. Asserted by counting
  `payload.find` calls in `tests/int/region-canonical-url.int.spec.ts`.
- **Never a fragment.** Hash routing is gone from the widget with no
  back-compat, so nothing may emit `#!`.
- **The verified host is re-checked at read time, not trusted.** VerifyEmbeds
  writes `canonical.verification` with a raw `pool.query`, so the JSON schema's
  `CANONICAL_DOMAIN_PATTERN` never runs on the write that fills it — and
  `splitMountKey` records `url.host`, which keeps a port that `allowedDomains`
  (port-stripped) would let through. `loadDirectOwners` re-validates, *before*
  the ancestor walk, so an unusable client is skipped and the next ancestor up
  wins rather than its whole subtree collapsing to the fallback.
- **The path is emitted raw**, not percent-encoded — a no-op only because region
  slugs are transliterated to `[a-z0-9-]` and event ids are numeric. That
  assumption is asserted in `tests/unit/atlas-canonical-url.spec.ts`; widening
  the slug charset fails there.
- **Region paths are queryable** now that the nested-docs plugin has a
  `generateURL`: `where[breadcrumbs.url][equals]='/nl/amsterdam'`. Note it
  matches **descendants too** (their trail contains the ancestor's URL) — add
  `slug` to the `where` to resolve exactly one region. Existing rows need
  `pnpm tsx scripts/backfill-region-breadcrumb-urls.ts` once.

## Usage plugin (`src/plugins/usage/`)

| File             | Purpose                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `usagePlugin.ts` | Plugin orchestration                                                |
| `hooks.ts`       | `usageTrackingBeforeOperationHook` (beforeOperation); `rateLimitHook` (no-op on Railway) |
| `tasks.ts`       | `trackUsageTask`, `resetUsageTask` factories (Postgres atomic ops)  |
| `types.ts`       | Type definitions and constants                                      |

## Authentication flow

1. Client sends `Authorization: clients API-Key <key>` (+ optional `X-User-ID`).
2. Payload authenticates via the encrypted API key.
3. Cloudflare edge (rate limiting rules) checks rate limits (no app-level limiter needed).
4. Access middleware enforces read-only RBAC permissions.
5. `usageTrackingBeforeOperationHook` increments usage once per top-level client
   read (beforeOperation), skipping internal relationship-population sub-reads
   (numeric `currentDepth`) so `depth >= 1` reads don't over-count. See #559.
6. Increment is a single atomic Postgres UPDATE.

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

The companion predicate `isTrustedReq(req)` reads that flag back. Honour it in
hooks that shape the **client-facing result** of a read — an endpoint doing its
own lookup needs the true state, so silently narrowing it turns a precise error
into a confusing one (`excludeFinishedEvents` exempts trusted reqs so
`POST /api/events/{id}/register` can answer 409 instead of 404). Do **not**
honour it in security gates — see `validateClientOriginHook` below.

### System writes: `asSystemReq`, and why `overrideAccess` isn't enough

A third helper sits beside those two: `asSystemReq(req)` returns the same
request with **no user**. Reach for it when a client-triggered operation
performs a write that isn't on the caller's authority — the registration
vote-sync hook updating the *event*, for instance.

`overrideAccess: true` is not sufficient on its own, which is the trap. It
skips collection access but **not** `filterOptions`, which Payload validates
against `req.user`: a write touching the events `region` picker (owner-scoped
for atlas managers) is refused for a caller who could never pass that filter,
400ing an operation the client was entitled to trigger but not to perform
itself.

`context`, `transactionID` and `payload` still travel by reference, so the
transaction and per-request memoization are unaffected — only the authority
changes. Distinct from `asTrustedReq`, which keeps the user and relaxes the
query-shape gate; the two compose.

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

## Client read contract: finished events (#603)

A **finished** event — one whose schedule has fully run out — stays `published`,
because its Atlas page must keep resolving for a seeker following an old link
(`webPath` / `webUrl` are publish-gated, so unpublishing is precisely what would
break those links). It drops out of the public *feeds* instead. So for API
clients:

| Read                       | Finished events                                                       |
| -------------------------- | --------------------------------------------------------------------- |
| `GET /api/events`          | **excluded by default**; an explicit `where` on `schedule.lastDate` opts out |
| `GET /api/events/geojson`  | **always excluded** — no opt-out; a caller's `where` can only narrow   |
| `GET /api/events/{id}`     | returned normally, with non-null `webPath` / `webUrl`                  |
| `GET /api/atlas/seo`       | a **region** route's listing excludes them (its internal list read runs the same hook); an **event** route returns one normally, since it is a single-doc read |
| `GET /api/atlas/sitemap`   | **excluded** (its list read runs the same hook) — the page still resolves, but a sitemap asks a crawler to index it |
| Admin / manager / job reads | unaffected (the Atlas sidebar buckets on `verificationStage`)          |

"Finished" = `schedule.lastDate` (end of the final occurrence's **local** day) is
in the past. An event running today stays listed until midnight in its own
timezone. A NULL `lastDate` means no fixed end (open-ended recurrence), and
`inactive` events are dormant by design — neither is ever finished. One
definition, two expressions: `shouldFinish` (`@/lib/schedule/scheduleStatus`) in
memory, `notFinishedWhere` (`@/collections/Events/lifecycle/finished`) as SQL,
pinned to agree by `tests/unit/schedule-status.spec.ts`.

The list-read default is applied by the `excludeFinishedEvents` beforeOperation
hook on Events; the opt-out is any `where` naming `schedule.lastDate` (**dotted
path only** — Payload rejects the nested-group form `where[schedule][lastDate]`
with "path cannot be queried"). `POST /api/events/{id}/register` refuses a
finished event with **409** ("This event has ended"), since the published-only
access filter no longer catches it.

> **Existing clients see fewer docs from `GET /api/events`.** Deliberate. The
> contract is published on the geojson operation's OpenAPI `description`; the
> generated `/api/events` path has no description seam (custom paths merge into
> the spec by shallow spread, so annotating it would replace the generated
> operation).

## Origin / Referer Enforcement

`validateClientOriginHook` (`src/plugins/usage/hooks.ts`) is the second
beforeOperation client gate. The usage plugin runs it **first** on every
non-excluded collection — ahead of the query-param gate and rate accounting — so
a disallowed origin is rejected before any other work. Centralizing it in the
plugin means it covers standard client reads **and** the custom Atlas endpoints
(`GET /api/events/geojson`, `POST /api/events/:id/register`), whose internal
`payload.find` / `payload.create` calls forward the client `req`.

The rule itself lives in **`assertClientOriginAllowed(req)`**; the hook is a thin
wrapper adding the `currentDepth` exemption. An endpoint whose **handler** touches
no collection runs no beforeOperation hook of its own, so it must call the
assertion itself — all three root endpoints do, right after `requireActiveClient`:
`POST /api/contact-admin` (which reads nothing at all), `GET /api/atlas/seo` and
`GET /api/atlas/sitemap` (whose own forwarded reads *would* fire the hook, but
only after the handler has already begun work). Don't lean on an incidental
collection read to trigger the hook instead: `clients` is excluded from the
plugin, so re-reading the caller's own record wouldn't fire it either.

### Rule

- Runs only when `req.user?.collection === 'clients'` — managers, admin UI, and
  server tasks are untouched.
- **Empty / unset `allowedDomains` → allow any origin** (backward-compatible
  default; the field is the Atlas-config textarea on `Clients`).
- **Non-empty `allowedDomains`** → the request `Origin` (or the `Referer` host as
  fallback) must match an entry, else **403**.
- **No `Origin`/`Referer`** (server-to-server, cron) → **allow**; the API key
  remains the gate.

### Matching (`src/plugins/usage/originEnforcement.ts`)

Pure, unit-tested helpers normalize both sides to a bare host — scheme, userinfo,
port, path, and trailing dot stripped, lowercased — then match:

- **Exact host**: `example.org` matches only `example.org`.
- **`*.` wildcard**: `*.example.org` matches any subdomain (`a.example.org`,
  `a.b.example.org`) but **not** the apex `example.org`. The leading-dot suffix
  blocks injection (`evil-example.org` does not match).

### Bypasses

- **Valid live-preview secret** (`hasValidPreviewSecret`) — same trust signal that
  unlocks drafts and skips the query-param gate.
- **Internal relationship-population reads** (numeric `currentDepth`) — they reuse
  the already-validated top-level request's origin.
- `asTrustedReq()` does **not** bypass origin enforcement. Its
  `skipClientQueryValidation` flag is a query-shape opt-out, not a security one —
  forwarded client reads stay enforced against the caller's real origin.

On rejection the hook logs `clientId` + origin + referer at WARN. The geojson and
register handlers surface the thrown `APIError(403)` verbatim (instead of masking
it as a 500).

### CORS

`payload.config.ts` sets `cors: { origins: '*', headers: ['x-sahajcloud-preview-secret'] }`.
Per-client CORS is impossible — CORS preflight (`OPTIONS`) is anonymous (the
browser omits `Authorization`), so the server cannot return a per-client
allowlist at preflight time. Wildcard origins let embedded widgets' preflight
succeed on any host page; the real per-domain gate is this server-side hook plus
the API key. Payload omits `Access-Control-Allow-Credentials` for wildcard
origins, so cookie-based admin sessions stay protected — the `csrf` allowlist is
unchanged.

The `headers` list **appends** to Payload's default allow-list (#575): the Sahaj
Atlas live-preview widget fetches drafts client-side, so the draft-unlock
`x-sahajcloud-preview-secret` header (`src/lib/utilities/previewSecret.ts`) rides
cross-origin browser requests and must clear preflight. Guarded by
`tests/int/cors-config.int.spec.ts` (real config through Payload's
`headersWithCors`) and `tests/e2e/cors-preflight.e2e.spec.ts` (live preflight
against the deployed preview).

### Tests

- `tests/unit/origin-enforcement.spec.ts` — normalization + matching (exact,
  wildcard, suffix-injection, empty, missing-header).
- `tests/int/client-origin-enforcement.int.spec.ts` — wiring through
  `payload.find` and the geojson/register endpoints (403 / allow).

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
- Sentry: `usageTrackingBeforeOperationHook` logs client requests (no rate limiter events).
- Pino: `clientId`, IP, timestamp logged at usage tracking time.

## Testing

- `tests/int/clients.int.spec.ts` — Client CRUD + hooks
- `tests/int/api.int.spec.ts` — usage tracking + reset jobs
- `tests/e2e/clients.e2e.spec.ts` — admin UI flows
- `tests/utils/` — factories for clients and authenticated requests
