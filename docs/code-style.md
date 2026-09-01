# Code Style Rules

Global code style guidelines for this codebase.

## File Naming Conventions

**IMPORTANT**: macOS is case-insensitive but TypeScript/Webpack builds are case-sensitive. Always verify exact file casing when importing.

| Directory | Convention | Examples |
|-----------|------------|----------|
| `src/collections/` | PascalCase | `Managers.ts`, `Pages.ts` |
| `src/fields/` | camelCase | `permissionsField.ts`, `slugField.ts` |
| `src/lib/` | camelCase | `accessControl.ts`, `serverUrl.ts` |
| `src/components/` | PascalCase | `Dashboard.tsx`, `ProjectSelector.tsx` |
| `src/types/` | camelCase | `roles.ts`, `users.ts` |
| `src/lib/richEditor/blocks/` | PascalCase | `TextBoxBlock.ts`, `GalleryBlock.ts` |

## Import Order

The ESLint config enforces a specific import order. Follow these groups (separated by blank lines):

1. **External type imports** (`import type { ... } from 'payload'`)
2. **External value imports** (`import { ... } from 'payload'`, `from 'react'`)
   - Subpath imports sort alphabetically with their parent (e.g., `payload/shared` sorts after `payload`)
3. **Internal type imports** (`import type { ... } from '@/...'`)
4. **Internal value imports** (`import { ... } from '@/...'`)
5. **Relative type imports** (`import type { ... } from './...'`)
6. **Relative value imports** (`import { ... } from './...'`)

Within each group, sort alphabetically by module path. Type-only imports (`import type`) come before value imports from the same scope.

```typescript
// Example: correct import order
import type { JSONField } from 'payload'

import { toWords } from 'payload/shared'
import React, { useCallback, useMemo } from 'react'

import type { RuleDefinition, RulesValue } from '@/fields/rulesField'

import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
```

## After Code Changes

Always lint and fix TypeScript errors:
```bash
pnpm lint
pnpm generate:types  # After schema changes
```

## Prefer built-in components

Before building or styling a UI component, check for an existing one and reuse
it — fewer custom components means less maintenance and a consistent look.
In the **admin panel**, prefer `@payloadcms/ui`'s built-ins (Banner, Pill,
Table, Card, Tooltip, Drawer, Button, field primitives, icons, …); the catalog
+ rule live in `src/components/admin/AGENTS.md`. Only hand-roll a custom-styled
component when no built-in fits, and note what was missing.

## Prefer established dependencies over hand-rolled code

Reach for a well-established dependency before writing our own version of
something it already does. The goal is a **slim, maintainable** project that
leans on battle-tested libraries — less code we own, fewer edge cases we have to
get right ourselves, and behaviour the wider ecosystem already validates.

- **Order of preference:** built-in platform API → a mature, widely-used
  dependency → hand-rolled code as a last resort. Examples:
  `AbortSignal.timeout()` / `AbortSignal.any()` over a custom fetch-timeout
  wrapper; `p-map` / `p-retry` over a hand-written semaphore or retry loop;
  `pg.escapeIdentifier()` over a bespoke identifier allowlist.
- **New dependencies must be confirmed with the user** before adding — but they
  should *always be considered*. Weigh maintenance, popularity/upkeep, bundle
  size, and license; a small, widely-used, actively-maintained library usually
  beats code we'd have to own and debug forever.
- When you do hand-roll (no suitable dependency, or the dep isn't worth it), say
  so and why — the same way we note a missing built-in component above.

## Icons (no emojis in UI)

Don't use emojis as UI icons. Use a real icon component so size, colour, and
accessibility are controllable and rendering is consistent:

- **Payload admin components** (`src/components/**`, custom fields/views/cells):
  prefer the icons already shipped by `@payloadcms/ui` — `WarningIcon`,
  `ErrorIcon`, `InfoIcon`, `SuccessIcon`, `CalendarIcon`, `CheckIcon`,
  `ExternalLinkIcon`, etc. They're theme-coloured (`--theme-*`) and add no new
  dependency. Reach for `lucide-react` only when `@payloadcms/ui` lacks the glyph.
- **Public frontend / non-admin React** (`src/app/(frontend)/**`): use
  [`lucide-react`](https://lucide.dev) (`<TriangleAlert size={20} color="…" />`).
  Payload's icons colour themselves from admin `--theme-*` variables that don't
  exist outside the admin, so they render wrong on public pages — use lucide there.
- **Emails** (`src/emails/**`): the exception — see `src/plugins/email/AGENTS.md`.
  Email clients don't render `<svg>`, so icon libraries (lucide / Payload) won't
  work; keep emoji or use a hosted PNG via react-email's `<Img>`.

`lucide-react` is the project's icon library for HTML UI. Don't introduce a
second one.

## Editing generated output (migrations, payload-types.ts, importmap, etc.)

When you need to patch a generated file, change only what actually breaks or what the spec explicitly requires. Don't add defensive NULL-ing, redundant cleanups, or cascading safety edits "just in case" — they inflate the diff, obscure the real fix, and are the first thing a reviewer will push back on. If you catch yourself adding a second or third edit, stop and ask: *would this change fail a specific, named scenario?* If not, revert it.

## Design preferences (soft)

These aren't hard rules — they're light defaults worth considering when a situation arises. Call them out and pick intentionally rather than defaulting to the first shape that comes to mind.

- **Abstract parameter names in extracted helpers.** When you pull a helper out of its first caller, name its parameters for the *role* they play, not the domain of that caller. `resolveThumbnailUrl({ primaryOverride, secondaryOverride, fallback })` beats `{ clipOverride, parentOverride, parentMetadataUrl }` — lectures can reuse the former with no arg rewiring, and the shape stays meaningful at call sites with a short comment.
- **Discriminated unions over `| null` shared fields.** When a response/object type spans multiple variants with known per-variant shapes, prefer a proper discriminated union keyed on the variant (`type`) over a flat struct with nullable fields that only one variant ever populates. Callers get exhaustive narrowing; readers see the variant contract explicitly. Example: `ViewerItem` in `src/endpoints/lecturesForViewer.ts` — the `lecture` variant has `parentId: null, endTime: null` pinned as literal types; the `clip` variant has `parentId: number, endTime: number` required.

## Code Quality Commands

```bash
pnpm lint              # Run ESLint
pnpm generate:types    # Generate types from Payload schema
pnpm generate:importmap  # Generate import map for admin panel
```

## Debugging library-integration bugs

When a bug's symptoms suggest a third-party plugin / hook / SDK isn't
doing what you assumed, **read the compiled library source in
`node_modules/`** before theorizing. Actual runtime behavior often differs
from README/docs, especially for PayloadCMS plugins, Next.js internals,
and Cloudflare SDKs.

Practical approach:

- `ls node_modules/<pkg>/dist/` to find entry points.
- Open the relevant hook/handler file directly with `Read`.
- Grep for the method names you're calling (`handleUpload`, `beforeChange`,
  ...) to see how the library invokes them and what it does with the
  return value.

Often faster than fetching external docs and catches behavior the docs
don't describe — e.g. "the cloud-storage plugin only persists via return
values, not mutation" — undocumented but unambiguous from three lines of
source. (See the `handleUpload` return-value contract in
`src/plugins/storage/AGENTS.md` for the canonical example.)

**When external docs are better**: researching *new* features or APIs
you haven't used yet, where you need the canonical contract before
writing code. For *debugging*, local source wins.
