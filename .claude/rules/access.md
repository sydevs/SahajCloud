---
paths:
  - src/lib/access/**/*.ts
  - src/collections/access/**/*.ts
---

# Role-Based Access Control

The CMS uses a unified RBAC system via the `accessPlugin`. The plugin
automatically applies access control to every collection — collections do
**not** need manual `access` config. It also applies `admin.hidden` for
project visibility and field-level access for localized fields.

## Architecture

- **Static permission checking** (no factory pattern)
- **O(1) lookup tables** built once at module load
- **Bypass logic** in `src/lib/access/bypassPermissions.ts`

### Configuration files (single source of truth)

| File | Purpose |
|---|---|
| `src/lib/access/config/projects.ts` | Project config + lookup tables + helpers |
| `src/lib/access/config/roles.ts` | Role config + lookup tables + helpers |
| `src/lib/access/config/index.ts` | Barrel export |
| `src/lib/access/bypassPermissions.ts` | Shared bypass function |
| `src/payload.config.ts` | Plugin registration |

```typescript
import { accessPlugin, bypassPermissions } from '@/lib/access'

plugins: [
  accessPlugin({ enabled: true, bypassPermissions }),
]
```

### Plugin implementation

| File | Purpose |
|---|---|
| `accessPlugin.ts` | Main orchestration |
| `permissions.ts` | `hasPermission`, `hasAnyPermission` |
| `accessConfigs.ts` | Access configuration factories |
| `fieldAccess.ts` | Field-level access for translatable collections |
| `visibility.ts` | Admin UI visibility (`createHidden`) |
| `filterAvailableLocales.ts` | Admin locale-selector filtering |
| `types.ts` | Plugin type definitions |
| `index.ts` | Public API barrel export |

## Manager roles

Manager `type` field controls top-level access:
- `inactive` — denied
- `manager` — uses `roles` + `customResourceAccess`
- `admin` — full bypass; `roles` and `customResourceAccess` hidden in admin UI

### Available manager roles

| Role | Description |
|---|---|
| `meditations-editor` | Create/edit meditations + upload media |
| `path-editor` | Edit lessons, lectures, lecture clips + upload media |
| `web-translator` | Edit localized fields in pages, songs, albums (read-only otherwise) |

Manager roles are **per-locale** — different roles can be assigned for
different languages. Access checks use `req.locale` only. A manager with
`meditations-editor` in English and `web-translator` in Czech can edit a
meditation when the admin UI is in English but only translate it when
in Czech.

## API client roles

| Role | Application |
|---|---|
| `wemeditate-web-client` | We Meditate web frontend |
| `wemeditate-app-client` | We Meditate mobile app |
| `sahaj-atlas-client` | Sahaj Atlas application |

The `-client` suffix is intentional — it disambiguates from project slugs.
Client roles are **not localized** — they apply uniformly across all locales.

Clients are read-only by default; the `wemeditate-web` client may also
create form submissions. API clients only see published documents on
draft-enabled collections.

## Permission checking

```typescript
import { hasPermission, hasAnyPermission } from '@/lib/access'

// Single operation
hasPermission({ user, collection: 'pages', operation: 'read' })
hasPermission({ user, collection: 'meditations', operation: 'create' })
hasPermission({ user, collection: 'pages', operation: 'update', field: { localized: true } })

// Any-of (visibility, multi-op gating)
hasAnyPermission({ user, collection: 'pages', operations: ['create', 'update', 'delete'] })

// With explicit bypass (testing or custom logic)
hasPermission({ user, collection: 'pages', operation: 'update' }, bypassFn)
```

## Permission flow

1. Block null users.
2. Call `bypassPermissions` (in order):
   - Self-access — read/update own document
   - Inactive user blocking — managers + clients
   - Admin bypass — full access
   - `customResourceAccess` — document-level grants
3. O(1) permission lookup via pre-computed tables.
4. Translate-permission check for localized field updates.
5. Project-based implicit read access — collections in the role's project +
   shared collections (those listed in no project).

Bypass return values: `'allow'` / `'deny'` / `'continue'`.

## Permissions data structure

```typescript
'meditations-editor': {
  label: 'Meditations Editor',
  project: 'wemeditate-app',
  permissions: {
    meditations: ['create', 'update'],
    narrators: ['create', 'update'],
    images: ['create'],
    files: ['create'],
  },
}
```

## Important behaviors

### Project-based implicit read access

Both managers and API clients read everything in their role's project
**plus** shared collections.

- `web-translator` (wemeditate-web) reads pages, meditations, songs, etc. + shared.
- `wemeditate-app-client` reads meditations, lessons, lectures, lecture-clips, etc. + shared.
- `sahaj-atlas-client` reads images, files (sahaj-atlas) + shared.

### `customResourceAccess` — document-level permissions

Allows managers to update specific documents without collection-level update
permission. Currently only applies to `pages`. Grants update only — never
create or delete. Checked in the bypass function before collection-level
permissions.

### Self-access

Users can always read and update their own document in their auth
collection. Implemented in the bypass function.

### Restricted collections (implicit)

Access collections (`managers`, `clients`) and Payload system collections
(`payload-jobs`, `payload-kv`, …) are not listed in any project. Only
explicit-permission users (or admin bypass) reach them. No hardcoded
restrictions needed.

## Adding a new role

1. Add to `src/lib/access/config/roles.ts` in the `ROLES` constant:

```typescript
const ROLES = {
  'my-new-role': {
    label: 'My New Role',
    description: 'Description of the role',
    project: 'wemeditate-web' as const,
    permissions: {
      'my-collection': ['create', 'update'] as PermissionLevel[],
    },
  },
  // ...
}
```

Lookup tables compute automatically at module load — no manual updates.

2. `pnpm generate:types` to regenerate `RoleSlug`.
3. Add tests in `tests/int/role-based-access.int.spec.ts`.

## Admin UI

`PermissionsTable` (`src/components/admin/PermissionsTable.tsx`) displays
computed permissions in real time as roles are toggled, rendered as
`afterInput` on the `roles` field. Color-coded operation pills:
read / create / update / delete.

## Testing

- `tests/int/role-based-access.int.spec.ts` — comprehensive RBAC integration tests
- `tests/utils/testData.ts` — factories for managers and clients with roles
