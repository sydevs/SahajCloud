---
paths:
  - src/collections/*/endpoints/**/*.ts
  - src/endpoints/**/*.ts
---

# Custom Endpoint Rules

Rules for custom PayloadCMS collection endpoint handlers.

## File structure

Endpoints sit beside their collection, one handler per file:

```
src/collections/Frames/
├── Frames.ts                     # Collection definition
└── endpoints/
    └── byNarrator.ts             # Frames endpoint (exports framesByNarrator)
```

## Handler pattern

Each file exports one `Endpoint` object from `payload`:

```typescript
import type { Endpoint } from 'payload'

export const myEndpoint: Endpoint = {
  path: '/my-path/:param',
  method: 'get',
  handler: async (req) => {
    const param = req.routeParams?.param as string
    if (!param) {
      return Response.json({ error: 'Param required' }, { status: 400 })
    }

    const result = await req.payload.find({ collection: 'my-collection', ... })

    return Response.json(result)
  },
}
```

## Root-level endpoints (the exception)

Almost every endpoint belongs to a collection and lives in its `endpoints/` folder. A resource that belongs to **no** collection goes in `src/endpoints/` and registers on the config root instead:

```typescript
// src/payload.config.ts
import { atlasSeo } from './endpoints/atlas/seo'
import { atlasSitemap } from './endpoints/atlas/sitemap'

endpoints: [atlasSeo, atlasSitemap],
```

The bar is high. Two endpoints clear it: `GET /api/atlas/seo` takes a **route** that may name a region or an event, so no single collection owns it. `GET /api/atlas/sitemap` spans regions and events for the same reason, and its real unit is the **client's ownership** — a `clients` fact, not either collection's.

A third case, `POST /api/contact-admin`, once justified itself as "stored nowhere, owned by nothing" — true only because it chose not to store anything. Once the feature needed spam screening, it needed a collection, so the endpoint was deleted and the intake became a plain create on `user-messages` (#632), recovering the origin checks and usage tracking it had skipped. Before reaching for a root endpoint, ask whether the resource is genuinely ownerless, or merely unpersisted. Prefer a collection endpoint whenever a collection plausibly owns the resource.

**The folder path mirrors the URL.** A single-file endpoint sits at `src/endpoints/<name>.ts`. One that needs supporting modules gets a folder whose path *is* the URL, with the handler in `index.ts`:

```
src/endpoints/atlas/seo/        →  GET /api/atlas/seo
├── index.ts                       the Endpoint (exports `atlasSeo`)
├── atlasRoute.ts                  route parsing
├── jsonLd.ts                      JSON-LD builders + escaping
└── seoDocument.ts                 the response shaper
```

Those supporting modules are single-owner code and belong here, not in `src/lib/` — `tests/unit/lib-boundary.spec.ts` fails a lib module with one consumer outside lib. `responseTypes.ts` stays at `src/endpoints/`: both Atlas endpoints share it, and client repos sync it from a stable raw GitHub URL, so moving it would break every one of them.

**A root endpoint loses the usage plugin's `beforeOperation` hooks**, since those only run on collection operations:

- **Origin enforcement.** Call `assertClientOriginAllowed(req)` from `@/plugins/usage` directly, right after `requireActiveClient`, and map the thrown `APIError` to a response. Don't rely on an incidental collection read to trigger it — `clients` itself is excluded from the plugin, so reading the caller's own record wouldn't fire it either.
- **Usage tracking.** The request is not counted against the client's quota. Cloudflare's edge rate limiting still fronts the route. A root endpoint needing per-client accounting must do it itself.

Everything else still applies: `requireActiveClient` as the first statement, and an OpenAPI entry — see the root-path note in `docs/rules/openapi.md`, since project visibility cannot be derived from a path segment naming no collection.

## Registration

Import the handler relatively from the collection's `endpoints/` folder and register it there:

```typescript
import { myEndpoint } from './endpoints/myEndpoint'

export const MyCollection: CollectionConfig = {
  slug: 'my-collection',
  endpoints: [myEndpoint],
}
```

## Key points

- One handler per file. Import it relatively in the collection definition — there is no shared endpoints barrel.
- Use `req.routeParams` for URL parameters and `req.query` for query strings. Use `req.payload` for the database, not a separate import.

## Requirements: auth, OpenAPI, select/populate

Every new public (client-facing) collection endpoint needs all three. A PR that adds one without them is incomplete.

### 1. Authenticate the caller

Public endpoints serve **published API clients**. Gate every handler with `requireActiveClient` (from `@/lib/endpoints`) as its first statement, and short-circuit on a non-null return:

```typescript
import { requireActiveClient } from '@/lib/endpoints'

handler: async (req) => {
  const denied = requireActiveClient(req)
  if (denied) return denied
  // ...
}
```

`requireActiveClient` returns `403` unless the caller is a **published** `clients` user. Don't hand-roll the check — it is the single source for the guard's shape and message. An endpoint that must skip it (internal or admin-only) needs a comment saying why.

### 2. Register it in the OpenAPI shim

`payload-oapi` does not auto-generate paths for custom collection endpoints, so a new one stays invisible in `/api/docs` until hand-authored. For every endpoint:

- Add the path to `CUSTOM_ENDPOINT_PATHS` in `src/plugins/openapi/customEndpoints.ts` (keep the `/api/` prefix — project visibility keys off it), plus any response schema in `CUSTOM_ENDPOINT_SCHEMAS`.
- Document every path and query param, and match the response schema to the handler's return type exactly.
- Add the path and schema to the guard in `tests/unit/openapi-custom-endpoints.spec.ts`.
- Add a row to the custom-endpoint table in `docs/rules/openapi.md`.

See `docs/rules/openapi.md` for the full shim contract.

### 3. select / populate — match the output model

**Passthrough endpoints** forward the query into a Payload read and return the docs (`GET /api/events/geojson`). These **must** accept and document `select`, `populate`, and `depth` — reuse `selectParameter`, `populateParameter`, and `depthParameter` from `clientReadParametersDocs.ts`, and enforce the client read contract: `select` required, and `populate` required when `depth > 1`.

**A passthrough may still narrow the caller's `where`.** "Passthrough" does not mean the caller's `where` goes in untouched — a feed endpoint may AND its own predicate on top (geojson excludes finished events via `notFinishedWhere`). Two rules apply:

- Filter inside the read, never after it. ANDing onto `where` keeps `totalDocs` and pagination consistent with the returned docs. Dropping rows afterward corrupts both and breaks a paginating client.
- Decide, and document, whether an explicit `where` wins. A **feed** endpoint filters unconditionally, with no opt-out (`GET /api/events/geojson`) — say so in its OpenAPI `description`. A **collection list read** (a `beforeOperation` hook on `find`/`count`) filters by default but yields to a caller who names the filtered field (`excludeFinishedEvents` skips itself when `where` references `schedule.lastDate`).

Two Payload behaviors to know before writing such a hook:

- **`find` and `findByID` both arrive as `operation: 'read'`.** Guarding on `'find'` matches nothing. Distinguish the single-doc read by the `id` arg: `if ('id' in args) return args`.
- **Exempt an endpoint's own forwarded reads.** A handler using `asTrustedReq` is doing its own lookup and needs the true state — `POST /api/events/{id}/register` must tell "no such event" (404) from "this event has ended" (409). Check `isTrustedReq(req)` (from `@/plugins/usage/hooks`) and return early. Result-shaping hooks honour that flag. Security gates (`validateClientOriginHook`) deliberately don't.

**Shaped endpoints** return a fixed, hand-built structure (`GET /api/lectures/{id}/related-meditations`, `/related-lectures`). These take no `select` or `populate` — the field set is fixed — and publish the exact response schema instead. To trim a shaped response, add a **bounded** `select` over an explicit field allowlist (`GET /api/meditations/{id}/songs`), not a raw passthrough.

## Bound internal candidate-pool reads (the virtual-field N+1)

**Any internal `depth ≥ 1` read that fetches a pool of rows to shape must carry a bounded `select`.** A read without one runs every field's `afterRead` on every row, and an expensive one — a virtual/computed field, a native `join` — fires a per-row sub-query. One shaped endpoint then becomes an N+1 that scales with the pool size. This was #541: `related-meditations`, `related-lectures`, and `for-audience` each paid roughly 16 extra queries per candidate until their internal reads carried a `select`.

The client REST surface is already protected: `validateClientQueryParamsHook` rejects any API-client read with no `select` (see `docs/rules/api-clients.md`). The gap is **server-side reads that forward `asTrustedReq(req)`**, which bypass that gate — bound those by hand.

- **Co-locate the select with the shape helper.** Export a `FOO_CARD_SELECT` next to the function reading those fields, so the two stay in sync. The endpoint spreads it and adds any extra field its own sort or rank needs.
- **Co-select a virtual field's dependency.** An include-mode `select` strips unselected siblings before `afterRead` runs, so a computed field reads `null` unless its own dependency is also selected — miss one and the card silently drops, rather than just slowing down.
- **`select` cannot narrow a relationship's fields** — it is boolean-only there. To skip an expensive field on a **populated** relationship, exclude it on the target collection's `defaultPopulate` instead (`Lectures.defaultPopulate: { clips: false }`). `defaultPopulate` only affects relationship hydration. Direct reads and the admin edit view are unaffected.
- **Regression-test it flat, not fast.** Spy on `payload.find` and assert the per-row sub-query count stays at zero as the pool doubles. For native joins, assert the field is absent from populated docs. A timing assertion is flaky. A count assertion pins the behavior.

## Payload endpoint vs Next.js route

| Use case | Where |
| --- | --- |
| URL belongs under a collection, operates on that collection's docs, wants automatic Payload auth/access | `src/collections/<Name>/endpoints/*.ts` (this file) |
| A webhook, health check, OpenAPI generation, seed trigger, multi-collection operation, raw request body, or Next.js streaming | `src/app/(payload)/api/**/route.ts` (`docs/rules/routes.md`) |

## Eliminating client-side race conditions

`usePayloadAPI` captures `initialParams` on first render via `useState`, so a chained client-side fetch using `setParams` is race-prone. A custom endpoint fixes this: join the data server-side, then call the endpoint from one `usePayloadAPI`.

```typescript
// ❌ Race-condition prone — two hooks chained via useEffect + setParams
const [{ data: parent }] = usePayloadAPI(`/api/parents/${id}`)
const [{ data: children }, { setParams }] = usePayloadAPI('/api/children')
useEffect(() => {
  if (parent?.type) setParams({ where: { type: { equals: parent.type } } })
}, [parent?.type])

// ✅ One endpoint, one fetch, no race
const [{ data, isLoading, isError }] = usePayloadAPI(
  narratorId ? `/api/frames/by-narrator/${narratorId}` : '',
)
```

Reach for a custom endpoint when you join data from several collections in a client component, filter on a related document's fields, or chain `useEffect`s to coordinate fetches.
