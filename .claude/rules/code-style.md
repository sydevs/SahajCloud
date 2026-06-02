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
`.claude/rules/storage.md` for the canonical example.)

**When external docs are better**: researching *new* features or APIs
you haven't used yet, where you need the canonical contract before
writing code. For *debugging*, local source wins.
