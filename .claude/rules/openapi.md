---
paths:
  - src/plugins/openapi/**/*.ts
  - src/app/(payload)/api/openapi.json/**/*.ts
---

# OpenAPI / Scalar API Docs

Interactive REST API docs combine [`payload-oapi`](https://github.com/janbuchar/payload-oapi)
for spec generation with a custom Scalar plugin for the UI.

## Module layout

```
src/plugins/openapi/
├── index.ts                       # barrel export
├── scalarPlugin.ts                # custom Scalar plugin with branding + project selector
├── specFilter.ts                  # filtering + post-merge parameter injection + `rootEndpointPathsFrom`
├── customEndpoints.ts             # hand-authored shim for custom collection endpoints
├── rateLimitingDocs.ts            # X-User-ID header parameter definition
└── clientReadParametersDocs.ts    # select / populate / depth / limit / page param definitions
```

## Endpoints

| Endpoint                              | Description                                    |
| ------------------------------------- | ---------------------------------------------- |
| `/api/openapi.json`                   | Filtered OpenAPI 3.1 spec (hides internal ops) |
| `/api/openapi.json?project=<project>` | Project-filtered spec                          |
| `/api/openapi-raw.json`               | Raw spec — everything visible                  |
| `/api/docs`                           | Scalar UI with We Meditate branding            |
| `/api/docs?project=<project>`         | Project-filtered Scalar UI                     |

## Plugin registration (`src/payload.config.ts`)

```typescript
import { openapi } from 'payload-oapi'
import { scalarPlugin } from '@/plugins/openapi'

plugins: [
  openapi({
    openapiVersion: '3.1',
    specEndpoint: '/openapi-raw.json',
    metadata: {
      title: 'Sahaj Cloud API',
      version: '1.0.0',
      description: 'REST API for Sahaj Cloud CMS',
    },
  }),
  scalarPlugin({
    specEndpoint: '/openapi.json',
    docsUrl: '/docs',
  }),
]
```

## Scalar plugin (`scalarPlugin.ts`)

- **We Meditate coral theme** (`#F07855`) — light/dark mode support.
- **Project selector** dropdown filters visible endpoints by project.
- **Dynamic logo** swaps based on selected project (sahaj-cloud, wemeditate-web,
  wemeditate-app, sahaj-atlas).
- **HTTP client filtering** — JS, Node, Dart, Python only.
- **Flash prevention** — critical CSS + blocking dark-mode detection inline
  in the head.

## Spec filter (`specFilter.ts`)

```typescript
import {
  filterSpec,
  ALWAYS_HIDDEN_COLLECTIONS,
  EXCLUDED_OPERATIONS,
  ALLOW_POST_FOR,
  type FilterOptions,
  type OpenAPISpec,
} from '@/plugins/openapi/specFilter'

filterSpec(rawSpec) // union of all client collections
filterSpec(rawSpec, { project: 'wemeditate-web' }) // single project

// Root endpoints (`config.endpoints`) belong to no collection, so they must be
// declared or the project tiers hide them — see the root-path note below.
filterSpec(rawSpec, {
  project,
  rootEndpointPaths: rootEndpointPathsFrom(payload.config.endpoints),
})
```

**Always-hidden collections** (system collections, never visible):

- access: `managers`, `clients`
- system: `images`, `files`
- payload internal: `payload-kv`, `payload-jobs`, `payload-locked-documents`,
  `payload-preferences`, `payload-migrations`, `payload-job-stats`

**Excluded operations** (HTTP methods always hidden):

- `DELETE`, `PATCH`

**`ALLOW_POST_FOR`** — collections that may accept POST in the public spec:

- `form-submissions`

**Project-based filtering** — when a project is specified, only its
collections are shown; otherwise the union of all client-role collections
is shown. Uses `getProjectCollections()` and `getRoleOptions()` from
`@/plugins/access` (not duplicate helpers).

## Route handler (`src/app/(payload)/api/openapi.json/route.ts`)

1. Parse `?project=` query param.
2. Validate project via `isValidProject()` from `@/plugins/access`.
3. Generate spec via `payload-oapi` internals (avoids self-referential fetch).
4. Merge in `customEndpoints.ts` entries.
5. Apply `filterSpec()` with project filtering, passing
   `rootEndpointPaths: rootEndpointPathsFrom(payload.config.endpoints)`.
6. Return with caching headers (Cloudflare Cache API in production).

## Custom-endpoint shim (`customEndpoints.ts`)

`payload-oapi` v0.2.5 doesn't auto-generate paths for Payload collection
endpoints (those wired via a collection's `endpoints` array under
`src/collections/<Name>/endpoints/`). We hand-author entries here and merge them into the
raw spec inside the route handler **between** `generateV31Spec` and
`filterSpec`, so project-based visibility applies automatically by
collection slug.

| Custom path                                  | Handler                                | Response schema                                          |
| -------------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `GET /api/frames/by-narrator/{narratorId}`   | `src/collections/Frames/endpoints/byNarrator.ts`    | `#/components/schemas/Frames`                            |
| `GET /api/audiences/for-user`                | `src/collections/Audiences/endpoints/forUser.ts`    | `#/components/schemas/AudienceIdList`                    |
| `GET /api/lectures/for-audience`             | `src/collections/Lectures/endpoints/forAudience.ts` | `#/components/schemas/LecturePlayerData` (hand-authored) |
| `GET /api/app-cards/for-audience`            | `src/collections/AppCards/endpoints/forAudience.ts` | `#/components/schemas/AppCards`                          |
| `GET /api/meditations/{id}/related-lectures` | `src/collections/Meditations/endpoints/lectures.ts`  | `#/components/schemas/LecturePlayerData` (hand-authored) |
| `GET /api/lectures/{id}/related-meditations` | `src/collections/Lectures/endpoints/relatedMeditations.ts` | `#/components/schemas/MeditationCardData` (hand-authored) |
| `GET /api/events/geojson`                    | `src/collections/Events/endpoints/geojson.ts`       | `#/components/schemas/EventFeatureCollection` (hand-authored) |
| `POST /api/events/{id}/register`             | `src/collections/Events/endpoints/registerForEvent.ts` | `#/components/schemas/EventRegistrationResponse` (hand-authored) |
| `POST /api/contact-admin`                    | `src/endpoints/contactAdmin.ts` (root endpoint)     | `#/components/schemas/ContactAdminResponse` (hand-authored) |
| `POST /api/clients/report`                   | `src/collections/Clients/endpoints/report.ts`       | `#/components/schemas/EmbedReportResponse` (hand-authored) |

### A custom path on an always-hidden collection

`clients` is in `ALWAYS_HIDDEN_COLLECTIONS`, so Tier 1 would mark
`POST /api/clients/report` `x-internal` and no client app could find the endpoint
it is expected to call. `ALWAYS_VISIBLE_CUSTOM_PATHS` in `specFilter.ts` exempts
that one **exact** path before any tier runs.

The hiding rule is about a collection's *CRUD* surface — `clients` documents must
stay unadvertised — so the exemption is a path allowlist, not a per-collection
opt-out: widening the access collections' public surface stays one auditable line.
`tests/unit/openapi-custom-endpoints.spec.ts` pins both halves (the report path
visible in every project; `/api/clients` and `/api/clients/{id}` still hidden).

### Root-level endpoints have no collection to key visibility off

`filterSpec` derives project visibility from the first path segment
(`getCollectionFromPath`). A **root** endpoint — registered on `config.endpoints`
rather than a collection's — has a segment that looks like a slug but names no
collection, so every project tier reads it as "not in this project" and marks it
`x-internal`, hiding it from `/api/docs` everywhere.

The route handler closes that gap by passing `filterSpec` a `rootEndpointPaths`
option, built by `rootEndpointPathsFrom(payload.config.endpoints)` — those paths
are exempted from the tiers and stay visible in every project's spec, which is
right since a root endpoint is project-agnostic by nature (`/api/contact-admin`
is shared by Atlas and WeMeditateWeb).

**Derived from the live config, so there's no second list to keep in sync** —
registering the endpoint in `payload.config.ts` is the only edit needed. The
option defaults to `[]`, so a caller that omits it gets the old hiding behaviour;
`tests/unit/openapi-custom-endpoints.spec.ts` pins both directions (visible in
all three projects when declared, `x-internal` when not).

`filterSpec` marks POST operations `x-internal` (hidden from `/docs`) only for
the **auto-generated base-collection create** (`POST /api/{collection}`) unless
the collection is in `ALLOW_POST_FOR`; hand-authored custom POST subpaths like
`/api/events/{id}/register` stay visible (`isBaseCollectionPath` guards the gate).
`tests/unit/openapi-custom-endpoints.spec.ts` is the regression guard for the
Atlas paths + this POST visibility rule.

The audience query params on `/api/audiences/for-user` are hand-authored
in `customEndpoints.ts` as `audienceQueryParameters` — six required
params: four progress params (`pathProgress`, `meditationsPerWeek`,
`totalMeditationsViewed`, `totalLecturesViewed`) plus `country` and
`timezone`. The three data endpoints
(`/lectures/for-audience`, `/app-cards/for-audience`,
`/meditations/{id}/related-lectures`) take a single pre-resolved
`audiences` ID list (mirrors `audiencesQueryParamSchema` in
`src/lib/audiences/audiencesQueryParam.ts`) instead of the rule-data
params (#340).

When `payload-oapi` ships native custom-endpoint support, both the
shim module and the merge block in the route handler can be deleted in
a single follow-up.

## Known limitations (payload-oapi v0.2.5)

- **API-key header format**: plugin uses OAuth2 password flow rather than
  the actual `Authorization: clients API-Key <key>` shape we use in
  production.
- **`/api/health` and webhook routes** — Next.js app-router routes
  (`/api/health`, `/api/webhooks/...`, `/api/seed/:script`) are
  intentionally omitted. They're infrastructure, not part of the public
  client API.
- **`select` / `populate` / `depth` / `limit` / `page` query params** are
  not surfaced in the generated spec for auto-generated CRUD endpoints.
  `injectClientReadParameters()` in `specFilter.ts` patches this — it
  registers reusable definitions from `clientReadParametersDocs.ts` under
  `components.parameters` and adds `$ref`s to every collection list +
  findByID GET operation (skipping `/api/globals/*` and custom subpath
  endpoints, which have their own param surface). Added in #419 after
  the original PR (#294) shipped without REST-format documentation
  anywhere clients could discover the bracket-notation contract.

Review payload-oapi quarterly for native support of these.

## Testing

Current guards (both **unit** — no Payload bootstrap):

- `tests/unit/openapi-custom-endpoints.spec.ts` — the hand-authored custom paths
  + schemas stay registered (Atlas events, `/lectures/{id}/related-meditations`,
  `/contact-admin`), shaped endpoints expose no `select`/`populate`, `filterSpec`
  POST visibility (the auto-generated base-collection `POST /api/{collection}` is
  hidden unless the collection is in `ALLOW_POST_FOR`; hand-authored custom POST
  subpaths stay visible), and the root-path exemption in both directions —
  declared → visible in all three projects, undeclared → `x-internal`.

  Its `op()` helper asserts the operation **exists** before reading `x-internal`.
  Without that, a path missing from the spec entirely reads as `undefined` →
  falsy → "visible", and every visibility assertion passes vacuously.
- `tests/unit/openapi-endpoint-auth.spec.ts` — the `DOCS_PASSWORD` basic-auth gate
  on `/openapi-raw.json` (passes through when unset, 401 on a wrong password).

The earlier `tests/int/api-explorer.int.spec.ts` — which exercised spec generation,
project filtering, `ALWAYS_HIDDEN_COLLECTIONS`/DELETE-PATCH filtering, the Scalar UI
responses, and the audience query-param coverage — was **removed** in the #434
test-suite audit as it only covered Payload/plugin built-ins (see `tests/COVERAGE.md`).
