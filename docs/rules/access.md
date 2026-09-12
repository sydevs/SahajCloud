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
| `accessConfigs.ts` | Access configuration factories, plus `withVersionHistoryAccess` and `withUnlockAccess` |
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

⚠ **A hand-rolled admin `fetch('/api/…')` must send the active admin locale — `useLocale().code` from `@payloadcms/ui` — whenever the endpoint or collection it calls runs a per-locale `hasPermission`.** A request naming no locale resolves to the **default** locale, so the gate reads the manager's English roles and denies anyone whose roles live only elsewhere. Payload's own admin requests and `usePayloadAPI` already send it; a hand-rolled `fetch` does not. Three of them shipped without it, and a French-only manager saw a 403 on the frames library, blank list thumbnails, and a refused Accept (#701). A locale-keyed request cache (an SWR key, a batch key) must include the locale too, or one locale's response answers another's cells.

**The condition is the gate, not the call.** `grep "fetch('/api/"` over `src/components` finds more call sites than this rule governs, so check what the target does before you "fix" one:

| Call site | Sends the locale? | Why |
| --- | --- | --- |
| `FrameEditor/utils.ts` → `/api/frames/by-narrator/:id` | **Yes** | The endpoint calls `hasPermission` at `req.locale` |
| `ThumbnailCell/relationshipDocLoader.ts` → `/api/:collection` | **Yes** | The collection read gate does |
| `EventSubmissions/urls.ts` → `/api/event-submissions/:id/review` | **Yes** | `applyReview`'s role check does |
| `ProjectSelector.tsx`, `ProjectContext.tsx` → `/api/managers/set-project` | No | Gated on `requireActiveManager`, then reads with `overrideAccess: true` — no per-locale check runs |
| `CanonicalEmbedPicker/Description.tsx` → `/api/clients/:id/verify-embed` | No | Same shape, and `Clients.roles` is not localized |
| `TranslationsRow/useEnglishTranslation.ts` → `?locale=en` | Pinned to `en` | It wants the English **text** for translators, not the caller's roles. Admin-only today |

**Where the locale is required, build the URL in a pure module and return `null` without one** — `framesByNarratorKey` and `eventSubmissionActionUrl` both do. `useLocale()`'s context default is `{}`, so `code` is `string` to the compiler but can be `undefined` at runtime, and `?locale=undefined` is rewritten to the default locale by `sanitizeLocales` — the #701 403 again, silently. Refusing to build the URL turns that into a visible failure, and makes the call site testable without a browser.

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

`resolveManagedDocIds` — the managed-set resolution both this fallback and the region-subtree scoping below run — is memoized per request, keyed on `(collection, userId)` (#749). Payload evaluates each access operation independently and dedups nothing between them: `getEntityPermissions` fires every operation of a collection in one `Promise.all` with byte-identical args, and its `whereQueryCache` cannot help because that only runs with `fetchData: true`, which `/api/access` does not pass. Measured, one `/api/access` call as an `atlas-manager` went from 12 `regions` queries to 2.

**It collapses the list-level resolutions only.** `createAccessConfig`'s single-document `update` branch (`id` present) routes to `userManagesDocument` instead, which is still unmemoized — so a document edit view, where `getDocumentPermissions` repeats the whole operation set four times for a drafts+trash collection, still pays that path per evaluation. The `resolveManagedDocIds` JSDoc owns the two hazards a per-request memo opens: the staleness window it pins, and why it must not be lifted to the access function. Read it before you widen the key.

### Region-subtree write scoping (Atlas managers)

`atlas-manager` is the one role granting **create, update, and delete** on `events` and `regions`. `regionSubtreeAccess.ts` narrows every such grant to the manager's **owned-region subtree**: the regions listing them in `managers`, plus every descendant via `breadcrumbs`.

- **regions** — `create` requires the new region's `parent` in the subtree. `update` is scoped to subtree members. There is no `delete` (admin-only, since child regions and events reference it by foreign key).
- **events** — scoped by `region ∈ subtree` **or** `manager == user` (the direct-owner case). `create` requires the incoming `region` in the subtree. Hard `delete` is scoped the same way. Soft-delete (trash) is an `update` to `deletedAt`, already covered.
- **read** stays project-wide — only writes are subtree-scoped.

Wired into `createAccessConfig` on an explicit slug allowlist (`{ regions, events }`), not field introspection, since create/delete are security-sensitive and a stray `managers` field elsewhere must not silently widen access.

### Version history is edit authority (#719)

`withVersionHistoryAccess` derives **`readVersions`** from the collection's own `update` function, on every collection and global the plugin touches. Anyone who may edit a collection reads its version history. Nobody else.

It wraps the **merged** access config in `accessPlugin.ts`, after `...collection.access` / `...global.access` — not inside `createAccessConfig`. An entity that overrides `update` gets that override in its version history too, and one that sets its own `readVersions` keeps it. Deriving it a step earlier would bind `readVersions` to an `update` the override had already replaced, which is the drift the delegation exists to prevent.

This is not Payload's default, and the default is the permissive one. `findVersions`, `findVersionByID` and `countVersions` consult `access.readVersions` alone — the published-only constraint in the `read` branch never runs for them. With `readVersions` unset, `executeAccess` falls back to "is anyone logged in", which an API key satisfies, so every draft on `pages`, `meditations`, `app-cards`, `events`, `clients` and the three translations globals was readable by any published client key — including one that cannot read the collection at all.

⚠ **`args.id` is dropped before delegating, and must be.** `findVersionByID` calls access with the *version row's* primary key, not the document's — two independent sequences that happen to overlap. Forwarded to `update`, every id-sensitive branch answers about the wrong document: the self-access bypass hands a client row `N` of `_clients_v` because its own id is `N`, and `userManagesDocument` grants any row whose number matches a page the caller manages. Dropping it makes `update` answer at the list level, which `findVersionByID` then ANDs with `{ id: { equals: <row> } }` itself.

⚠ **A `Where` from `update` must be translated before it reaches a versions query.** `update` returns a query over *documents*; every versions operation combines the access result straight into a query over the *versions* collection without remapping it, where a document's fields sit under `version.` and its id is `parent`. `appendVersionToQueryKey` (exported by `payload`, and what `replaceWithDraftIfAvailable` applies to the `read` result) is the mapping. Skip it and `{ id: { in: [7] } }` matches version *rows* by their own primary key — a wrong answer that still returns documents.

⚠ **Both derivations fail closed when there is no `update` to delegate to.** `withVersionHistoryAccess` and `withUnlockAccess` write `() => false` rather than returning the config untouched — an *unset* key is refilled from Payload's defaults with the permissive `Boolean(user)`, which is exactly how #719 and #748 shipped. `createAccessConfig` always assigns `update` and every `access:` under `src/collections` is field-level, so neither branch is reachable through `accessPlugin` today. `tests/unit/access-derived-grants.spec.ts` reaches them directly, so the direction is asserted rather than assumed.

Two consequences worth knowing:

- **A read-only manager no longer sees the History tab.** `/api/access` computes `readVersions` from this same function, so the admin UI follows. That is the intended behaviour change, not a regression.
- **Live preview is untouched.** It reads drafts through `find`/`findByID` with `draft: true`, which resolves against `read` and the preview-secret branch — never through a versions operation.

### Unlocking an account is edit authority (#748)

`withUnlockAccess` derives **`unlock`** from the collection's own `update` function, on every collection the plugin touches. Whoever may edit an account may clear its login lockout. Nobody else.

It wraps the **merged** access config in `accessPlugin.ts`, for the same reason `withVersionHistoryAccess` does: an override of `update` must carry into the unlock grant, and a collection that sets its own `unlock` keeps it.

Payload fills an *omitted* `unlock` from its collection defaults (`collections/config/defaults.js`) with `defaultAccess` — `Boolean(user)` — which a published client's API key satisfies. `unlockOperation` is the only reader, and `POST /:collection/unlock` is registered for every auth collection, so any client key could reset a locked manager's failed-attempt counter and defeat the brute-force lockout (`maxLoginAttempts: 5`, `lockTime: 10 min`). `clients` was already denied structurally by `disableLocalStrategy: true`, which throws `Forbidden` before the access check; `managers` was the live target.

⚠ **Nothing else needs the grant.** A lockout expires by itself once `lockUntil` passes, and a successful login then calls `resetLoginAttempts` with no access check. `unlock` is only the administrative shortcut that clears a lockout early, so denying it costs a non-admin nothing.

Two differences from `withVersionHistoryAccess`, both simplifications: `unlock` queries the **auth collection itself**, so a `Where` needs no `appendVersionToQueryKey` translation. And `unlockOperation` calls access with no `id` at all — the id is dropped anyway, so a future Payload that passes one cannot reach the self-access bypass and hand an account its own unlock.

**A non-admin manager no longer sees the admin panel's Force unlock button.** `getAccessResults` computes `unlock` for every auth collection with a `maxLoginAttempts`, and the auth edit view renders `force-unlock` only when that result is true — so the UI follows this function, exactly as the History tab followed `readVersions` in #719. That is the intended behaviour change, not a regression: before it, every logged-in manager saw the button.

Document locking is unrelated: that is the `payload-locked-documents` collection with its own access config, and it never reads `access.unlock`.

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
