# OpenAPI & Scalar API Documentation

The application provides interactive REST API documentation using custom plugins built on top of [payload-oapi](https://github.com/janbuchar/payload-oapi) for spec generation and [Scalar](https://github.com/scalar/scalar) for the UI.

## Module Structure

**Location**: `src/lib/openapi/`

```
src/lib/openapi/
├── index.ts              # Barrel export
├── scalarPlugin.ts       # Custom Scalar plugin with branding
└── specFilter.ts         # Spec filtering and project-based collection filtering
```

## Key Components

### scalarPlugin.ts

Custom PayloadCMS plugin providing branded API documentation:

- **We Meditate coral theme** (`#F07855`) with light/dark mode support
- **Project selector** dropdown to filter visible endpoints
- **Dynamic logo** changes based on selected project
- **HTTP client filtering** - shows only JS, Node, Dart, Python examples
- **Flash prevention** - critical CSS and blocking dark mode detection

**Usage in payload.config.ts**:
```typescript
import { scalarPlugin } from '@/lib/openapi'

plugins: [
  scalarPlugin({
    specEndpoint: '/openapi.json',  // Filtered spec path
    docsUrl: '/docs',               // Documentation UI path
  }),
]
```

**Project Logos**:
| Project | Logo |
|---------|------|
| All Endpoints (default) | `/images/sahaj-cloud.svg` |
| We Meditate Web | `/images/wemeditate-web.svg` |
| We Meditate App | `/images/wemeditate-app.svg` |
| Sahaj Atlas | `/images/sahaj-atlas.webp` |

### specFilter.ts

Filters OpenAPI specifications and provides project-based collection utilities:

**Exported Functions**:
```typescript
import {
  filterSpec,
  ALWAYS_HIDDEN_COLLECTIONS,
  EXCLUDED_OPERATIONS,
  ALLOW_POST_FOR,
  type FilterOptions,
  type OpenAPISpec,
} from '@/lib/openapi/specFilter'
```

| Function | Purpose |
|----------|---------|
| `filterSpec(spec, options?)` | Filter spec with project-based and operation filtering |

**Note**: specFilter.ts now uses `getProjectCollections()` and `getRoleOptions()` from `@/lib/access` for collection lookups instead of having redundant helper functions.

**ALWAYS_HIDDEN_COLLECTIONS** (System collections always hidden):
- `managers`, `clients` (access collections)
- `images`, `files` (system collections)
- `payload-kv`, `payload-jobs`, `payload-locked-documents`, `payload-preferences`, `payload-migrations`, `payload-job-stats` (Payload internal)

**EXCLUDED_OPERATIONS** (HTTP methods always hidden):
- `DELETE`, `PATCH`

**ALLOW_POST_FOR** (Collections allowing POST):
- `form-submissions`

**Project-Based Filtering**:
When a project is specified, only that project's collections are shown. When no project is specified, union of all client collections is shown.

```typescript
import { filterSpec, ALWAYS_HIDDEN_COLLECTIONS } from '@/lib/openapi'

// Without project - shows all client collections
const spec = filterSpec(rawSpec)

// With project - shows only that project's collections
const spec = filterSpec(rawSpec, { project: 'wemeditate-web' })
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/openapi.json` | Filtered OpenAPI 3.1 spec (hides internal operations) |
| `/api/openapi.json?project=<project>` | Project-filtered spec |
| `/api/openapi-raw.json` | Raw OpenAPI 3.1 spec (all operations visible) |
| `/api/docs` | Scalar interactive documentation with We Meditate branding |
| `/api/docs?project=<project>` | Project-filtered documentation |

## Route Handler

**Location**: `src/app/(payload)/api/openapi.json/route.ts`

Generates and filters the OpenAPI spec:
1. Parses `?project=` query parameter
2. Validates project using `isValidProject()` from `@/lib/access`
3. Generates spec directly using `payload-oapi` internals (avoids self-referential fetch issues)
4. Applies `filterSpec()` with project filtering
5. Returns filtered spec with caching headers (Cloudflare Cache API in production)

## Testing

Integration tests in `tests/int/api-explorer.int.spec.ts`:
- OpenAPI spec generation and validation
- Project-based filtering for each project
- ALWAYS_HIDDEN_COLLECTIONS verification
- Operation filtering (DELETE, PATCH hidden)
- Scalar UI endpoint responses

## Configuration

**payload.config.ts**:
```typescript
import { openapi } from 'payload-oapi'
import { scalarPlugin } from '@/lib/openapi'

plugins: [
  // Raw spec generation
  openapi({
    openapiVersion: '3.1',
    specEndpoint: '/openapi-raw.json',
    metadata: {
      title: 'Sahaj Cloud API',
      version: '1.0.0',
      description: 'REST API for Sahaj Cloud CMS',
    },
  }),
  // Custom Scalar UI with branding
  scalarPlugin({
    specEndpoint: '/openapi.json',
    docsUrl: '/docs',
  }),
]
```

## Custom Endpoint Shim

`payload-oapi` v0.2.5 does not auto-generate paths for Payload collection endpoints (the ones wired via a collection's `endpoints` array under `src/endpoints/`). We hand-author their spec entries in [`src/lib/openapi/customEndpoints.ts`](../../src/lib/openapi/customEndpoints.ts) and merge them into the raw spec inside [`src/app/(payload)/api/openapi.json/route.ts`](../../src/app/(payload)/api/openapi.json/route.ts) — specifically between `generateV31Spec` and `filterSpec` so project-based visibility applies automatically by collection slug.

| Custom path | Handler | Response schema |
|---|---|---|
| `GET /api/frames/by-narrator/{narratorId}` | [framesByNarrator](../../src/endpoints/framesByNarrator.ts) | `#/components/schemas/Frames` |
| `GET /api/lectures/for-audience` | [lecturesForAudience](../../src/endpoints/lecturesForAudience.ts) | `#/components/schemas/ItemPlayerData` (hand-authored) |
| `GET /api/app-cards/for-audience` | [appCardsForAudience](../../src/endpoints/appCardsForAudience.ts) | `#/components/schemas/AppCards` |

The audience query params on the two `for-audience` endpoints are generated at module load from `AUDIENCE_DEFINITIONS` ([src/collections/tags/Audiences.ts](../../src/collections/tags/Audiences.ts)) and mirror the Zod shape produced by `buildAudienceDataShape` in [rulesField.ts](../../src/fields/rulesField.ts) — so adding a rule flows through to the docs automatically. The `audience params stay in sync` assertion in [api-explorer.int.spec.ts](../../tests/int/api-explorer.int.spec.ts) is the regression guard.

When `payload-oapi` ships native custom-endpoint support, the shim module and the merge block can both be deleted in a single follow-up.

## Known Limitations

- **API key format**: Plugin uses OAuth2 password flow instead of `Authorization: clients API-Key <key>` format
- **`/api/health` + webhook routes**: Next.js app-router routes (`/api/health`, `/api/webhooks/...`, `/api/seed/:script`) are intentionally omitted — they're infrastructure, not part of the public client API.

**Plugin Review**: Check payload-oapi for updates quarterly or when new features needed.
