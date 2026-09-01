---
paths:
  - src/plugins/access/**/*.ts
  - src/collections/Clients/**/*.ts
  - src/collections/Managers/**/*.ts
---

# Role-Based Access Control

The CMS uses a unified RBAC system via the `accessPlugin`. The plugin
automatically applies access control to every collection — collections do
**not** need manual `access` config. It also applies `admin.hidden` for
project visibility and field-level access for localized fields.

## Architecture

- **Static permission checking** (no factory pattern)
- **O(1) lookup tables** built once at module load
- **Bypass logic** in `src/plugins/access/bypassPermissions.ts`

### Configuration files (single source of truth)

| File                                  | Purpose                                  |
| ------------------------------------- | ---------------------------------------- |
| `src/plugins/access/config/projects.ts`   | Project config + lookup tables + helpers |
| `src/plugins/access/config/roles.ts`      | Role config + lookup tables + helpers    |
| `src/plugins/access/config/index.ts`      | Barrel export                            |
| `src/plugins/access/bypassPermissions.ts` | Shared bypass function                   |
| `src/payload.config.ts`               | Plugin registration                      |

```typescript
import { accessPlugin, bypassPermissions } from '@/plugins/access'

plugins: [accessPlugin({ enabled: true, bypassPermissions })]
```

### Plugin implementation

| File                        | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| `accessPlugin.ts`           | Main orchestration                              |
| `permissions.ts`            | `hasPermission`, `hasAnyPermission`             |
| `accessConfigs.ts`          | Access configuration factories                  |
| `fieldAccess.ts`            | Field-level access for translatable collections |
| `visibility.ts`             | Admin UI visibility (`createHidden`)            |
| `filterAvailableLocales.ts` | Admin locale-selector filtering                 |
| `types.ts`                  | Plugin type definitions                         |
| `index.ts`                  | Public API barrel export                        |

## Manager roles

Manager `type` field controls top-level access:

- `inactive` — denied
- `manager` — uses `roles` + document-level manager access (see below)
- `admin` — full bypass; `roles` hidden in admin UI

### Available manager roles

| Role                 | Description                                                                   |
| -------------------- | ---------------------------------------------------------------------------- |
| `meditations-editor` | Create/edit meditations + upload media                                       |
| `path-editor`        | Edit lessons, lectures, lecture clips + upload media                         |
| `web-translator`     | Edit localized fields in pages, songs, albums (read-only otherwise)          |
| `atlas-manager`      | Sahaj Atlas: read project-wide; create/update events + regions, trash events — writes scoped to the manager's owned-region subtree (see below) |

Manager roles are **per-locale** — different roles can be assigned for
different languages. A manager with `meditations-editor` in English and
`web-translator` in Czech can edit a meditation when the admin UI is in English
but only translate it when in Czech.

### How per-locale roles reach `req.user` (#665)

That model is only real because the authenticated user is loaded **twice**.
`roles` is a `localized` field, and every ordinary read resolves a localized
field at one locale — Payload's own `local-jwt` strategy passes no locale at
all, so it resolves at the default. For a long time that was the only read, and
the per-locale model was inert at runtime in both directions: every manager's
English roles applied in all 19 locales, and a manager with no English roles was
locked out of the admin entirely.

Two pieces put it right, and **both** are needed:

| Piece | Why it alone is not enough |
| --- | --- |
| `localizedRolesStrategy` (`src/collections/Managers/`) wraps `JWTAuthentication` and re-reads roles at `locale: 'all'` | Fixes `req.user`, but the admin client calls `/api/managers/me` on mount, which re-reads at one locale and overwrites it |
| `afterMe` / `afterRefresh` / `afterLogin` hooks on `Managers` | Fix the responses, but every server-side access check reads `req.user` |

`hydrateLocalizedRoles` is that read; `src/plugins/access/localizedRoles.ts`
holds it alongside the helpers that collapse the record.

⚠ **A manager read any other way still carries the flat, default-locale array.**
That is correct for editing a manager document; it is wrong for deciding access.

### What a check with no locale means

`hasPermission`'s `locale` is a **`RoleScope`**, and each of its three values is
a deliberate answer rather than a default:

| Scope | Meaning | Used by |
| --- | --- | --- |
| a `LocaleCode` | roles assigned in that locale | every ordinary access check |
| `'union'` | roles in **any** locale | admin nav visibility (`createHidden`), which Payload calls with no locale — scoping it otherwise empties the sidebar for every non-admin manager |
| `undefined` | nothing resolvable, so deny | `?locale=all`, which names no locale to evaluate |

`?locale=all` therefore **denies** a manager where it used to grant (the flat
array leaked through). The admin UI never sends it, so this reaches hand-rolled
API calls only. Clients are unaffected throughout — `Clients.roles` is not
localized, so no scope applies to a flat array.

⚠ **An endpoint calling `hasPermission` by hand must pass a locale**, or it
denies every non-admin manager. `EventSubmissions/endpoints/review.ts` is the
worked example.

## API client roles

| Role                    | Application              |
| ----------------------- | ------------------------ |
| `wemeditate-web-client` | We Meditate web frontend |
| `wemeditate-app-client` | We Meditate mobile app   |
| `sahaj-atlas-client`    | Sahaj Atlas application  |

The `-client` suffix is intentional — it disambiguates from project slugs.
Client roles are **not localized** — they apply uniformly across all locales.

Clients are read-only by default; the `wemeditate-web` client may also
create form submissions. API clients only see published documents on
draft-enabled collections.

## Permission checking

```typescript
import { hasPermission, hasAnyPermission } from '@/plugins/access'

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
3. O(1) permission lookup via pre-computed tables.
4. Translate-permission check for localized field updates.
5. Project-based implicit read access — collections in the role's project +
   shared collections (those listed in no project).
6. Document-level manager access — when all the above deny an active non-admin
   manager a read/update, `createAccessConfig` (async) grants it if the target
   document, or an ancestor, lists them via a `managers`/`manager` field.

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

### Document-level manager access

Any collection that declares a `managers` (hasMany) or `manager` relationship
to `managers` grants **read + update** on its documents to the listed managers
— even with no role-based access. A self-referential `parent` relationship lets
a document inherit managers from its ancestors, resolved through the nested-docs
`breadcrumbs` trail (depth-independent) with a cycle-guarded parent-walk
fallback. Fields are discovered by introspecting `flattenedFields`
(`src/plugins/access/documentManagers.ts`) — no collection slugs are hardcoded,
so it applies to any collection that adds them (currently Pages via "Page
Editors", Regions, and Clients). Grants read + update only — never create or
delete. Resolved asynchronously in `createAccessConfig`, only after the
query-free permission check has already failed.

### Region-subtree write scoping (Atlas managers)

The `atlas-manager` role is the one role that grants **create/update/delete**
on document-managed collections (`events`, `regions`). Those grants are
deliberately **not** collection-wide: `src/plugins/access/regionSubtreeAccess.ts`
narrows each role-granted write to the manager's **owned-region subtree** — the
regions that list them in `managers`, plus every descendant via the nested-docs
`breadcrumbs` trail (reusing `resolveManagedDocIds`).

- **regions** — `create` requires the new region's `parent` to be in the
  subtree; `update` is scoped to subtree members. No `delete` (region deletion
  stays admin-only — child regions/events FK-reference it).
- **events** — scoped by `event.region ∈ subtree` **OR** `event.manager == user`
  (the latter preserves the direct-owner access the document-manager fallback
  grants); `create` requires the incoming `region` to be in the subtree;
  `delete` (permanent delete / the trash button's hard path) is scoped the same
  way. Soft-delete (trash) is an `update` to `deletedAt`, covered by the update
  scope.
- **read** stays project-wide (implicit project read) — an Atlas manager sees
  every Atlas event/region; only writes are subtree-scoped.

Wired into `createAccessConfig` after the role check passes, gated on an
explicit slug allowlist (`{ regions, events }`) rather than field introspection
— create/delete are security-sensitive, so the opt-in is auditable at a glance
and a stray `managers` field elsewhere can't silently widen access.

### Self-access

Users can always read and update their own document in their auth
collection. Implemented in the bypass function.

### Restricted collections — "in no project" is NOT restrictive

Read this together with step 5 above, because the two pull in opposite
directions and the obvious reading is the wrong one. Access collections
(`managers`, `clients`) and Payload system collections (`payload-jobs`,
`payload-kv`, …) are in no project and are reachable only by
explicit-permission users or the admin bypass — but that is because they carry
**no write permission for anyone**, not because "no project" restricts them.

Step 5 says the opposite for read: implicit read covers a role's project
**plus every collection in no project**. So a collection left out of `PROJECTS`
is *shared*, i.e. readable by every role — which is the trap.

**`RESTRICTED_COLLECTIONS`** (`config/projects.ts`) is the escape, and the only
one: a collection named there is skipped by implicit read entirely, so only an
explicit `read` grant in a role or the admin bypass reaches it. It holds
`users`, `event-submissions`, and `user-messages` — everything carrying personal
data.

The two knobs compose, and a collection that must be admin-only needs both:

| Want | Do |
| --- | --- |
| Nobody reads it implicitly | Add to `RESTRICTED_COLLECTIONS` |
| A client may still create it | Grant `['create']` in that client's role |
| **No manager role may read it** | Grant it in **no** role — `user-messages` is the example |
| Visible in `/api/docs` | Add to a project's `collections` (see `.claude/rules/openapi.md`) |

The last row is why both public intakes' POSTs are `x-internal`: neither is in a
project, deliberately.

## Adding a new role

1. Add to `src/plugins/access/config/roles.ts` in the `ROLES` constant:

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
