# OpenAPI & Scalar API Documentation

The application provides interactive REST API documentation using custom plugins built on top of [payload-oapi](https://github.com/janbuchar/payload-oapi) for spec generation and [Scalar](https://github.com/scalar/scalar) for the UI.

## Module Structure

**Location**: `src/lib/openapi/`

```
src/lib/openapi/
├── index.ts              # Barrel export
├── scalarPlugin.ts       # Custom Scalar plugin with branding
├── filterByClientRole.ts # Role-based collection filtering
└── markInternalPaths.ts  # Operation filtering and x-internal markers
```

## Key Components

### scalarPlugin.ts

Custom PayloadCMS plugin providing branded API documentation:

- **We Meditate coral theme** (`#F07855`) with light/dark mode support
- **Client role selector** dropdown to filter visible endpoints
- **Dynamic logo** changes based on selected role
- **HTTP client filtering** - shows only JS, Node, Dart, Python examples

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

**Role Logos**:
| Role | Logo |
|------|------|
| All Endpoints (default) | `/images/sahaj-cloud.svg` |
| We Meditate Web | `/images/wemeditate-web.svg` |
| We Meditate App | `/images/wemeditate-app.svg` |
| Sahaj Atlas | `/images/sahaj-atlas.webp` |

### filterByClientRole.ts

Utilities for role-based collection filtering using `CLIENT_ROLES` as source of truth:

```typescript
import {
  getCollectionsForRole,
  getAllClientCollections,
  isValidClientRole,
  getClientRoleOptions
} from '@/lib/openapi'
```

| Function | Purpose |
|----------|---------|
| `getCollectionsForRole(role)` | Get collections accessible to a specific client role |
| `getAllClientCollections()` | Get union of all collections across all client roles |
| `isValidClientRole(role)` | Type guard to validate role string |
| `getClientRoleOptions()` | Get role options for UI dropdowns |

### markInternalPaths.ts

Filters OpenAPI specifications to hide internal operations:

**ALWAYS_HIDDEN_COLLECTIONS** (System collections always hidden):
- `managers`, `clients` (access collections)
- `images`, `files`, `image-tags` (system collections)
- `payload-kv`, `payload-jobs`, `payload-locked-documents`, `payload-preferences`, `payload-migrations`, `payload-job-stats` (Payload internal)

**EXCLUDED_OPERATIONS** (HTTP methods always hidden):
- `DELETE`, `PATCH`

**ALLOW_POST_FOR** (Collections allowing POST):
- `form-submissions`

**Role-Based Filtering**:
When a role is specified, only that role's collections are shown. When no role is specified, union of all client collections is shown.

```typescript
import { markInternalPaths, ALWAYS_HIDDEN_COLLECTIONS } from '@/lib/openapi'

// Without role - shows all client collections
const spec = markInternalPaths(rawSpec)

// With role - shows only that role's collections
const spec = markInternalPaths(rawSpec, { role: 'we-meditate-web' })
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/openapi.json` | Filtered OpenAPI 3.1 spec (hides internal operations) |
| `/api/openapi.json?role=<role>` | Role-filtered spec |
| `/api/openapi-raw.json` | Raw OpenAPI 3.1 spec (all operations visible) |
| `/api/docs` | Scalar interactive documentation with We Meditate branding |
| `/api/docs?role=<role>` | Role-filtered documentation |

## Route Handler

**Location**: `src/app/(payload)/api/openapi.json/route.ts`

Intercepts requests and applies filtering:
1. Parses `?role=` query parameter
2. Validates role against `CLIENT_ROLES`
3. Fetches raw spec from `/api/openapi-raw.json`
4. Applies `markInternalPaths()` with role filtering
5. Returns filtered spec with caching headers

## Testing

Integration tests in `tests/int/api-explorer.int.spec.ts`:
- OpenAPI spec generation and validation
- Role-based filtering for each client role
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

## Known Limitations

- **Custom endpoints not documented**: `/api/frames/by-narrator/:narratorId` and `/api/health` are not in spec
- **API key format**: Plugin uses OAuth2 password flow instead of `Authorization: clients API-Key <key>` format

**Plugin Review**: Check payload-oapi for updates quarterly or when new features needed.
