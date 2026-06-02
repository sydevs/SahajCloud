---
paths:
  - src/lib/openapi/**/*.ts
  - src/app/(payload)/api/openapi.json/**/*.ts
---

# OpenAPI / Scalar API Docs

Interactive REST API docs combine [`payload-oapi`](https://github.com/janbuchar/payload-oapi)
for spec generation with a custom Scalar plugin for the UI.

## Module layout

```
src/lib/openapi/
├── index.ts                       # barrel export
├── scalarPlugin.ts                # custom Scalar plugin with branding + project selector
├── specFilter.ts                  # filtering + post-merge parameter injection
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
import { scalarPlugin } from '@/lib/openapi'

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
} from '@/lib/openapi/specFilter'

filterSpec(rawSpec) // union of all client collections
filterSpec(rawSpec, { project: 'wemeditate-web' }) // single project
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
`@/lib/access` (not duplicate helpers).

## Route handler (`src/app/(payload)/api/openapi.json/route.ts`)

1. Parse `?project=` query param.
2. Validate project via `isValidProject()` from `@/lib/access`.
3. Generate spec via `payload-oapi` internals (avoids self-referential fetch).
4. Merge in `customEndpoints.ts` entries.
5. Apply `filterSpec()` with project filtering.
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

The audience query params on `/api/audiences/for-user` are hand-authored
in `customEndpoints.ts` as `audienceQueryParameters` — six required
params: four progress params (`pathProgress`, `meditationsPerWeek`,
`totalMeditationsViewed`, `totalLecturesViewed`) plus `country` and
`timezone`. The three data endpoints
(`/lectures/for-audience`, `/app-cards/for-audience`,
`/meditations/{id}/related-lectures`) take a single pre-resolved
`audiences` ID list (mirrors `audiencesQueryParamSchema` in
`src/lib/audiences/audiencesQueryParam.ts`) instead of the rule-data
params (#340). The "audience query params on /api/audiences/for-user
expose all six required params" assertion in
`tests/int/api-explorer.int.spec.ts` is the regression guard (#345).

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

`tests/int/api-explorer.int.spec.ts` covers:

- Spec generation and validation
- Project-based filtering for each project
- `ALWAYS_HIDDEN_COLLECTIONS` exclusion
- Operation filtering (DELETE, PATCH hidden)
- Scalar UI endpoint responses
- Audience query-param coverage on `/api/audiences/for-user` (all six params required)
- Pre-resolved `audiences` ID-list shape on the three data endpoints (#340)
