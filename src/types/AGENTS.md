# Type Organization Rules

Rules for TypeScript type definitions and organization.

## When to create type files (`src/types/`)

**Do** create a separate type file for:

- A complex type hierarchy with 3+ related types
- Types used across multiple implementation files
- Types that form a cohesive domain (roles, users, permissions)

**Don't** create one for:

- A simple one-off type used in a single file
- Component-specific prop types
- Types tightly coupled to one implementation

## Co-location principle

**A type with a single consumer belongs in that consumer's file.** Don't
keep a separate `src/types/` file for a type only one module uses.

```typescript
// EventQualityInput is only used by the quality checks → define it there
// src/lib/eventQuality/types.ts
interface EventQualityInput {
  title?: unknown
  // ...
}
```

Extract it to `src/types/` once a second consumer needs it.

## Never restate a shape `payload-types.ts` already generates

**A type describing stored data derives from `@/payload-types`. Never
hand-write it beside that file.** A restatement drifts _wider_ than the CMS,
so it type-checks values the database then rejects. The `event.schedule`
group was hand-written as `weekdays?: string[]` where the column enumerates
`'MO' | … | 'SU'`, and `weekdays: ['Monday']` compiled for as long as that
lasted (#671).

```typescript
// ✅ Derive — a new CMS value becomes a compile error here
export type EventSchedule = NonNullable<Event['schedule']>
export type ExclusionRange = NonNullable<EventSchedule['exclusions']>[number]

// ❌ Restate — silently accepts what the CMS refuses
export type RegionLevel = 'country' | 'region' | 'city' | 'venue'
```

This also covers **JSON-schema columns**: a `jsonSchema` field generates an
interface, named after the schema's `title` (`LectureMetadata`) or, with no
title, its `$id` (`HttpsSahajcloudDevSchemas…Json`). A hand-written interface
next to that schema is the same restatement, one level down — import the
generated one instead, as `nirmalaVidya.ts` and `lectureShape.ts` do.

### A derived alias stays local, and is never re-exported

`Region['level']` is already a name. Give it an alias **only where one file
repeats it enough that the indexed form gets in the way** — and keep that
alias unexported in that file. Write `Region['level']` at a call site that
names it once or twice.

```typescript
// ✅ Local shorthand where a file names the level nine times
type RegionLevel = Region['level']

// ❌ Export it, and a second module re-exports it — now the shape has three homes
export type RegionLevel = Region['level']
export type { RegionLevel } // in some other file
```

A re-export chain is exactly the failure this rule prevents, one level up:
the name outlives its derivation, so the next reader cannot see what it
came from, and the next narrowing has several places to miss. Give a shape
its own name only when it is genuinely not spellable from the generated
type.

**A modifier applied to a derived name is still spellable, so it earns no
alias.** `Partial<EventSchedule>` reads better than a name for it — the
modifier says the shape is the familiar one minus its requirements, where an
alias must be looked up to learn the same thing.

Some things are **not** restatements — don't "fix" them:

- **A relationship.** `NotificationChannel` is the generated `platform`
  union _plus_ `'email'` — deriving it reads worse than the literal.
- **A deliberately loose input.** `EventQualityInput` is `unknown` for most
  fields because it is fed from three sources sharing no generated type.
- **A deliberate narrowing at a boundary.** A writer that only ever
  produces a subset may declare the subset — the Atlas importer's
  `ScheduleInput.endingType` is `'until'` where the column is `'count' |
  'until'`, because the importer writes no `count` endings.
- **A shape a `localized` field cannot generate.** Payload generates the
  single-locale type for a localized field, so a value carrying every
  locale at once is not spellable from it. `TypedAuthUser.roles` is
  `RoleSlug[] | Record<LocaleCode, RoleSlug[]>` because
  `hydrateLocalizedRoles` builds that record during authentication (#665).
  Replacing it with `Pick<Manager, 'roles'>` compiles and silently drops
  every locale but the default. Its three siblings on that type —
  `currentProject`, `type`, `_status` — are picks, so the exception is the
  member, never the type (#671).

**Fix at the import site, not with a fixed re-export.** When narrowing
surfaces errors, fix them — a value that no longer type-checks is a value
the CMS was already going to refuse. Where a boundary genuinely takes an
arbitrary string (a seed reading a legacy dump), narrow it with a runtime
membership test against the same list the Payload config installs. Use the
_narrowed_ value everywhere the raw one was used, and flag it when the two
differ — a substitution that changes what gets stored is never a detail to
swallow silently.

## Type file organization

```
src/types/
├── [domain].ts  # Domain-specific types (e.g., roles.ts, users.ts)
├── [shared].ts  # Cross-cutting types (e.g., api.ts, common.ts)
└── index.ts     # Optional: re-export all types
```

## Import order for types

1. External package types (`from 'payload'`, `from 'react'`)
2. Internal type imports from `@/types/`
3. Internal type imports from other `@/` paths
4. Relative type imports

## Type refactoring workflow

1. **Analyze** — identify the types to extract, check for circular
   dependencies, decide what moves vs. stays.
2. **Create type files** — in `src/types/`, with descriptive names and JSDoc
   comments. Group related types together.
3. **Move types only** — interfaces, types, enums. Keep data/constants in
   the original implementation files. Preserve comments.
4. **Update imports** — follow the order above. Remove unused imports.
5. **Check** — run `npx tsc --noEmit`, then `pnpm lint`.

## Investigating library types

**Check built-in types before writing a custom interface:**

```bash
grep -r "export type <TypeName>" node_modules/<package>/dist/
grep -A 20 "export type <TypeName>" node_modules/<package>/dist/types.d.ts
```

```typescript
// ❌ DON'T: write a custom interface
interface SelectFieldConfig {
  name: string
  label?: string
  options?: Array<{ label: string; value: string }>
}

// ✅ DO: use the built-in PayloadCMS type
import type { SelectFieldClient } from 'payload'
const { name, label, options } = field as SelectFieldClient
```

Write a custom type only when the library has no exact match, you need a
subset or extension of a library type, or you are composing a domain-
specific type from library types.

## Separation of types from data

```typescript
// src/types/roles.ts - Type definitions
export type ManagerRole = 'editor' | 'translator'

// src/fields/PermissionsField.ts - Data/constants
import type { ManagerRole } from '@/types/roles'
export const MANAGER_ROLES = { ... }
```

## Global type declarations in Next.js

Next.js does not reliably pick up root-level `.d.ts` files, even when added
to `tsconfig`'s `include` — it uses its own TypeScript plugin.

**Fix**: declare global types inside `declare global {}`, in a `.d.ts` file
under `src/` (files there are automatically included by the Next.js
TypeScript plugin, and `declare global {}` inside a module file makes the
type truly global):

```typescript
// src/types/globals.d.ts
declare global {
  // Declare external/global types Next.js won't pick up from a root-level .d.ts
  // here — e.g. third-party globals or build-time constants.
  var __APP_BUILD_ID__: string | undefined
}

export {} // Makes this a module file
```

`export {}` is required — it is what makes `declare global` take effect.

| Approach that does not work | Why |
| ----------------------------------------------- | --------------------------------------- |
| Adding a root-level `.d.ts` to tsconfig `include` | The Next.js TypeScript plugin ignores it |
| A triple-slash reference to a root file | Not resolved by the Next.js build |
| `declare interface` outside `declare global {}` | Does not become global in a module file |

Use this pattern to migrate away from deprecated `@types/*` packages, to
declare third-party globals or build-time constants, or for any external
type declaration the Next.js build does not recognize.
