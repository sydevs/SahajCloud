---
paths:
  - src/plugins/usage/**/*.ts
---

# API Client Authentication, Rate Limiting, Usage Tracking

REST authentication for third-party clients lives in the `Clients` collection plus the `usagePlugin`, which auto-applies hooks and registers one scheduled task, `resetUsageTask`. GraphQL is disabled — all client access is REST-only.

The `clients` record itself — its key, canonical ownership and embed verification, per-region `webUrl` ownership, and the mailing list — is in `docs/rules/clients.md`, which loads for `src/collections/Clients/`.

## Authentication flow

1. The client sends `Authorization: clients API-Key <key>` (plus optional `X-User-ID`).
2. Payload authenticates via the encrypted API key.
3. Cloudflare's edge rate-limiting rules check the request — no app-level limiter is needed.
4. Access middleware enforces read-only RBAC.
5. `usageTrackingBeforeOperationHook` counts one request per client request, skipping internal relationship-population sub-reads (`depth >= 1`, #559) and, through a per-request cell, every later read of the same request (#891) — see "One request, one count" below.
6. The increment is a single atomic Postgres UPDATE.

### A key that authenticates nothing is reported as its own signal (#734)

A key matching no `clients` row is denied, correctly — but it used to be reported exactly like an anonymous read, so a dead integration looked like background noise for three months. A sub-500 error whose `Authorization` header failed to authenticate now reaches Sentry at `error` level, under its own fingerprint, and the same denial is written to the application log at WARN:

```
API credential presented and rejected
  source, status, url, outcome, authCollection, authScheme, keyFingerprint, userAgent, ip
```

`keyFingerprint` is a 12-hex truncated SHA-256 — enough to tell two broken integrations apart, and never the key. Search Sentry by the `key_fingerprint` tag to find every request from one credential. An anonymous 403 is unchanged.

**Both denial paths report it** (#743). Payload's error hook covers everything that throws; `requireActiveClient` covers the custom endpoints that deny by _returning_ a 403 — `/api/atlas/seo` and `/api/atlas/sitemap` among them — which no hook ever sees. `source` says which one denied, and the message is one string on purpose: two spellings would split the log query. Every rejection reports, on both paths — mute the volume with a Sentry-side rule on `auth_outcome`, never in this process. Detail: `docs/architecture.md`.

## Security

Access is permission-based via `accessPlugin` — a client needs an explicit permission for everything, gets **no delete access, ever**, and cannot reach `Managers` or `Clients` at all. Only an active client can authenticate. Keys are encrypted with `PAYLOAD_SECRET`. GraphQL is disabled.

### Every public write path requires Turnstile

`writeGuardPlugin` runs anti-spam checks on **client-originated** writes. `turnstile: true` in `DEFAULT_WRITE_GUARD_POLICIES` requires a solved token in the **`x-turnstile-token`** header, kept out of the document shape. Registrations were the last public write without it (#629) — the gate could only turn on once the Atlas widget sent the header (sydevs/SahajAtlasWeb#182), so the two shipped in that order.

| Outcome                                         | Status | `errors[0].code`      | Client action                                 |
| ----------------------------------------------- | ------ | --------------------- | --------------------------------------------- |
| Missing, forged, expired, or **replayed** token | 403    | `captcha_failed`      | Reset the challenge, retry with a fresh token |
| Our secret unset, or Cloudflare unreachable     | 500    | `captcha_unavailable` | Retry later — never a pass                    |

⚠ **Tokens are single-use** — a replay is refused exactly like a forgery, so retrying with the _same_ token after any error gets a second 403.

⚠ **The gate fails closed on our own misconfiguration, on purpose.** A captcha that silently disables itself on a missing secret is worse than none, since nothing would surface the misconfiguration. There is no dev/test bypass — point `TURNSTILE_SECRET_KEY` at Cloudflare's always-passes test key locally.

### `POST /api/user-submissions` — the unified intake

One collection accepts every public write, discriminated by `type`: `contact`, `subscribe`, `registration`, `proposal` (#723). Turnstile, the disposable-email check and the URL scan apply to all four — the guard runs before anything reads `type`, so a policy relaxed for one type would be reachable by claiming to be that type.

Two refusals are specific to it, each with a message naming what to fix:

| `errors[0].code`           | Status | Means                                                                                                                                                                            |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submission_data_invalid`  | 400    | An unrecognised `type`, or a `submissionData` pair carrying a key this type does not accept, a duplicate key, a non-string value, or an over-long one. The message names the key |
| `submission_type_mismatch` | 400    | The `type` disagrees with the form's `actionType`. The form is the authority on what a submission against it is                                                                  |

Every per-field refusal names the input that tripped it: `errors[0].data` is `{ code, field }`, where `field` is the body path (`senderEmail`, `proposed.contactEmail`) or the `submissionData` pair name. The write guard and the intake hook raise the same codes with the same shape, so a client never has to tell which of the two refused it. `captcha_failed` and `captcha_unavailable` carry no `field` — they judge the request, not an input.

`urls_not_allowed` also reaches `submissionData`, with two deliberate exemptions. `path`, `hostUrl`, `error`, `userAgent` and `locale` are never URL-scanned, because an issue report names the page it happened on. Neither is an answer to one of the form's **email** questions: it is validated as an address instead, so such an answer is refused as `invalid_email` — what a link typed into one gets — or `disposable_email`, never `urls_not_allowed` (#899). `disposable_email` is the newly reachable half: an answer the caller does not also send as `senderEmail` had no disposable-domain check before. The exemption keys on the authored block type, so it follows whatever the operator named the field.

An address's domain half is not a link, in any scanned field: `visitor@gmail.com` passes (#921). A value carrying both still fails — `a@b.com buy at cheap.shop`, and `https://user@evil.com`.

A **proposal**'s `proposed` patch is scanned at screening rather than at create, so a link in it never reaches a response: the row is binned `spam` asynchronously, and nothing re-screens it. Every Events column that exists to hold an address or a link is exempt there, read off the Events config rather than listed (#920), so a client may send a real `https://` URL in one and a venue's address in another. Free text beside them — a title, a description, a street line — is refused exactly as `submissionData` is.

Clients hold **create only**, with no update of any kind and no read at any depth or scope.

### What happens after the 201

A create returns `status: pending`; screening and then delivery run on the queue. A client is never told the outcome — there is no status endpoint and no callback. The row's `activityLog` is the record, and a manager reads it in the admin.

A **registration** carrying `subscribe` in its `submissionData` spawns a linked subscribe-type row in the same request, carrying the registration's own `event`. That row is the consent record, with its own status, screening and retries — there is no `mailingListSubscribedAt` timestamp, because a timestamp recorded that somebody had consented and delivered nothing. Offer the opt-in only where the event's `offersMailingList` is true: that is the list the row will be delivered to (`docs/rules/clients.md`). It resolves on a single-event read only, and is `null` in a list.

A new-event **proposal** is placed from its Mapbox feature ids: the address's own `proposed.address.mapboxId`, and `location` — the `placeId`, `regionId` and `countryId` layers above it. An online class has no address, so its city goes in `location.placeId`. Intake matches them against `regions.mapboxId` and places the row in the matched venue or city, so its review email reaches that region's manager (#1021). The ids are the only location input a client writes — `region` and `regionHint` are system fields — and a value outside `[A-Za-z0-9_=-]` is refused.

## A global read is a client read (#710)

`GET /api/globals/<slug>` now carries everything a collection read does: the four `beforeOperation` gates, edge-cache headers, and purge-on-write. Before #710 the usage plugin mapped `config.collections` only, so a global read was unmetered, outside origin enforcement, and exempt from the `select` gate — while every atlas widget boot on every host page and every WeMeditateWeb request reads its config and its translations from one.

For a client, that means three behaviour changes:

- **It counts against the daily quota**, once per top-level read. A global that populates relationships (`wm-web-config` → `pages`) still costs exactly one: the nested reads carry a numeric `currentDepth` and are skipped.
- **It must send `select`**, or it is refused **400**, and **`populate`** at effective `depth > 1`. All three readers we can see already do.
- **It is origin-enforced.** A client with a non-empty `allowedDomains` reading a global from an origin outside that list gets **403**.

`usagePlugin` registers the same four gate bodies on both surfaces, rather than a second copy — two copies would let origin enforcement or the select gate drift between a collection read and a global read. There is no adapter and no cast: the gates are typed as `ClientReadGate`, the argument shape both of payload's `beforeOperation` signatures satisfy, so `tsc` checks each registration. The global surface wraps each in `onlyOnCallerAuthority`, the one exemption a global needs.

### ⚠ The global surface's `overrideAccess` exemption

A collection hook skips an internal read through the numeric `currentDepth` payload attaches to relationship population. **A global read has no such signal**, and this codebase makes several internal global reads that forward the caller's `req` — `clientEnglishFallback` re-reads its own global in English, `loadAppConfigOnce` reads `wm-app-config` while serving a page, and the atlas endpoints read `sy-atlas-config`. Ungated, each would be metered twice, and the ones passing no `select` would be refused 400 — which for the fallback is caught and logged at debug, silently blanking every untranslated key for every client.

`overrideAccess` separates the two exactly. Payload's REST handler for a global never passes it, so a client's own read arrives `false`; the local API defaults it to `true`, so every `payload.findGlobal()` in our server code arrives `true`. It cannot be set by a caller over REST, which is what makes it sound for the origin gate as well as the meter.

**A spec exercising these gates must therefore pass `overrideAccess: false`** — unlike the collection specs, where `overrideAccess: true` is a convenience that changes nothing. Omit it and every gate correctly skips, leaving assertions that pass for the wrong reason. `tests/int/globals-client-reads.int.spec.ts` says this at its head.

⚠ **Reproducing that value is not pinning it.** A spec that supplies the flag proves the adapter and says nothing about what payload hands it on a real request, so a default of `undefined` after a payload bump would no-op all four gates with the whole suite green. The same spec's `the REST default for overrideAccess` cases close that: they drive `handleEndpoints` with the client's API key and supply nothing. That pair is the only place the gates are observed reaching a real client request — keep it when the spec is reorganised.

Caching and purge for the same reads are in `DEPLOYMENT.md`; the cacheable set is `CACHEABLE_GLOBALS` in `src/plugins/cache/policy.ts`.

## Query parameter validation

An API client read must declare its data needs: `select` is required on every read, and `populate` is required whenever effective `depth > 1` (explicit or the server default). `validateClientQueryParamsHook` enforces this before rate limiting, so a malformed read costs no rate-limit slot. Managers, admin UI requests, and writes are unaffected. It applies to a global read too (#710, above).

### `limit` and `page` bounds (#887)

The same gate bounds the two numbers that reach SQL. A client may send `limit` up to **2000** and `page` up to **10000** (`MAX_CLIENT_LIMIT` / `MAX_CLIENT_PAGE` in `src/plugins/usage/constants.ts`, which the OpenAPI parameter docs also read); either outside `0 … its ceiling`, or not a whole number, is refused **400** naming the bound. ⚠ **"Not a whole number" includes a value that is not a number at all**, which it did not until #889: `parseParams` coerces these two only when payload's own `isNumber` passes, so `?limit=abc` and a bare `?limit=` arrive as strings and used to be skipped — reaching the driver as a non-integer `LIMIT` and answering 500. Only an **absent** value passes. A global read carries neither, so nothing changes there.

**Clients only, deliberately** — a manager, the admin UI and an internal read are trusted with their own numbers, and `hooks.ts` returns early for all three. The bound runs _ahead_ of the `asTrustedReq` and live-preview bypasses, though, unlike the `select` gate: those relax a shape policy, and this one keeps a number out of the driver.

```
❌ GET /api/meditations?select[label]=true&limit=99999999999999999999   → 400
❌ GET /api/meditations?select[label]=true&page=99999999999999999999    → 400
✅ GET /api/meditations?select[label]=true&limit=2000                   → 200
```

Both ceilings are headroom, not a budget: our own largest paginated read asks for 1000 (`src/plugins/usage/tasks.ts`), and the largest any consumer sends is 100. They exist because unbounded, **each one alone returns 500** — the driver overflows on a 20-digit `limit`, and on the `(page - 1) * limit` offset a 20-digit `page` produces. Bounding `limit` alone leaves the second door open, and a negative `page` reaches the same 500 as `OFFSET -20`.

### No unbounded read (#889)

A client gets no whole-table read. Payload decides that in two steps — `find.js` computes `usePagination = pagination && limit !== 0`, then `limit ?? (usePagination ? 10 : 0)`, and the drizzle adapter emits no `LIMIT` clause for `0` — so **the refusal keys on the effective limit, not on a parameter**. Exactly two shapes are refused **400**:

```
❌ GET /api/regions?select[name]=true&limit=0                      → 400
❌ GET /api/regions?select[name]=true&pagination=false             → 400
✅ GET /api/regions?select[name]=true&pagination=false&limit=100   → 200
✅ GET /api/regions?select[name]=true                              → 200 (limit defaults to 10)
```

⚠ **`pagination=false` with a non-zero `limit` is bounded and stays allowed.** It only skips the `COUNT(*)`, and three internal reads use exactly that shape on purpose. Refusing the parameter rather than the effective limit would break them.

**This check sits _after_ the `asTrustedReq` and live-preview bypasses** — the opposite of the range bounds above, and the difference is the point. A range bound keeps a number out of the driver, so it runs ahead of every bypass. This one is a policy about what a _client_ may ask for, and six internal endpoint reads forward `limit: 0` through `asTrustedReq`; ahead of the bypass each would 400 on a client request.

⚠ **SahajCloud's own forwarded reads had to be fixed first, in the same change.** The gate reads its arguments, not the URL, so it cannot tell a client's `pagination=false` from one this codebase wrote on the client's own `req`. `loadRegionTree` (reached from the `webPath` / `webUrl` virtual fields) and both `GET /api/atlas/sitemap` reads are unpaginated on purpose, and now forward `asTrustedReq(req)`. The sitemap's events read ANDs `notFinishedWhere` itself as a result, because `excludeFinishedEvents` stands down for a trusted req.

⚠ **A fourth such read is deliberately left refused**, and the asymmetry is the point. `wm-app-status`'s readiness fields fan their `afterRead` out into fourteen unpaginated **collection** reads on a copy of the caller's `req` (`src/globals/WeMeditateAppStatus/sections/shared.ts`), so a client selecting one is now refused from inside. That global is an operator report over cookie auth — the one global excluded from edge caching for that reason — and five of its six sections were already refused, because their reads pass no `select`. Wrapping them would relax the select gate too and open all six. Whether the fields should carry a read lock, closing it by construction rather than by that accident, is open.

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

A trusted internal handler forwarding a client `req` to `payload.find`/`findByID` should wrap it via `asTrustedReq()` (sets `req.context.skipClientQueryValidation`), so it need not enumerate `select` while rate limiting and usage tracking still see the authenticated client — counting it once for the whole request, not once per wrapped read (below). The companion `isTrustedReq(req)` reads that flag back. Honour it in a hook shaping the **client-facing result** (`excludeFinishedEvents` exempts a trusted req so registration can answer 409 instead of 404), but never in a security gate — `validateClientOriginHook` does not honour it.

⚠ **The flag relaxes two of the three query rules, so a wrapped read is bounded by nothing but its own arguments.** It skips the `select`/`populate` shape gate and the unbounded-read refusal (#889) — which is what lets an internal read pass `limit: 0` on a client's request — while the `limit` and `page` range ceilings still apply (#887). **So wrapping a read is also taking responsibility for its size.** Say at the call site why the corpus it reads is bounded, as `loadRegionTree` and `GET /api/atlas/sitemap` do.

### One request, one count (#891)

**The counters are an abuse signal, not an invoice.** Nothing charges a client for a read — `usage_daily_requests` exists so an unusual volume crosses `HIGH_USAGE_THRESHOLD` — a high-usage day at the nightly reset, and an input to the abuse score. That is why a route counting 5 for one request is a defect and not a rounding error.

A shaped endpoint issues 2 to 5 forwarded reads, and each one is a `read` the meter sees. Payload attaches nothing to them — its only internal-read signal, a numeric `currentDepth`, is set for relationship population and nothing else — so `/api/meditations/:id/related-lectures` was counted 3 to 5 requests, and any client read selecting `webPath` was counted 2 through the region-tree resolver. `usage_daily_requests` feeds `HIGH_USAGE_THRESHOLD`, so an inflated route fired the high-usage alert early.

`countClientRead(req)` is now idempotent per request, through a **mutable object** on `req.context`:

- ⚠ **An object, not a boolean.** `asTrustedReq` spreads `req.context` into a new object, so a boolean written through one copy is invisible to the next. That is the mechanism #559's commit message describes and never had. A nested object is copied by reference, so every copy mutates one cell.
- ⚠ **Seeded before the spread.** `asTrustedReq` creates the cell on the `req` it is copying _from_, which is what makes the copies share one. A wrapper that spread first would give each read its own cell.
- ⚠ **The count lands inside the first read, after that read's own gates.** The meter runs last in the chain, so an origin-denied or malformed read costs no quota. A handler counting before its first read would let a misconfigured host page drain a client's daily quota while being refused 403 every time — a collection endpoint has no origin check of its own, because enforcement happens in the forwarded read.

So **a collection endpoint needs nothing**: its own reads count it, exactly once. **A root endpoint calls `countClientRead(req)` itself**, because it runs no collection `beforeOperation` hook and may read no metered collection at all — `GET /api/atlas/seo`'s root route resolves through two globals and the caller's own `clients` row, and so counted nothing.

**A write is not counted for itself** — the hook returns unless `operation === 'read'` — **but its own forwarded read still counts**: a client's registration `POST /api/user-submissions` costs 1, through the gate's events lookup.

`tests/int/usage-tracking-dedup.int.spec.ts` pins the count for every client-reachable route, and asserts a number rather than "fewer than before" — a route counting 0 is as wrong as one counting 5. Its header records which cases are regression tests and which are contract pins.

### System writes: `asSystemReq`, and why `overrideAccess` isn't enough

`asSystemReq(req)` returns the same request with **no user** — reach for it when a client-triggered write isn't on the caller's own authority (the registration vote-sync hook updating the _event_). `overrideAccess: true` alone is not enough: it skips collection access but **not** `filterOptions`, which Payload validates against `req.user` — a write touching an owner-scoped picker would 400 for a caller entitled to trigger the operation but not to perform it directly. `context`, `transactionID`, and `payload` still travel by reference. Only the authority changes. `asTrustedReq` keeps the user and relaxes the query-shape gate instead — the two compose.

### Live preview bypass

Admin live preview opens a consumer site with a short-lived Ed25519 token (an EdDSA JWS, signed and verified with `jose`) on the URL. The consumer forwards that token back here in `x-sahajcloud-preview-secret`, and a request carrying one this service issued is a trusted preview request. Since it renders the whole document, `validateClientQueryParamsHook` skips it via `isLivePreviewRequest(req)` — the same helper the access layer uses to unlock drafts. Rate limiting and usage tracking still apply.

**The header name is unchanged, its contents are not.** It used to carry `SAHAJCLOUD_PREVIEW_SECRET` verbatim — a long-lived symmetric secret that also rode in the panel's URL, where browser history, `Referer`, Sentry session replay and an analytics script that posts `location.href` all read it. A public bundle like the atlas widget could never verify it either, since holding it means being able to mint it. The name stayed because the Cloudflare Cache Rule matches on it and the CORS allowlist names it, and neither cares what the value means.

⚠ **The verdict is resolved once, ahead of the gates that read it.** Verifying a signature is asynchronous; three of the four readers are synchronous. `resolveLivePreviewHook` runs first in the `beforeOperation` chain and stamps the answer on `req.context`, which is safe because Payload awaits every `beforeOperation` hook before resolving access (`collections/operations/find.js`, `globals/operations/findOne.js`). It returns synchronously when the header is absent, which is almost every request, and leaves those unstamped. An unstamped request reads as **no preview** — failing closed is the only safe default for a flag whose job is to unlock drafts.

## Client read contract: finished events (#603)

A **finished** event (its schedule fully run out) stays `published`, since its Atlas page must keep resolving for an old link — but it drops out of public _feeds_:

| Read                        | Finished events                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/events`           | Excluded by default. An explicit `where` on `schedule.lastDate` opts out              |
| `GET /api/events/geojson`   | Always excluded, no opt-out                                                           |
| `GET /api/events/{id}`      | Returned normally                                                                     |
| `GET /api/atlas/seo`        | A region listing excludes them. A single-event read returns it                        |
| `GET /api/atlas/sitemap`    | Excluded — the page still resolves, but a sitemap shouldn't ask a crawler to index it |
| Admin / manager / job reads | Unaffected                                                                            |

"Finished" means `schedule.lastDate` (the final occurrence's local end-of-day) is in the past — an event running today stays listed until midnight in its own timezone. A NULL `lastDate` (open-ended recurrence) and an `inactive` event are never finished. One definition, two expressions: `shouldFinish` in memory, `notFinishedWhere` as SQL, pinned to agree by `tests/unit/schedule-status.spec.ts`.

The default is applied by the `excludeFinishedEvents` beforeOperation hook on Events. The opt-out is a `where` naming `schedule.lastDate` by **dotted path only** (Payload rejects the nested-group form). A `type: registration` create on `user-submissions` refuses a finished event with **409** ("This event has ended"), since the published-only access filter no longer catches it.

> Existing clients see fewer docs from `GET /api/events`. This is deliberate, and published on the geojson operation's OpenAPI `description` (the generated `/api/events` path has no description seam to annotate).

## Client read contract: which languages a document is published in (#718)

`pages` and `app-cards` set `versions.drafts.localizeStatus`, so `_status` is stored **per locale**. Publishing German says nothing about French, and one read answers which languages a document is live in:

```
GET /api/pages?locale=all&select[_status]=true
→ { "docs": [ { "id": 12, "_status": { "en": "published", "de": "draft" } } ] }
```

Read the map by this rule: **a locale is published only when it says `published`.** A locale that was never translated has no row at all and is simply **absent** from the map — a page published in English alone reports `{ "en": "published" }` and nothing else. Absent is not published. Do not derive the answer from the site's locale set, or from which locales have _any_ version.

Five things to know:

- **`locale=all` is what makes it a map.** A single-locale read resolves `_status` through the English fallback, so an untranslated locale reports itself published and the answer is wrong in the permissive direction. This is the same trap `availableLocalesField` documents for the translations globals.
- **It costs no extra query.** The Postgres adapter joins `_locales` unfiltered on every localized read, so a 25-row list at `locale=all` is still one query. That is why there is no `publishedLocales` field — a collection `afterRead` computing one would have to re-read each row at `locale: 'all'`, 25 reads on a 25-row list. Pinned by `tests/int/pages-localize-status.int.spec.ts`.
- **`payload-types.ts` still types `_status` as a single string.** Payload generates the resolved shape, not the `locale=all` one, so a consumer reading the map casts. The map is the contract; the generated type has not caught up.
- **The published-only filter is now per locale.** A client restricted to published documents reads a locale only where that locale's row says `published`. The filter is SQL, so it sees rows, not the fallback the bullet above describes: an unpublished translation is unreachable, and so is a locale that was never translated, because it has no row for the filter to match.
- ⚠ **That second case fires on existing data, not only on a deliberate unpublish — and it is intended.** The migration copies each document's old status into every locale row that _exists_, and an untranslated locale has none, so a page published in English alone returns nothing at `?locale=de` where Payload's English fallback used to serve it. **Decided on #765: an unpublished locale should 404, and a page must not serve English text under a German URL.** Do not add a fallback, here or in a consumer. A consumer that wants to link the locales a page _is_ live in reads the map above ([WeMeditateWeb#81](https://github.com/sydevs/WeMeditateWeb/issues/81)). Note Payload's own `localizeStatus` migration template behaves the same way: it `UPDATE`s locale rows and never inserts one.
- ⚠ **A `locale=all` read returns every locale's content, unpublished locales included.** The filter matches _documents_ — a document published in any locale — and does not narrow the locales in the response. So a cross-locale read is not a publish gate: read one locale at a time when the answer must respect publish state. This is deliberate (#765). Content here is not sensitive to read; write, edit and delete are what the roles guard. Pinned by `tests/int/pages-localize-status.int.spec.ts`.

## Origin / Referer enforcement

`validateClientOriginHook` is the usage plugin's second beforeOperation gate, run **first** on every non-excluded collection, ahead of the query-param gate and rate accounting. It covers standard client reads and the custom Atlas endpoints, whose internal `payload.find`/`create` calls forward the client `req`.

The rule itself lives in `assertClientOriginAllowed(req)`. The hook is a thin wrapper adding the `currentDepth` exemption. An endpoint whose handler touches no collection runs no beforeOperation hook, so it must call the assertion itself — both `GET /api/atlas/seo` and `GET /api/atlas/sitemap` do, right after `requireActiveClient`. Don't lean on an incidental collection read to trigger it instead — `clients` is excluded from the plugin, so reading the caller's own record wouldn't fire it either.

**Rule**: runs only when `req.user?.collection === 'clients'`. An empty/unset `allowedDomains` allows any origin (the default). A non-empty list requires the request `Origin` (or `Referer` as fallback) to match an entry, else **403**. No `Origin`/`Referer` at all (server-to-server, cron) is allowed — the API key is the gate there.

**Matching** (`originEnforcement.ts`): both sides normalize to a bare host (scheme, userinfo, port, path, trailing dot stripped, lowercased). An exact host matches only itself. A `*.` wildcard matches any subdomain but not the apex, and blocks the injection `evil-example.org` against `*.example.org`.

**Bypasses**: a valid live-preview token, or an internal relationship-population read (reusing the top-level origin already validated). `asTrustedReq()` does **not** bypass this — its flag is a query-shape opt-out, not a security one.

**CORS**: `cors: { origins: '*', headers: ['x-sahajcloud-preview-secret'] }`. Per-client CORS is impossible, since a preflight is anonymous — the browser omits `Authorization`, so the server can't return a per-client allowlist at that point. The wildcard lets an embedded widget's preflight succeed on any host page. The real per-domain gate is this hook plus the API key. Payload omits `Access-Control-Allow-Credentials` for wildcard origins, so cookie-based admin sessions stay protected. The `headers` list **appends** to Payload's defaults (#575), so the live-preview widget's `x-sahajcloud-preview-secret` still clears preflight. Guarded by `tests/int/cors-config.int.spec.ts` and `tests/e2e/cors-preflight.e2e.spec.ts`.

Tests: `tests/unit/origin-enforcement.spec.ts` (normalization and matching), `tests/int/client-origin-enforcement.int.spec.ts` (wiring through `payload.find`, the geojson endpoint and a registration create), `tests/int/globals-client-reads.int.spec.ts` (the same gate on a global read).

## Usage monitoring

Tracking is **in-request**, not queued: `countClientRead` issues one atomic `UPDATE` on the adapter's pool, outside the request transaction, at most once per request (#891). It fails open, so a tracking outage never refuses a read. `resetUsageTask` runs daily at midnight UTC, and is the only part on the queue: a day over `HIGH_USAGE_THRESHOLD` (1,000 requests) adds one to `highUsageDays`, the first such day and the tenth are reported to Sentry, and `peakDailyRequests` records the historical max.

## Rate limiting (Cloudflare edge)

Per-user rate limiting runs at the Cloudflare edge, in front of Railway, so no app-level limiter binding is needed. A request that fails the edge's rate-limiting rules gets a 429 before it ever reaches Railway, and `rateLimitHook` is a no-op.

| Setting | Value                                 |
| ------- | ------------------------------------- |
| Limit   | 500 requests                          |
| Period  | 60 seconds                            |
| Scope   | per `(client, IP)` tuple, at the edge |

`X-User-ID` (`^[a-zA-Z0-9-_]{8,64}$`) still travels for semantic clarity and log identification, but the edge does not rate-limit on it, and it is visible to the app but not privacy-enforced.

```http
GET /api/meditations HTTP/1.1
Authorization: clients API-Key abc123xyz
X-User-ID: user_12345678
```

A 429 returns `{ "errors": [{ "message": "Rate limit exceeded. Maximum 500 requests per minute." }] }`. Monitor via Cloudflare Analytics (rate-limit hits per rule), Sentry (`usageTrackingBeforeOperationHook` logs client requests), and Pino (`clientId`, IP, timestamp).
