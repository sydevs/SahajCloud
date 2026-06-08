---
paths:
  - src/types/**/*.ts
---

# Type Organization Rules

Rules for TypeScript type definitions and organization.

## When to Create Type Files (`src/types/`)

**DO create separate type files for:**

- Complex type hierarchies with 3+ related types
- Types used across multiple implementation files
- Types that form a cohesive domain (roles, users, permissions)

**DON'T create separate type files for:**

- Simple one-off types used in a single file
- Component-specific prop types
- Types tightly coupled to a specific implementation

## Co-location Principle

**If a type has a single consumer, co-locate it in the consumer's file.** Don't maintain a separate file in `src/types/` for types used by only one module.

```typescript
// ScheduleSubFields is only used by scheduleHooks.ts → define it there
// src/hooks/scheduleHooks.ts
interface ScheduleSubFields {
  firstDate?: string
  // ...
}
```

When a second consumer needs the type, extract it to `src/types/`.

## Type File Organization

```
src/types/
├── [domain].ts  # Domain-specific types (e.g., roles.ts, users.ts)
├── [shared].ts  # Cross-cutting types (e.g., api.ts, common.ts)
└── index.ts     # Optional: Re-export all types
```

## Import Order for Types

1. External package types (`from 'payload'`, `from 'react'`)
2. Internal type imports from `@/types/`
3. Internal type imports from other `@/` paths
4. Relative type imports

## Type Refactoring Workflow

### 1. Analysis

- Identify types to extract and their dependencies
- Check for circular dependencies
- Determine which types should move vs. stay

### 2. Create Type Files

- Create in `src/types/` with descriptive names
- Add JSDoc comments explaining purpose
- Group related types together

### 3. Move Types

- Move type definitions only (interfaces, types, enums)
- **Keep data/constants in original implementation files**
- Preserve documentation and comments

### 4. Update Imports

- Follow import order above
- Remove unused imports

### 5. Verify

- Run `npx tsc --noEmit` to check errors
- Run `pnpm lint` to catch issues

## Investigating Library Types

**Always check built-in types before creating custom interfaces:**

```bash
grep -r "export type <TypeName>" node_modules/<package>/dist/
grep -A 20 "export type <TypeName>" node_modules/<package>/dist/types.d.ts
```

### Example - PayloadCMS Types

```typescript
// DON'T: Create custom interface
interface SelectFieldConfig {
  name: string
  label?: string
  options?: Array<{ label: string; value: string }>
}

// DO: Use built-in PayloadCMS type
import type { SelectFieldClient } from 'payload'
const { name, label, options } = field as SelectFieldClient
```

### When to Use Custom Types

- Library doesn't provide the exact type you need
- You need a subset or extension of library types
- Creating domain-specific types that compose library types

## Separation of Types from Data

```typescript
// src/types/roles.ts - Type definitions
export type ManagerRole = 'editor' | 'translator'

// src/fields/PermissionsField.ts - Data/constants
import type { ManagerRole } from '@/types/roles'
export const MANAGER_ROLES = { ... }
```

## Global Type Declarations in Next.js

**Important**: Next.js doesn't reliably pick up root-level `.d.ts` files even when added to tsconfig `include`, because it uses its own TypeScript plugin.

### Pattern: Declare Types Inside `declare global {}`

When you need global types that Next.js won't pick up from external files, declare them in a `.d.ts` file within `src/`:

```typescript
// src/types/globals.d.ts
declare global {
  // Declare external/global types Next.js won't pick up from a root-level .d.ts
  // here — e.g. third-party globals or build-time constants.
  var __APP_BUILD_ID__: string | undefined
}

export {} // Makes this a module file
```

### Why This Works

- Files inside `src/` are automatically included by Next.js TypeScript plugin
- `declare global {}` inside a module file makes types truly global
- The `export {}` ensures the file is treated as a module (required for `declare global` to work)

### Anti-Patterns That Don't Work

| Approach                                        | Why It Fails                           |
| ----------------------------------------------- | -------------------------------------- |
| Adding root-level `.d.ts` to tsconfig `include` | Next.js TypeScript plugin ignores them |
| Triple-slash references to root files           | Not resolved by Next.js build          |
| `declare interface` outside `declare global {}` | In module files, doesn't become global |

### When to Use This Pattern

- Migrating away from deprecated `@types/*` packages
- Declaring third-party globals or build-time constants
- Any external type declarations that Next.js build doesn't recognize
