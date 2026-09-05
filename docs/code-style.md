# Code Style Rules

Global code style guidelines for this codebase.

## File Naming Conventions

**IMPORTANT**: macOS ignores filename case, but TypeScript and Webpack builds do not. Always check exact casing when you import.

| Directory | Convention | Examples |
|-----------|------------|----------|
| `src/collections/` | PascalCase | `Managers.ts`, `Pages.ts` |
| `src/fields/` | camelCase | `permissionsField.ts`, `slugField.ts` |
| `src/lib/` | camelCase | `accessControl.ts`, `serverUrl.ts` |
| `src/components/` | PascalCase | `Dashboard.tsx`, `ProjectSelector.tsx` |
| `src/types/` | camelCase | `roles.ts`, `users.ts` |
| `src/lib/richEditor/blocks/` | PascalCase | `TextBoxBlock.ts`, `GalleryBlock.ts` |

## Import Order

ESLint enforces this group order, each separated by a blank line:

1. External type imports
2. External value imports
3. Internal (`@/...`) type imports
4. Internal value imports
5. Relative (`./...`) type imports
6. Relative value imports

Sort alphabetically by path within a group. A subpath sorts after its parent (`payload/shared` after `payload`):

```typescript
import type { JSONField } from 'payload'

import { toWords } from 'payload/shared'

import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
```

## After Code Changes

Always lint and fix TypeScript errors. Run `pnpm generate:types` after a schema change.

## Prefer built-in components

Check for an existing component before you build or style one. In the admin panel, prefer `@payloadcms/ui`'s built-ins (see `docs/rules/admin-ui.md` for the catalog). Hand-roll a component only when nothing built-in fits, and note what was missing.

## Prefer established dependencies over hand-rolled code

Reach for a well-established dependency before you write your own version of something it already does. Prefer, in order: a built-in platform API, then a mature and widely-used dependency, then hand-rolled code. Check a new dependency with the user first, weighing maintenance, popularity, bundle size, and license. When you do hand-roll something, say why.

## Icons (no emojis in UI)

Don't use an emoji as a UI icon. Use a real icon component, for controllable size, color, and accessibility. In admin components (`src/components/**`), prefer `@payloadcms/ui`'s theme-colored icons, and reach for [`lucide-react`](https://lucide.dev) only when one is missing. On the public frontend, use `lucide-react` always — Payload's icons need admin theme variables that don't exist there. Emails (`src/emails/**`) are the one exception (`docs/rules/email.md`): email clients don't render `<svg>`, so keep emoji or a hosted PNG.

## Editing generated output (migrations, payload-types.ts, importmap)

Change only what actually breaks, or what the spec requires. Don't add defensive null checks "just in case" — they inflate the diff and hide the real fix. If you add a second or third edit, ask whether it fixes a specific, named scenario. If not, revert it.

## Design preferences (soft)

Light defaults, not hard rules. Choose intentionally rather than defaulting to the first shape that comes to mind.

- **Name an extracted helper's parameters for their role**, not the first caller's domain. This lets other callers reuse it with no renaming (`resolveThumbnailUrl({ primaryOverride, fallback })`, not `{ clipOverride, parentMetadataUrl }`).
- **Prefer a discriminated union over shared `| null` fields** when a type spans variants with different shapes, so callers get exhaustive narrowing. Example: `ViewerItem` in `src/endpoints/lecturesForViewer.ts`.

## Debugging library-integration bugs

When a bug suggests a third-party plugin or SDK isn't doing what you assumed, read the compiled source in `node_modules/` before you theorize. Runtime behavior often differs from the README, especially for Payload plugins. Find the entry point with `ls node_modules/<pkg>/dist/`, then grep for the method names you call. See the `handleUpload` contract in `docs/rules/storage.md` for an example this approach found. Reach for external docs instead when you need a new feature's contract before you've used it.
