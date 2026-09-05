---
paths:
  - src/plugins/openapi/**/*.ts
  - src/app/(payload)/api/openapi.json/**/*.ts
---

# OpenAPI / Scalar API Docs

Interactive REST API docs combine [`payload-oapi`](https://github.com/janbuchar/payload-oapi) for spec generation with a custom Scalar plugin for the UI.

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

| Endpoint | Description |
| --- | --- |
| `/api/openapi.json` | Filtered OpenAPI 3.1 spec (hides internal ops) |
| `/api/openapi.json?project=<project>` | Project-filtered spec |
| `/api/openapi-raw.json` | Raw spec — everything visible |
| `/api/docs` | Scalar UI, We Meditate branding |
| `/api/docs?project=<project>` | Project-filtered Scalar UI |

## Plugin registration (`src/payload.config.ts`)

```typescript
import { openapi } from 'payload-oapi'
import { scalarPlugin } from '@/plugins/openapi'

plugins: [
  openapi({
    openapiVersion: '3.1',
    specEndpoint: '/openapi-raw.json',
    metadata: { title: 'Sahaj Cloud API', version: '1.0.0', description: 'REST API for Sahaj Cloud CMS' },
  }),
  scalarPlugin({ specEndpoint: '/openapi.json', docsUrl: '/docs' }),
]
```

## Scalar plugin (`scalarPlugin.ts`)

- We Meditate coral theme (`#F07855`), with light and dark mode.
- A project-selector dropdown filters visible endpoints by project.
- The logo swaps per selected project (sahaj-cloud, wemeditate-web, wemeditate-app, sahaj-atlas).
- HTTP client filtering shows only JS, Node, Dart, and Python.
- Critical CSS and blocking dark-mode detection sit inline in the head, to stop a flash on load.

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

// Root endpoints (`config.endpoints`) belong to no collection, so declare them
// explicitly or the project tiers hide them — see the root-path note below.
filterSpec(rawSpec, {
  project,
  rootEndpointPaths: rootEndpointPathsFrom(payload.config.endpoints),
})
```

**Always-hidden collections** (system collections, never visible): the access collections `managers` and `clients`, the system collections `images` and `files`, and every Payload internal collection (`payload-kv`, `payload-jobs`, `payload-locked-documents`, `payload-preferences`, `payload-migrations`, `payload-job-stats`).

**Excluded operations**: `DELETE` and `PATCH` are always hidden.

**`ALLOW_POST_FOR`** lists the collections that may accept POST in the public spec: `form-submissions`, and the two public intakes `event-submissions` and `user-messages`.

**`ALLOW_POST_FOR` is necessary but not sufficient.** Two independent tiers can each mark a POST `x-internal`: clearing the create-specific one leaves the second untouched, since **any path whose collection is in no project is hidden**. Both public intakes sit in no project on purpose — that is what stops project membership granting implicit read to a project's roles — so both POSTs stay `x-internal` despite this list. Clients discover them through the generated types, not `/api/docs`.

To document one of them, change project membership plus `RESTRICTED_COLLECTIONS` instead — not another entry here. `tests/unit/openapi-custom-endpoints.spec.ts` pins both directions.

**Project-based filtering.** With a project specified, only its collections show. Otherwise the union of all client-role collections shows. This uses `getProjectCollections()` and `getRoleOptions()` from `@/plugins/access` — not duplicate helpers.

## Route handler (`src/app/(payload)/api/openapi.json/route.ts`)

1. Parse the `?project=` query param.
2. Validate the project via `isValidProject()` from `@/plugins/access`.
3. Generate the spec via `payload-oapi` internals (this avoids a self-referential fetch).
4. Merge in the `customEndpoints.ts` entries.
5. Apply `filterSpec()` with project filtering, passing `rootEndpointPaths: rootEndpointPathsFrom(payload.config.endpoints)`.
6. Return the spec with caching headers (the Cloudflare Cache API, in production).

## Custom-endpoint shim (`customEndpoints.ts`)

`payload-oapi` v0.2.5 does not auto-generate paths for endpoints wired through a collection's `endpoints` array. This shim hand-authors those entries and merges them into the raw spec **between** `generateV31Spec` and `filterSpec`, so project-based visibility still applies by collection slug.

| Custom path | Handler | Response schema |
| --- | --- | --- |
| `GET /api/frames/by-narrator/{narratorId}` | `Frames/endpoints/byNarrator.ts` | `#/components/schemas/Frames` |
| `GET /api/audiences/for-user` | `Audiences/endpoints/forUser.ts` | `#/components/schemas/AudienceIdList` |
| `GET /api/lectures/for-audience` | `Lectures/endpoints/forAudience.ts` | `#/components/schemas/LecturePlayerData` (hand-authored) |
| `GET /api/app-cards/for-audience` | `AppCards/endpoints/forAudience.ts` | `#/components/schemas/AppCards` |
| `GET /api/meditations/{id}/related-lectures` | `Meditations/endpoints/lectures.ts` | `#/components/schemas/LecturePlayerData` (hand-authored) |
| `GET /api/lectures/{id}/related-meditations` | `Lectures/endpoints/relatedMeditations.ts` | `#/components/schemas/MeditationCardData` (hand-authored) |
| `GET /api/events/geojson` | `Events/endpoints/geojson.ts` | `#/components/schemas/EventFeatureCollection` (hand-authored) |
| `POST /api/events/{id}/register` | `Events/endpoints/registerForEvent.ts` | `#/components/schemas/EventRegistrationResponse` (hand-authored) |
| `GET /api/atlas/seo` | `src/endpoints/atlas/seo/` (root endpoint) | `#/components/schemas/AtlasSeoResponse` (hand-authored) |
| `GET /api/atlas/sitemap` | `src/endpoints/atlas/sitemap/` (root endpoint) | `#/components/schemas/AtlasSitemapResponse` (hand-authored) |
| `POST /api/clients/report` | `Clients/endpoints/report.ts` | `#/components/schemas/ClientEmbedReportResponse` (hand-authored) — **`x-internal`**, see below |

`POST /api/clients/report` is the one custom endpoint deliberately hidden from `/api/docs`: `clients` sits in `ALWAYS_HIDDEN_COLLECTIONS` and belongs to no project, so `filterSpec` marks it `x-internal` under every project tier. That is intended — it is the first-party Atlas widget's telemetry channel, not a third-party integration surface, and advertising it only invites forged reports. It still appears in `/api/openapi-raw.json`, and a pinned test case in `tests/unit/openapi-custom-endpoints.spec.ts` stops a future filter change from publishing it by accident.

### Root-level endpoints have no collection to key visibility off

`filterSpec` derives project visibility from a path's first segment (`getCollectionFromPath`). A **root** endpoint (registered on `config.endpoints`, not a collection) has a segment that looks like a slug but names no collection, so every project tier reads it as "not in this project" and hides it.

The route handler closes the gap with a `rootEndpointPaths` option, built by `rootEndpointPathsFrom(payload.config.endpoints)`: those paths stay visible in every project's spec, since a root endpoint is project-agnostic by nature (`/api/atlas/seo` answers for any client app's route).

**Derived from the live config, so there is no second list to keep in sync** — registering the endpoint in `payload.config.ts` is the only edit needed. The option defaults to `[]`, so an omitted call keeps the old hiding behavior. `tests/unit/openapi-custom-endpoints.spec.ts` pins both directions.

`filterSpec` marks a POST `x-internal` only for the **auto-generated base-collection create** (`POST /api/{collection}`), unless the collection is in `ALLOW_POST_FOR`. A hand-authored custom POST subpath, such as `/api/events/{id}/register`, stays visible (`isBaseCollectionPath` guards this). The same spec file is the regression guard for both the Atlas paths and this POST rule.

`/api/audiences/for-user` hand-authors six required query params in `customEndpoints.ts`: four progress fields (`pathProgress`, `meditationsPerWeek`, `totalMeditationsViewed`, `totalLecturesViewed`) plus `country` and `timezone`. The three data endpoints (`/lectures/for-audience`, `/app-cards/for-audience`, `/meditations/{id}/related-lectures`) instead take one pre-resolved `audiences` ID list, mirroring `audiencesQueryParamSchema` in `src/lib/audiences/audiencesQueryParam.ts` (#340).

When `payload-oapi` ships native custom-endpoint support, delete the shim module and the merge block together.

## Known limitations (payload-oapi v0.2.5)

- **API-key header format** — the plugin models OAuth2 password flow, not the `Authorization: clients API-Key <key>` shape this app uses in production.
- **`/api/health` and webhook routes** are intentionally omitted — infrastructure, not part of the public client API.
- **`select` / `populate` / `depth` / `limit` / `page`** are missing from the generated spec for auto-generated CRUD endpoints. `injectClientReadParameters()` in `specFilter.ts` fixes this: it registers definitions from `clientReadParametersDocs.ts` under `components.parameters` and `$ref`s them onto every collection list and findByID GET, skipping globals and custom subpaths (which have their own params). Added in #419, after #294 shipped with no documented bracket-notation contract.

Review payload-oapi quarterly for native support of these.

## Testing

Two guards, both **unit** (no Payload boot):

- `tests/unit/openapi-custom-endpoints.spec.ts` — the hand-authored custom paths and schemas stay registered, shaped endpoints expose no `select`/`populate`, `filterSpec` POST visibility, and the root-path exemption in both directions. Its `op()` helper asserts the operation **exists** before reading `x-internal` — without that, a path missing from the spec reads as `undefined` → falsy → "visible", and every visibility assertion passes vacuously.
- `tests/unit/openapi-endpoint-auth.spec.ts` — the `DOCS_PASSWORD` basic-auth gate on `/openapi-raw.json` (passes through unset, 401 on a wrong password).

`tests/int/api-explorer.int.spec.ts` was **deleted** in the #434 audit — it only covered Payload/plugin built-ins (see `tests/COVERAGE.md`).
