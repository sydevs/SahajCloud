# PayloadCMS Error Patterns

Stack-specific debugging patterns for PayloadCMS hooks, access control, types, and admin UI.

## Hook errors (beforeChange, afterChange, afterRead, etc.)

**Symptoms:** Save fails silently in admin, mutation returns 500, hook never fires.

**Where to look:**

- `req.payload.logger.error(...)` output → `.claude/skills/dev-server/state/server.log`
- Hook return value: most Payload hooks **must return the doc/data** — returning `undefined` silently drops the change
- `afterRead` hooks run on every read; if they throw, list/single-doc queries 500 with no body

**Common causes:**

- Hook mutates `data` but doesn't return it → return the data object
- Async hook missing `await` → promise rejection swallowed
- Hook depends on a relationship that wasn't populated → check `populate` / `depth` settings
- Hook called during seed / migration when expected fields don't exist yet → check `operation === 'create'`

## Access control errors

**Symptoms:** 403 Forbidden, "Not allowed to read", admin sees empty lists, API returns 401.

**Critical PayloadCMS access semantics:**

- Access functions return `boolean` OR `Where` clause (for filtering). **Confusing these creates bypasses or false denials.**
- Returning `true` = allow all; returning `{ user: { equals: req.user.id } }` = filter to user's own.
- Returning `false` = deny entirely (different from filtering to nothing).

**Where to look:**

- `src/plugins/access/*.ts` — composed access helpers
- `src/collections/Managers/Managers.ts` — RBAC roles, locale-based permissions
- `.claude/rules/access.md` — full access-control patterns

**Common causes:**

- API client missing required scope on `Clients` collection
- Locale restriction filtering out the requested locale
- Manager doesn't have permission for the collection × locale combo
- Access function checks `req.user` but call is from a hook with `req` not populated

## Type mismatch errors

**Symptoms:** TS errors after schema edit, field "doesn't exist on type", `payload-types.ts` out of sync.

**Where to look:**

- `src/payload-types.ts` (auto-generated — do NOT edit)
- `src/collections/<Name>.ts`, `src/fields/`, `src/lib/richEditor/blocks/`, `src/globals/`

**Fix:**

```bash
pnpm generate:types
```

If it hangs: schema is invalid. Check the most recently edited collection/field/global file for syntax errors.

If types still wrong after regen: a Lexical block, virtual field, or join field may need explicit type augmentation. See `.claude/rules/types.md` and `.claude/rules/collections.md`.

## Admin UI errors

**Symptoms:** Admin panel blank, "Failed to fetch admin config", custom field component throws, import map missing component.

**Where to look:**

- `src/app/(payload)/admin/importMap.js` (auto-generated — do NOT edit)
- Custom components in `src/components/admin/`

**Fix:**

```bash
pnpm generate:importmap
```

For custom field components:

- Server component must NOT use hooks / event handlers — pass props from server to client wrapper
- See `.claude/rules/admin-ui.md` for server vs. client component patterns

## Drafts / autosave / publishing

**Symptoms:** Changes don't appear in frontend, draft never publishes, `_status` field weird.

**Where to look:**

- Collection config: `versions: { drafts: true }`, `versions: { drafts: { autosave: true } }`
- Locale-specific publishing on `Pages` collection
- `_status` field: `draft` vs `published`

**Common causes:**

- Frontend query missing `draft: false` filter → showing drafts to public
- Autosave debounce interval (60s default) — recent edits not yet saved
- Migration didn't preserve `_status` field on existing rows

## Migrations / push mode

**Critical:** Push mode is disabled in this project. **Always create explicit migrations.**

```bash
# Ask the user to run this — it's interactive
pnpm payload migrate:create
```

See `.claude/rules/migrations.md` for the full migration workflow and the D1 PRAGMA foreign_keys gotcha.

## When to use Payload's MCP docs

For framework behavior questions (hook lifecycle, field types, access semantics), use:

```
mcp__payloadcms-docs__list_doc_sources
mcp__payloadcms-docs__fetch_docs
```

Faster than scanning the codebase for examples.
