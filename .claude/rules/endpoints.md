---
paths:
  - src/collections/*/endpoints/**/*.ts
  - src/endpoints/**/*.ts
---

# Custom Endpoint Rules

Rules for writing custom PayloadCMS collection endpoint handlers.

## File Structure

Endpoints are colocated with their collection, one handler per file:

```
src/collections/Frames/
├── Frames.ts                     # Collection definition
└── endpoints/
    └── byNarrator.ts             # Frames endpoint (exports framesByNarrator)
```

## Handler Pattern

Each file exports a single `Endpoint` object from `payload`:

```typescript
import type { Endpoint } from 'payload'

export const myEndpoint: Endpoint = {
  path: '/my-path/:param',
  method: 'get',
  handler: async (req) => {
    // Validate params
    const param = req.routeParams?.param as string
    if (!param) {
      return Response.json({ error: 'Param required' }, { status: 400 })
    }

    // Use req.payload for database operations
    const result = await req.payload.find({ collection: 'my-collection', ... })

    return Response.json(result)
  },
}
```

## Root-level endpoints (the exception)

Almost every endpoint here belongs to a collection and lives in its
`endpoints/` folder. A resource that belongs to **no** collection goes in
`src/endpoints/` and is registered on the config root instead:

```typescript
// src/payload.config.ts
import { contactAdmin } from './endpoints/contactAdmin'

endpoints: [atlasSeo, contactAdmin],
```

Three such endpoints exist, each for a different reason:

- `POST /api/contact-admin` — a contact message is stored nowhere and owned by
  nothing.
- `GET /api/atlas/seo` — the caller passes a **route**, which may name a region
  *or* an event, so no single collection owns the resource. (Putting it under
  `regions` would have been a lie half the time, and keying it by id instead
  would have pushed path→id resolution into every consumer.)
- `GET /api/atlas/sitemap` — the answer spans regions **and** events for the
  same reason, and its unit is the *client's ownership*, which is a `clients`
  fact rather than either collection's.

Prefer a collection endpoint whenever a collection plausibly owns the resource;
reach for the root only when none does.

**The folder path mirrors the URL.** A single-file endpoint sits at
`src/endpoints/<name>.ts` (`contactAdmin.ts` → `/api/contact-admin`); one that
needs supporting modules gets a folder whose path *is* the URL path, with the
handler in `index.ts`:

```
src/endpoints/atlas/seo/        →  GET /api/atlas/seo
├── index.ts                       the Endpoint (exports `atlasSeo`)
├── atlasRoute.ts                  route parsing
├── jsonLd.ts                      JSON-LD builders + escaping
└── seoDocument.ts                 the response shaper

src/endpoints/atlas/sitemap/    →  GET /api/atlas/sitemap
├── index.ts                       the Endpoint (exports `atlasSitemap`)
└── sitemapUrls.ts                 ownership filter + row shaping (pure)
```

Those supporting modules are **single-owner code and belong here, not in
`src/lib/`** — `tests/unit/lib-boundary.spec.ts` fails a lib module with one
consumer outside lib. `responseTypes.ts` stays at `src/endpoints/` because all
three endpoints share it.

**Two things you lose by leaving the collection seam** — both are the usage
plugin's `beforeOperation` hooks, which only run on collection operations, so a
root handler that touches no collection runs neither:

- **Origin enforcement.** Call `assertClientOriginAllowed(req)` from
  `@/plugins/usage` directly, right after `requireActiveClient`, and map the
  thrown `APIError` to a response. Don't rely on an incidental collection read to
  trigger it — reading `clients` in particular won't, since that collection is
  excluded from the plugin.
- **Usage tracking.** The request isn't counted against the client's quota.
  Cloudflare edge rate limiting still fronts the route; if a root endpoint needs
  per-client accounting, it has to do it itself.

Everything else still applies unchanged: `requireActiveClient` as the first
statement, and an OpenAPI entry — see the root-path note in
`.claude/rules/openapi.md`, since project visibility can't be derived from a path
segment that names no collection.

## Registration

Import the handler relatively from the collection's `endpoints/` folder and
register it on the collection:

```typescript
import { myEndpoint } from './endpoints/myEndpoint'

export const MyCollection: CollectionConfig = {
  slug: 'my-collection',
  endpoints: [myEndpoint],
  // ...
}
```

## Key Points

- One handler per file, inside the owning collection's `endpoints/` folder
  (e.g. `Frames/endpoints/byNarrator.ts` exporting `framesByNarrator`)
- Import it relatively in the collection definition — there is no shared
  endpoints barrel
- Use `req.routeParams` for URL parameters, `req.query` for query strings
- Return `Response.json()` for all responses
- Handle errors with appropriate HTTP status codes (400, 404, etc.)
- Use `req.payload` (not a separate import) for database operations

## Requirements: auth, OpenAPI, select/populate

Three things are **mandatory** for every new public (client-facing) collection
endpoint. A PR that adds an endpoint without them is incomplete.

### 1. Authenticate the caller

Public endpoints serve **published API clients**. Gate every handler with
`requireActiveClient` (from `@/lib/endpoints`) as its first statement and
short-circuit on a non-null return:

```typescript
import { requireActiveClient } from '@/lib/endpoints'

handler: async (req) => {
  const denied = requireActiveClient(req)
  if (denied) return denied
  // ...
}
```

`requireActiveClient` returns a `403` unless the caller is a **published**
`clients` user (publish/unpublish is the auth gate). Don't hand-roll the check —
it's the single source for the guard's shape + message. An endpoint that must
skip it (internal/admin-only) has to say why in a comment.

### 2. Register it in the OpenAPI shim

`payload-oapi` does **not** auto-generate paths for custom collection endpoints,
so a new endpoint is invisible in `/api/docs` until it's hand-authored. For every
endpoint you add:

- Add the path to `CUSTOM_ENDPOINT_PATHS` in
  `src/plugins/openapi/customEndpoints.ts` (keep the `/api/` prefix — project
  visibility keys off it), plus any response schema in `CUSTOM_ENDPOINT_SCHEMAS`.
- Document **every** path/query param and the exact response shape; keep a
  hand-authored response schema in lockstep with the handler's return type.
- Add the path + schema to the guard in
  `tests/unit/openapi-custom-endpoints.spec.ts`.
- Add a row to the custom-endpoint table in `.claude/rules/openapi.md`.

See `.claude/rules/openapi.md` for the full shim contract.

### 3. select / populate — match the output model

- **Passthrough endpoints** forward the query into a Payload read and return the
  docs (e.g. `GET /api/events/geojson`). These **must** accept + document
  `select` / `populate` / `depth` — reuse `selectParameter` / `populateParameter`
  / `depthParameter` from
  `src/plugins/openapi/clientReadParametersDocs.ts`, and enforce the client read
  contract (`select` required; `populate` required at `depth > 1`).

### A passthrough may narrow the caller's `where` — decide the opt-out explicitly

"Passthrough" doesn't mean the caller's `where` goes in untouched. An endpoint
that owns a *feed* may AND its own predicate on top (geojson excludes finished
events — `notFinishedWhere` in
`src/collections/Events/lifecycle/finished.ts`). Two rules when you do:

- **Filter inside the read, never after it.** ANDing onto `where` keeps
  `totalDocs` and pagination consistent with the returned docs. Dropping rows
  from `docs` after the read silently corrupts both, and breaks a paginating
  client (short pages, a "next" page that isn't there).
- **Say whether an explicit `where` wins, and be consistent about it.** The
  convention in this codebase:
  - A **feed** endpoint filters unconditionally — a caller's `where` is ANDed, so
    it can only narrow, never re-include what the feed excludes. Document the
    absence of an opt-out (`GET /api/events/geojson`).
  - A **collection list read** (a `beforeOperation` hook on `find`/`count`)
    filters by default but yields to a caller who names the filtered field:
    `excludeFinishedEvents` skips itself when the incoming `where` references
    `schedule.lastDate`. A client asking for past events gets them.

  Pick one per surface and put it in the OpenAPI `description` — a client whose
  result set silently shrinks has no other way to find out.

Two Payload behaviours to know before writing such a hook (both verified, both
easy to get silently wrong):

- **`find` and `findByID` both arrive as `operation: 'read'`.** Payload maps them
  through `operationToHookOperation`, so guarding on `'find'` matches *nothing*.
  Distinguish the single-doc read by `findByID`'s `id` arg — `if ('id' in args)
  return args` — the same trick `filterMeditationsByLocale` uses.
- **Exempt an endpoint's own forwarded reads.** A handler that forwards the client
  `req` via `asTrustedReq` is doing its own lookup and needs the true state to
  answer precisely — `POST /api/events/{id}/register` has to tell "no such event"
  (404) from "this event has ended" (409). Check `isTrustedReq(req)` (from
  `@/plugins/usage/hooks`) and return early. Note the split: **result-shaping**
  hooks honour that flag; **security** gates deliberately don't (see
  `validateClientOriginHook`).
- **Shaped endpoints** return a fixed, hand-built structure (e.g.
  `GET /api/lectures/{id}/related-meditations`, `/related-lectures`). These do
  **not** take `select` / `populate` — `populate` is meaningless on an
  already-flattened card and the field set is fixed. Publish the exact response
  schema instead. If a shaped response needs trimming, add a **bounded** `select`
  over an explicit field allowlist, like `GET /api/meditations/{id}/songs` — not
  a raw passthrough.

## Bound internal candidate-pool reads (the virtual-field N+1)

The response shape is only half the story. **Any internal `depth ≥ 1` read that
fetches a pool of rows to shape must carry a bounded `select`.** A read without
one runs *every* field's `afterRead` on *every* row — and the expensive ones
(virtual/computed fields, native `join` fields) each fire a per-row sub-query.
That turns one shaped endpoint into an N+1 that scales linearly with the pool
size. This was #541: `related-meditations` / `related-lectures` / `for-audience`
paid ~16 extra queries per candidate (meditations `tagAssignments`, lectures
`clips`) until each internal read was given a `select`.

The client REST surface is already protected — `validateClientQueryParamsHook`
rejects any API-client read without a `select` (see `.claude/rules/api-clients.md`).
The gap is **server-side reads that forward `asTrustedReq(req)`**, which bypass
that gate. Those are exactly the reads you must bound by hand.

Rules of thumb:

- **Co-locate the select with the shape helper.** Export a `FOO_CARD_SELECT`
  next to the function that reads those fields (`MEDITATION_CARD_SELECT` in
  `meditationShape.ts`, `LECTURE_FEED_SELECT` in `lectureShape.ts`), so the two
  stay in sync when the shape changes. The endpoint spreads it and adds any
  extra fields its own ranking/sort needs (`createdAt`, `subtleSystemNodes`, …).
- **Co-select a virtual field's dependency.** An include-mode `select` strips
  unselected siblings *before* any `afterRead` runs, so a computed field reads
  `null` unless you also select what its hook reads: `durationMinutes` needs
  `duration`; `title` needs `subtleSystemNodeWeights`; `url` needs `filename`
  (`Meditations/endpoints/songs.ts`). Miss one and the card is silently dropped,
  not just slow.
- **`select` can't narrow a *relationship's* fields** — for a relationship field
  it's boolean-only (`fullLecture: true`, not `fullLecture: { … }`). To skip an
  expensive field on a **populated** relationship (e.g. a clip's nested
  `fullLecture` parent), exclude it on the *target* collection with
  `defaultPopulate: { expensiveField: false }` — `Lectures.defaultPopulate:
  { clips: false }`, mirroring `Meditations.defaultPopulate:
  { tagAssignments: false }`. `defaultPopulate` only affects relationship
  hydration; direct reads and the admin edit view are unaffected.
- **Regression-test it flat, not fast.** Spy on `payload.find` and assert the
  per-row sub-query count stays at zero as the pool doubles (see the #541 cases
  in `tests/int/lecture-related-meditations.int.spec.ts`); for native joins,
  assert the field is absent from the populated docs
  (`tests/int/lectures-for-audience.int.spec.ts`). A timing assertion is flaky;
  a count assertion pins the behaviour.

## When to use a Payload endpoint vs a Next.js route

| Use case                                                                                                                                                                                                  | Where                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| URL belongs under a collection (e.g. `/api/frames/by-narrator/:narratorId`); operates on a single collection's docs; want automatic Payload auth/access integration                                       | `src/collections/<Name>/endpoints/*.ts` (this file)                                    |
| Webhooks, health checks, OpenAPI spec generation, seed triggers, or operations spanning multiple collections; need raw request body (HMAC verification); need Next.js streaming / `NextResponse.redirect` | `src/app/(payload)/api/**/route.ts` (see `.claude/rules/routes.md`) |

## Eliminating client-side race conditions

`usePayloadAPI` captures `initialParams` on first render via `useState`,
which makes chained client-side fetches (with `setParams`) race-prone.
Custom endpoints solve this cleanly: do the data join server-side, then
call the endpoint from a single `usePayloadAPI`.

```typescript
// ❌ Race-condition prone — two hooks chained via useEffect + setParams
const [{ data: parent }] = usePayloadAPI(`/api/parents/${id}`)
const [{ data: children }, { setParams }] = usePayloadAPI('/api/children')
useEffect(() => {
  if (parent?.type) setParams({ where: { type: { equals: parent.type } } })
}, [parent?.type])

// ✅ One endpoint, one fetch, no races
const [{ data, isLoading, isError }] = usePayloadAPI(
  narratorId ? `/api/frames/by-narrator/${narratorId}` : '',
)
```

Use a custom endpoint when you find yourself:

- Joining data from multiple collections in a client component
- Filtering on a related document's fields
- Avoiding N+1 queries on the client
- Adding `useEffect` chains to coordinate fetches
