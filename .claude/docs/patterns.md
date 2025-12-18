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

## Field Factory Naming Convention

When creating factory functions that generate PayloadCMS field configurations, follow the lowercase camelCase pattern without `create` prefix.

### Convention

```typescript
// ✅ DO: Use lowercase camelCase without prefix
virtualUrlField({ collection, adapter })
previewUrlField({ collection })
slugField('title')

// ❌ DON'T: Use create* prefix
createVirtualUrlField()
createPreviewUrlField()

// ❌ DON'T: Use PascalCase
VirtualUrlField()
CreatePreviewUrlField()
```

### Rationale
- Aligns with PayloadCMS patterns (e.g., `slugField` from Payload's built-in utilities)
- Keeps the API surface consistent across the codebase
- Matches common field factory conventions in React/TypeScript ecosystems

### Locations
- URL field factories: `src/lib/storage/urlFields.ts`
- Custom field factories: `src/fields/`

### Examples in Codebase

```typescript
// src/collections/content/Meditations.ts
fields: [
  virtualUrlField({ collection: 'meditations', adapter: 'r2' }),
]

// src/collections/system/Frames.ts
fields: [
  previewUrlField({ collection: 'frames' }),
  frameUrlField({ collection: 'frames' }),
]
```

## Permission Checking Pattern

When implementing or modifying permission checks, follow these guidelines:

### For Collection-Level Access

```typescript
import { roleBasedAccess } from '@/lib/access'

export const MyCollection: CollectionConfig = {
  slug: 'my-collection',
  access: roleBasedAccess('my-collection'),
  // ... fields
}
```

### For Operation-Specific Checks

```typescript
import { hasPermission } from '@/lib/access'

const canUpdate = hasPermission({
  user,
  collection: 'meditations',
  operation: 'update',
  locale: req.locale,
})
```

### For Field-Level Access

```typescript
import { createFieldAccess } from '@/lib/access'

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

For related components (UI + wrapper, or component families), organize into a folder with barrel export.

### When to Use Folder Organization
- Component has multiple related files (UI + wrapper, sub-components)
- Types should be exported alongside component
- Component is registered in PayloadCMS config (needs default export)
- Want clean imports without exposing internal file structure
- Utility functions are shared between sub-components

### Pattern 1: Field Component (UI + Wrapper)

```
src/components/admin/
└── TagSelector/
    ├── index.ts              # Barrel export
    ├── TagSelector.tsx       # Pure UI component
    └── TagSelectorField.tsx  # PayloadCMS field wrapper
```

**Barrel Export (`index.ts`)**:
```typescript
export { TagSelector, type TagOption, type TagSelectorProps } from './TagSelector'
export { TagSelectorField } from './TagSelectorField'
export { default } from './TagSelectorField'  // Default for PayloadCMS component registration
```

### Pattern 2: View Component Family (Main + Sub-components)

```
src/components/admin/
└── Dashboard/
    ├── index.ts                    # Barrel export
    ├── Dashboard.tsx               # Main entry point
    ├── DefaultDashboard.tsx        # Sub-component
    ├── FathomDashboard.tsx         # Sub-component
    ├── MetricsDashboard.tsx        # Sub-component
    ├── InactiveAccountAlert.tsx    # Sub-component
    └── ProjectSelectionPrompt.tsx  # Sub-component
```

**Barrel Export (`index.ts`)**:
```typescript
export { default as Dashboard } from './Dashboard'
export { default as DefaultDashboard } from './DefaultDashboard'
export { default as FathomDashboard } from './FathomDashboard'
export { default as MetricsDashboard } from './MetricsDashboard'
export { default as InactiveAccountAlert } from './InactiveAccountAlert'
export { default as ProjectSelectionPrompt } from './ProjectSelectionPrompt'
export { default } from './Dashboard'  // Default for PayloadCMS view registration
```

### Pattern 3: Component with Utilities

```
src/components/admin/
└── ThumbnailCell/
    ├── index.ts                    # Barrel export
    ├── ThumbnailCell.tsx           # Main component
    ├── DirectUploadThumbnail.tsx   # Sub-component
    ├── RelationshipThumbnail.tsx   # Sub-component
    └── utils.ts                    # Shared utilities
```

**Barrel Export (`index.ts`)**:
```typescript
export { ThumbnailCell } from './ThumbnailCell'
export { DirectUploadThumbnail } from './DirectUploadThumbnail'
export { RelationshipThumbnail } from './RelationshipThumbnail'
export { getThumbnailDimensions } from './utils'
export { default } from './ThumbnailCell'
```

### PayloadCMS Registration

**Field Components**:
```typescript
// In collection config
admin: {
  components: {
    Field: '@/components/admin/TagSelector',  // Uses default export
  },
}
```

**View Components**:
```typescript
// In payload.config.ts
admin: {
  components: {
    views: {
      dashboard: {
        Component: '@/components/admin/Dashboard',  // Uses default export
      },
    },
  },
}
```

### Import Patterns

```typescript
// Import the main component (default export)
import Dashboard from '@/components/admin/Dashboard'

// Import specific sub-components
import { FathomDashboard, MetricsDashboard } from '@/components/admin/Dashboard'

// Import within the same folder (relative imports)
import DefaultDashboard from './DefaultDashboard'
import FathomDashboard from './FathomDashboard'
```

### Branding Components Example

For thematically related components that don't have a main entry point:

```
src/components/branding/
├── index.ts          # Barrel export
├── Icon.tsx
├── Logo.tsx
├── InlineLogo.tsx
└── ProjectTheme.tsx
```

**Barrel Export (`index.ts`)**:
```typescript
export { default as Icon } from './Icon'
export { default as Logo } from './Logo'
export { default as InlineLogo } from './InlineLogo'
export { default as ProjectTheme } from './ProjectTheme'
```

**Usage**:
```typescript
// Clean imports from consuming files
import { ProjectTheme } from './branding'
import { Icon, Logo } from '@/components/branding'
```

### Key Points

- **Default export**: Required for PayloadCMS component registration (fields, views, graphics)
- **Named exports**: Allow importing specific components without importing everything
- **Type exports**: Include alongside component exports for consumer convenience
- **Folder naming**: Match the main component name (e.g., `Dashboard/` contains `Dashboard.tsx`)
- **Utilities**: Place shared helper functions in `utils.ts` within the folder

## Payload File Upload Pattern

When programmatically uploading files to Payload CMS collections (upload collections like Media, Frames, or tag collections with SVG icons), use the buffer-based format:

### Correct Format

```typescript
// ✅ DO: Use buffer-based object format
const fileObject = {
  data: Buffer.from(fileContent, 'utf-8'),  // or Buffer from binary data
  mimetype: 'image/svg+xml',                 // appropriate MIME type
  name: 'filename.svg',                      // filename with extension
  size: buffer.length,                       // file size in bytes
}

await payload.create({
  collection: 'meditation-tags',
  data: { title: 'My Tag', slug: 'my-tag' },
  file: fileObject,
})
```

### Wrong Approach

```typescript
// ❌ DON'T: Use Web API File constructor
const file = new File([blob], 'filename.svg', { type: 'image/svg+xml' })

// This will fail with: "Expected the `input` argument to be of type
// `Uint8Array` or `ArrayBuffer`, got `undefined`"
```

### Helper Function Example

```typescript
private createFileObject(
  content: string | Buffer,
  filename: string,
  mimetype: string,
): { data: Buffer; mimetype: string; name: string; size: number } {
  const buffer = typeof content === 'string'
    ? Buffer.from(content, 'utf-8')
    : content
  return {
    data: buffer,
    mimetype,
    name: filename,
    size: buffer.length,
  }
}
```

### Key Points
- Payload expects Node.js Buffer, not Web API File/Blob
- Always include `data`, `mimetype`, `name`, and `size` properties
- For text files (SVG, JSON), use `Buffer.from(content, 'utf-8')`
- For binary files, read with `fs.readFile()` which returns Buffer directly
- This pattern works for all upload collections (Media, Frames, tag collections)

## PayloadCMS Trash (Soft Delete) Pattern

When working with collections that have `trash: true` enabled (Files, Images), understand how the delete API behaves:

### Collection Configuration

```typescript
export const Files: CollectionConfig = {
  slug: 'files',
  trash: true,  // Enables soft delete with deletedAt field
  // ...
}
```

### Delete API Behavior

When `trash: true` is enabled on a collection:

1. **First delete**: Soft deletes the item (sets `deletedAt` timestamp)
2. **Second delete** (on already-trashed item): Permanently deletes

```typescript
// Soft delete - moves to trash
await payload.delete({
  collection: 'files',
  id: fileId,
})

// Permanently delete - include trashed items in query
await payload.delete({
  collection: 'files',
  id: fileId,
  trash: true,  // Include trashed documents in operation
})
```

### Finding Trashed Items

```typescript
// Find items in trash
const trashedFiles = await payload.find({
  collection: 'files',
  where: {
    deletedAt: { exists: true },
  },
})

// Find non-trashed items (default behavior)
const activeFiles = await payload.find({
  collection: 'files',
  where: {
    deletedAt: { exists: false },
  },
})
```

### Delete Options Reference

From PayloadCMS types (`node_modules/payload/dist/collections/operations/local/delete.d.ts`):

```typescript
/**
 * When set to `true`, the operation will permanently delete both normal and trashed documents.
 * By default (`false`), only normal (non-trashed) documents will be permanently deleted.
 *
 * This argument has no effect unless `trash` is enabled on the collection.
 * @default false
 */
trash?: boolean;
```

### Key Points
- `deletedAt` field is automatically managed by Payload (not `_status`)
- Deleting an already-trashed item permanently removes it
- Use `trash: true` option to include trashed items in delete operations
- Admin UI shows a checkbox to skip trash and permanently delete

## PayloadCMS Custom Endpoints Pattern

When you need to combine data from multiple collections or perform complex server-side logic, use custom endpoints:

### Collection Configuration

```typescript
export const Frames: CollectionConfig = {
  slug: 'frames',
  endpoints: [
    {
      path: '/by-narrator/:narratorId',
      method: 'get',
      handler: async (req) => {
        const narratorId = req.routeParams?.narratorId as string

        if (!narratorId) {
          return Response.json({ error: 'Narrator ID required' }, { status: 400 })
        }

        // Server-side data joining - single request handles multiple operations
        const narrator = await req.payload.findByID({
          collection: 'narrators',
          id: narratorId,
          depth: 0,
        })

        if (!narrator) {
          return Response.json({ error: 'Narrator not found' }, { status: 404 })
        }

        const frames = await req.payload.find({
          collection: 'frames',
          where: { imageSet: { equals: narrator.gender } },
          limit: 100,
          depth: 0,
        })

        return Response.json(frames)
      },
    },
  ],
  // ... fields
}
```

### Client Usage

```typescript
// Single API call - no race conditions
const [{ data, isLoading, isError }] = usePayloadAPI(
  narratorId ? `/api/frames/by-narrator/${narratorId}` : '',
)
```

### When to Use Custom Endpoints
- Data from multiple collections needed together
- Complex filtering based on related document properties
- Avoiding N+1 query problems
- Eliminating client-side race conditions

### Key Points
- Endpoints receive full `req` object with `req.payload` for database operations
- Use `req.routeParams` to access URL parameters
- Return `Response.json()` for JSON responses
- Handle errors with appropriate HTTP status codes

## Avoiding Race Conditions with usePayloadAPI

The `usePayloadAPI` hook has a critical limitation: `initialParams` is captured on first render.

### Anti-Pattern (Race Condition)

```typescript
// ❌ DON'T: Chain fetches with useEffect + setParams
const [{ data: narrator }] = usePayloadAPI(narratorId ? `/api/narrators/${narratorId}` : '')
const [{ data: frames }, { setParams }] = usePayloadAPI('/api/frames')

useEffect(() => {
  if (narrator?.gender) {
    // This may not trigger a re-fetch reliably!
    setParams({ where: { imageSet: { equals: narrator.gender } } })
  }
}, [narrator?.gender, setParams])
```

### Correct Pattern (Custom Endpoint)

```typescript
// ✅ DO: Use a custom endpoint for server-side joining
const [{ data: frames, isLoading, isError }] = usePayloadAPI(
  narratorId ? `/api/frames/by-narrator/${narratorId}` : '',
)
```

### Why This Matters
- `initialParams` uses `useState` internally - only captured on mount
- `setParams` may not synchronize correctly with component lifecycle
- Race conditions are hard to debug and reproduce
- Custom endpoints eliminate the problem entirely
