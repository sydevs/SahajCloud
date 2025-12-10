# Common Code Patterns

This document covers recurring patterns and best practices for common development tasks in this codebase.

## Type Refactoring Pattern

When refactoring types into separate files, follow this systematic approach:

### 1. Analysis
- Identify types to extract and their dependencies
- Check for circular dependencies
- Determine which types should move vs. which should stay

### 2. Create Type Files
- Create new files in `src/types/` with descriptive names
- Add JSDoc comments explaining the purpose
- Group related types together

### 3. Move Types
- Move type definitions only (interfaces, types, enums)
- Keep data/constants in original implementation files
- Preserve all documentation and comments

### 4. Update Imports
- Update all files importing the types
- Follow proper import order (external → @/types → @/lib → relative)
- Remove unused imports

### 5. Type Casting
- Add necessary type assertions for complex union types
- Use `as` assertions where TypeScript can't infer types
- Document why casting is needed with inline comments

### 6. Test
- Run `npx tsc --noEmit` to check TypeScript errors
- Run `pnpm lint` to catch linting issues
- Run `pnpm test:int` to verify all tests pass

### 7. Document
- Update CLAUDE.md if establishing new patterns
- Add Architecture Decision Record if significant
- Update JSDoc comments in affected files

### Example

```typescript
// Before: Types mixed with implementation
export type ManagerRole = 'editor' | 'translator'
export const MANAGER_ROLES = { ... }

// After: Types separated
// src/types/roles.ts
export type ManagerRole = 'editor' | 'translator'

// src/fields/PermissionsField.ts
import type { ManagerRole } from '@/types/roles'
export const MANAGER_ROLES = { ... }
```

## Investigating Library Types Before Creating Custom Interfaces

When working with third-party libraries (PayloadCMS, React, etc.), always investigate built-in types before creating custom interfaces:

### Investigation Process

1. Check library's TypeScript definitions in `node_modules/<package>/dist/*.d.ts`
2. Use grep to search for relevant type names:
   ```bash
   grep -r "export type <TypeName>" node_modules/<package>/dist/
   grep -A 20 "export type <TypeName>" node_modules/<package>/dist/types.d.ts
   ```
3. Examine the full type definition to understand structure and properties
4. Check for related types (e.g., `SelectFieldClient` vs `SelectField`, `Option` vs `OptionObject`)

### Example - PayloadCMS Field Types

```typescript
// ❌ DON'T: Create custom interface without checking library types
interface SelectFieldConfig {
  name: string
  label?: string
  options?: Array<{ label: string; value: string }>
}

// ✅ DO: Use built-in PayloadCMS type
import type { SelectFieldClient } from 'payload'

const { name, label, options } = field as SelectFieldClient
```

### When to Use Custom Types
- Library doesn't provide the exact type you need
- You need a subset or extension of library types
- Creating domain-specific types that compose library types

### Benefits
- Ensures compatibility with library updates
- Avoids type mismatches and conversion issues
- Leverages library's type safety and documentation

## Permission Checking Pattern

When implementing or modifying permission checks, follow these guidelines:

### For Collection-Level Access

```typescript
import { roleBasedAccess } from '@/lib/accessControl'

export const MyCollection: CollectionConfig = {
  slug: 'my-collection',
  access: roleBasedAccess('my-collection'),
  // ... fields
}
```

### For Operation-Specific Checks

```typescript
import { hasPermission } from '@/lib/accessControl'

const canUpdate = hasPermission({
  user,
  collection: 'meditations',
  operation: 'update',
  locale: req.locale,
})
```

### For Field-Level Access

```typescript
import { createFieldAccess } from '@/lib/accessControl'

fields: [
  {
    name: 'title',
    type: 'text',
    localized: true,
    access: createFieldAccess('pages', true), // second param: localized
  }
]
```

### Key Considerations
- Remember implicit read access for managers (any role grants read to non-restricted collections)
- Use locale-aware permissions for managers (checks `req.locale`)
- Consider document-level permissions via `customResourceAccess`
- API clients never get delete access, even with manage-level permissions
- Restricted collections (managers, clients, payload-jobs) are admin-only

## Access Control Implementation Pattern

When adding new roles or modifying permissions:

### 1. Define Role

In `MANAGER_ROLES` or `CLIENT_ROLES` (src/fields/PermissionsField.ts):

```typescript
export const MANAGER_ROLES: Record<ManagerRole, ManagerRoleConfig> = {
  'my-new-role': {
    slug: 'my-new-role',
    label: 'My New Role',
    description: 'Can do specific things',
    project: 'wemeditate-web', // for manager roles only
    permissions: {
      'my-collection': ['read', 'create', 'update'],
      'media': ['read', 'create'],
    },
  },
}
```

### 2. Update Collection Config

With `roleBasedAccess()`:

```typescript
export const MyCollection: CollectionConfig = {
  slug: 'my-collection',
  access: roleBasedAccess('my-collection'),
  // ... rest of config
}
```

### 3. Test with Different User Roles

```typescript
// Create test manager with role
const manager = await testData.createManager(payload, {
  roles: ['my-new-role']
})

// Verify permissions
const canCreate = hasPermission({
  user: manager,
  collection: 'my-collection',
  operation: 'create'
})
expect(canCreate).toBe(true)
```

### 4. Document Role Capabilities

In CLAUDE.md under Role-Based Access Control section

### 5. Update Project Visibility

If role is project-specific:

```typescript
admin: {
  hidden: handleProjectVisibility(['wemeditate-web']),
}
```

## TodoWrite Usage Pattern

For complex refactoring or multi-step tasks, use TodoWrite to track progress:

### Granular Task Breakdown

```typescript
TodoWrite({
  todos: [
    {
      content: "Create src/types/roles.ts with ManagerRole and ClientRole",
      status: "in_progress",
      activeForm: "Creating roles.ts"
    },
    {
      content: "Update imports in PermissionsField.ts to use @/types/roles",
      status: "pending",
      activeForm: "Updating PermissionsField.ts"
    },
    {
      content: "Replace MergedPermissions with correct type in accessControl.ts",
      status: "pending",
      activeForm: "Updating accessControl.ts"
    },
    {
      content: "Run TypeScript check and fix errors",
      status: "pending",
      activeForm: "Running TypeScript check"
    },
  ]
})
```

### Best Practices
- Break down complex tasks into specific, actionable items
- Mark tasks completed immediately after finishing (don't batch)
- Use descriptive activeForm for current work visibility
- Include file names and specific changes in task descriptions
- Limit to ONE in_progress task at a time

## Component Folder Organization Pattern

For related components (UI + wrapper, or component families), organize into a folder with barrel export:

### Folder Structure

```
src/components/admin/
└── TagSelector/
    ├── index.ts              # Barrel export
    ├── TagSelector.tsx       # Pure UI component
    └── TagSelectorField.tsx  # PayloadCMS field wrapper
```

### Barrel Export (`index.ts`)

```typescript
export { TagSelector, type TagOption, type TagSelectorProps } from './TagSelector'
export { TagSelectorField } from './TagSelectorField'
export { default } from './TagSelectorField'  // Default for PayloadCMS component registration
```

**Key Points**:
- Export types alongside components for consumer convenience
- Default export should be the PayloadCMS-integrated component (for `admin.components.Field` registration)
- Named exports allow importing specific components when needed

### Collection Registration

```typescript
// In collection config
admin: {
  components: {
    Field: '@/components/admin/TagSelector',  // Uses default export (TagSelectorField)
  },
}
```

### Import Patterns

```typescript
// Import the field wrapper (default export)
import TagSelectorField from '@/components/admin/TagSelector'

// Import specific components or types
import { TagSelector, type TagOption } from '@/components/admin/TagSelector'

// Import everything
import { TagSelector, TagSelectorField, type TagOption, type TagSelectorProps } from '@/components/admin/TagSelector'
```

### When to Use Folder Organization
- Component has multiple related files (UI + wrapper, sub-components)
- Types should be exported alongside component
- Component is registered in PayloadCMS config (needs default export)
- Want clean imports without exposing internal file structure
