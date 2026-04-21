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
| `src/blocks/` | PascalCase | `TextBoxBlock.ts`, `GalleryBlock.ts` |

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

## Code Quality Commands

```bash
pnpm lint              # Run ESLint
pnpm generate:types    # Generate types from Payload schema
pnpm generate:importmap  # Generate import map for admin panel
```
