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
// EventQualityInput is only used by the quality checks → define it there
// src/lib/eventQuality/types.ts
interface EventQualityInput {
  title?: unknown
  // ...
}
```

When a second consumer needs the type, extract it to `src/types/`.

## Never restate a shape `payload-types.ts` already generates

**A type describing stored data derives from `@/payload-types`; it is never hand-written beside it.** A restatement does not merely duplicate — it drifts _wider_ than the CMS, so it type-checks values the database then rejects. The `event.schedule` group was hand-written as `weekdays?: string[]` where the column enumerates `'MO' | … | 'SU'`, and `weekdays: ['Monday']` compiled for as long as that lasted (#671).

```typescript
// ✅ Derive — a new CMS value becomes a compile error here
export type EventSchedule = NonNullable<Event['schedule']>
export type ExclusionRange = NonNullable<EventSchedule['exclusions']>[number]

// ❌ Restate — silently accepts what the CMS refuses
export type RegionLevel = 'country' | 'region' | 'city' | 'venue'
```

This covers the **JSON-schema columns** too: a `jsonSchema` field generates an interface (`HttpsSahajcloudDevSchemas…Json`), and the hand-written interfaces sitting next to the schema are the same restatement one level down.

### A derived alias is local, and never re-exported

`Region['level']` is already a name. An alias for it earns its place **only where one file repeats it enough that the indexed form gets in the way** — and then it stays unexported in that file. Write `Region['level']` at a call site that names it once or twice.

```typescript
// ✅ Local shorthand where a file names the level nine times
type RegionLevel = Region['level']

// ❌ Export it, and a second module re-exports it, and now the shape has three homes
export type RegionLevel = Region['level']
export type { RegionLevel } // in some other file
```

A re-export chain is the failure this rule exists to prevent, one level up: the name outlives the derivation, so the next reader cannot see what it is derived _from_ and the next narrowing has several places to miss. Give a name of its own only to a shape that is genuinely not spellable from the generated type.

**A modifier applied to a derived name is still spellable, so it does not earn an alias.** `Partial<EventSchedule>` reads better than a name for it: the modifier says the shape is the familiar one minus its requirements, where an alias has to be looked up to learn the same thing. This one was called `EventScheduleInput` for one review round; it is written out at every call site now.

Some things are **not** restatements, so don't "fix" them:

- **A relationship.** `NotificationChannel` is the generated `platform` union _plus_ `'email'` — deriving it reads worse than the literal.
- **A deliberately loose input.** `EventQualityInput` is `unknown` for most fields because it is fed from three sources that share no generated type; narrowing it would break the fixtures for no gain.
- **A deliberate narrowing at a boundary.** A writer that only ever produces a subset may declare the subset — the Atlas importer's `ScheduleInput.endingType` is `'until'` where the column is `'count' | 'until'`, because the importer writes no `count` endings. Widening it back would lose that intent.

**Fix at the import site, not with a corrected re-export.** And when narrowing surfaces errors, fix them — a value that no longer type-checks is a value the CMS was already going to refuse. Where the boundary genuinely takes an arbitrary string (a seed reading a legacy dump), narrow it with a runtime membership test against the same list the Payload config installs, use the _narrowed_ value everywhere the raw one was used, and say so when the two differ — a substitution that changes what gets stored is not a detail to swallow.

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
