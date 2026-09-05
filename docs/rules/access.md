---
paths:
  - src/plugins/access/**/*.ts
  - src/collections/Clients/**/*.ts
  - src/collections/Managers/**/*.ts
---

# Role-Based Access Control

The `accessPlugin` gives every collection access control automatically. A collection needs no manual `access` config. The plugin also sets `admin.hidden` for project visibility and field-level access for localized fields.

## Architecture

- Static permission checking, no factory pattern.
- O(1) lookup tables, built once at module load.
- Bypass logic in `src/plugins/access/bypassPermissions.ts`.

| File | Purpose |
| --- | --- |
| `config/projects.ts` | Project config, lookup tables, helpers |
| `config/roles.ts` | Role config, lookup tables, helpers |
| `config/index.ts` | Barrel export |
| `bypassPermissions.ts` | Shared bypass function |
| `accessPlugin.ts` | Main orchestration |
| `permissions.ts` | `hasPermission`, `hasAnyPermission` |
| `accessConfigs.ts` | Access configuration factories |
| `fieldAccess.ts` | Field-level access for translatable collections |
| `visibility.ts` | Admin UI visibility (`createHidden`) |
| `filterAvailableLocales.ts` | Admin locale-selector filtering |

```typescript
import { accessPlugin, bypassPermissions } from '@/plugins/access'

plugins: [accessPlugin({ enabled: true, bypassPermissions })]
```

## Manager roles

The Manager `type` field controls top-level access: `inactive` (denied), `manager` (uses `roles` plus document-level manager access, below), `admin` (full bypass — the admin UI hides `roles`).

| Role | Description |
| --- | --- |
| `meditations-editor` | Create and edit meditations, upload media |
| `path-editor` | Edit lessons, lectures, and lecture clips. Upload media |
| `web-translator` | Edit localized fields on pages, songs, albums (read-only otherwise) |
| `atlas-manager` | Sahaj Atlas: read project-wide. Create, update, and trash events and regions — writes scoped to the manager's owned-region subtree, below |

Manager roles are **per-locale**: a manager can hold `meditations-editor` in English and `web-translator` in Czech, and gets the matching access in each admin locale.

### How a per-locale role reaches `req.user` (#665)

This only works because the authenticated user loads **four times**, not once. `roles` is `localized`, and an ordinary read resolves one locale — Payload's own `local-jwt` strategy passes none, so it reads the default. Left alone, every manager's English roles would apply in all 19 locales, and a manager with no English roles would be locked out entirely.

`src/plugins/access/localizedRolesAuth.ts` re-loads the manager at the auth strategy (every request), `afterLogin`, `afterMe` (the admin's own `/me` call on mount), and `afterRefresh` (a tab left open). Skip any one and that moment's read reverts to the flat, default-locale array.

⚠ **Nothing wires this up on the collection**. `accessPlugin` attaches all four hooks to any auth collection whose `roles` field is `localized`. A future such collection is covered automatically. `Clients.roles` is flat, so it is skipped.

⚠ **A manager loaded any other way still carries the flat array.** Fine for editing the document. Wrong for deciding access.

### What a check with no locale means

`hasPermission`'s `locale` argument is a `RoleScope`. Each value is a deliberate answer:

| Scope | Meaning | Used by |
| --- | --- | --- |
| A `LocaleCode` | Roles assigned in that locale | Every ordinary access check |
| `'union'` | Roles in **any** locale | Admin nav visibility, called with no locale — anything narrower empties the sidebar for non-admins |
| `undefined` | Nothing resolvable, so deny | `?locale=all`, and any locale outside `LOCALES` |

⚠ **A custom admin client component that calls the REST API by hand must send the active admin locale — `useLocale().code` from `@payloadcms/ui` — on every request.** A request naming no locale resolves to the **default** locale, so the gate reads the manager's English roles and denies anyone whose roles live only elsewhere. Payload's own admin requests and `usePayloadAPI` already send it; a hand-rolled `fetch('/api/…')` does not. Three of them shipped without it, and a French-only manager saw a 403 on the frames library, blank list thumbnails, and a refused Accept (#701). A locale-keyed request cache (an SWR key, a batch key) must include the locale too, or one locale's response answers another's cells.

⚠ **Never derive this scope by hand from `req.locale`. Call `roleScopeFromLocale`.** Written out per call site it drifts. Four hand-written copies once existed, and the fourth answered `?locale=all` with `'union'` where the rest denied it. Worse, `req.locale` is a request-supplied string, and `RoleScope` has a non-locale member. A cast lets `?locale=union` name the privileged scope and hand a manager every locale's roles at once. The helper accepts only a configured locale, so `?locale=all` now **denies** instead of leaking the flat array through. The admin UI never sends it. Only a hand-rolled API call can reach this path. Clients are unaffected — `Clients.roles` is not localized.

## API client roles

| Role | Application |
| --- | --- |
| `wemeditate-web-client` | We Meditate web frontend |
| `wemeditate-app-client` | We Meditate mobile app |
| `sahaj-atlas-client` | Sahaj Atlas application |

The `-client` suffix disambiguates a client role from a project slug. Client roles are **not localized** — one set of roles applies across every locale. Clients are read-only by default, except `wemeditate-web`, which may also create form submissions. API clients see only published documents on draft-enabled collections.

## Permission checking

```typescript
import { hasPermission, hasAnyPermission } from '@/plugins/access'

hasPermission({ user, collection: 'pages', operation: 'read' })
hasPermission({ user, collection: 'pages', operation: 'update', field: { localized: true } })

// Any-of (visibility, multi-op gating)
hasAnyPermission({ user, collection: 'pages', operations: ['create', 'update', 'delete'] })

// With an explicit bypass (testing or custom logic)
hasPermission({ user, collection: 'pages', operation: 'update' }, bypassFn)
```

## Permission flow

1. Block null users.
2. Run `bypassPermissions`, in order: self-access (read or update your own document), inactive-user blocking (managers and clients), then admin bypass.
3. Run an O(1) permission-table lookup.
4. Check translate permission for a localized field update.
5. Apply project-based implicit read: the role's project, plus every collection listed in no project (shared).
6. Apply document-level manager access — see below — when every prior step denies an active non-admin manager a read or update.

A bypass function returns `'allow'`, `'deny'`, or `'continue'`.

## Important behaviors

### Project-based implicit read

Managers and API clients both read their role's project plus every shared collection. `web-translator` reads pages, meditations, songs, and shared. `wemeditate-app-client` reads meditations, lessons, lectures, lecture clips, and shared. `sahaj-atlas-client` reads images and files (sahaj-atlas) and shared.

### Document-level manager access

A `managers` (hasMany) or `manager` relationship to `managers` on any collection grants those managers **read and update** on its documents, with no role needed. A self-referential `parent` field lets a document inherit managers from its ancestors, via the nested-docs `breadcrumbs` trail. Fields are found by introspecting `flattenedFields` (`documentManagers.ts`) — no slug is hardcoded. Any collection that adds such a field is covered (today: Pages via "Page Editors", Regions, Clients). Read and update only, never create or delete — and only after the query-free check has failed.

### Region-subtree write scoping (Atlas managers)

`atlas-manager` is the one role granting **create, update, and delete** on `events` and `regions`. `regionSubtreeAccess.ts` narrows every such grant to the manager's **owned-region subtree**: the regions listing them in `managers`, plus every descendant via `breadcrumbs`.

- **regions** — `create` requires the new region's `parent` in the subtree. `update` is scoped to subtree members. There is no `delete` (admin-only, since child regions and events reference it by foreign key).
- **events** — scoped by `region ∈ subtree` **or** `manager == user` (the direct-owner case). `create` requires the incoming `region` in the subtree. Hard `delete` is scoped the same way. Soft-delete (trash) is an `update` to `deletedAt`, already covered.
- **read** stays project-wide — only writes are subtree-scoped.

Wired into `createAccessConfig` on an explicit slug allowlist (`{ regions, events }`), not field introspection, since create/delete are security-sensitive and a stray `managers` field elsewhere must not silently widen access.

### Self-access

A user can always read and update their own document in their auth collection.

### Restricted collections — "in no project" is not restrictive

This cuts the opposite way from implicit read, above, and the obvious reading is wrong. `managers`, `clients`, and Payload's system collections sit in no project. They are reachable only by explicit permission or the admin bypass — because no role grants write on them, not because "no project" is restrictive. For read, "no project" means the opposite: shared, and readable by every role.

**`RESTRICTED_COLLECTIONS`** (`config/projects.ts`) is the only way to stop that. A collection named there is skipped by implicit read, so only an explicit `read` grant, or the admin bypass, reaches it. It holds `users`, `event-submissions`, and `user-messages` — everything carrying personal data.

| Want | Do |
| --- | --- |
| Nobody reads it implicitly | Add it to `RESTRICTED_COLLECTIONS` |
| A client may still create it | Grant `['create']` in that client's role |
| **No manager role may read it** | Grant it in **no** role (`user-messages`) |
| Visible in `/api/docs` | Add it to a project's `collections` (`docs/rules/openapi.md`) |

Both public intakes' POSTs are `x-internal` for exactly this reason: neither sits in a project.

## Adding a new role

1. Add it to the `ROLES` constant in `src/plugins/access/config/roles.ts`:

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
}
```

Lookup tables compute automatically. No manual update is needed.

2. Run `pnpm generate:types` to regenerate `RoleSlug`.
3. Add tests in `tests/int/role-based-access.int.spec.ts`.

## Admin UI

`PermissionsTable` (`src/components/admin/PermissionsTable.tsx`) shows computed permissions live as roles are toggled, rendered as `afterInput` on the `roles` field, with color-coded pills for read, create, update, and delete.

## Testing

- `tests/int/role-based-access.int.spec.ts` — RBAC integration tests.
- `tests/utils/testData.ts` — factories for managers and clients with roles.
