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

1. External package types (`from 'payload'`, `from 'react'`)
2. Internal type imports from `@/types/`
3. Internal type imports from other `@/` paths
4. Relative type imports

## After Code Changes

Always lint and fix TypeScript errors:
```bash
pnpm lint
pnpm generate:types  # After schema changes
```

## Code Quality Commands

```bash
pnpm lint              # Run ESLint
pnpm generate:types    # Generate types from Payload schema
pnpm generate:importmap  # Generate import map for admin panel
```
