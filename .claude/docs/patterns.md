# Common Code Patterns

This document covers recurring patterns and best practices for common development tasks in this codebase.

**Note**: Type organization, component patterns, and access control patterns are now in `.claude/rules/` for auto-loading when working with relevant files.

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

## Schema Introspection Pattern

When you need to discover which fields reference a particular collection (e.g., finding all fields that reference `files` or `images`), use the schema introspection utilities in `src/lib/schemaUtils.ts`.

### Use Case: Orphan Detection

The `CleanupOrphanedMedia` job uses schema introspection to auto-discover all references to files/images without hardcoding collection/field knowledge:

```typescript
import {
  discoverReferencesForCollection,
  extractIdsFromDocument,
  extractIdsFromLexicalContent,
  groupByCollection,
} from '@/lib/schemaUtils'

// Discover all fields that reference 'files' collection
const fileRefs = discoverReferencesForCollection(payload, 'files')
// Returns: [
//   { collection: 'lessons', fieldPath: 'introAudio', fieldType: 'upload', ... },
//   { collection: 'lessons', fieldPath: 'panels.*.media', fieldType: 'upload', ... },
// ]

// Group by source collection for efficient scanning
const byCollection = groupByCollection(fileRefs)

// Extract IDs from documents using discovered field paths
for (const [collectionSlug, refs] of byCollection) {
  const docs = await payload.find({ collection: collectionSlug, limit: 1000 })
  for (const doc of docs.docs) {
    for (const ref of refs) {
      const ids = extractIdsFromDocument(doc, ref)
      // ids is a Set<number> of referenced IDs
    }
  }
}
```

### Supported Field Container Types

The schema introspection traverses all Payload CMS field container types:

| Container | Traversal | Example Path |
|-----------|-----------|--------------|
| Simple | Direct field | `lessons.introAudio` |
| Tabs | `tabs[].fields[]` | Fields inside named/unnamed tabs |
| Groups | `group.fields[]` | Nested group fields |
| Rows | `row.fields[]` | Layout row fields |
| Arrays | `array.fields[]` + wildcard | `panels.*.media` |
| Blocks | `blocks[].fields[]` | PayloadCMS blocks fields |
| Collapsible | `collapsible.fields[]` | Expandable sections |
| RichText | Generic Lexical traversal | `content` (marker reference) |

### Handling Lexical Rich Text Fields

Lexical editor blocks can contain upload/relationship fields, but their definitions are complex to access at runtime. The solution is **generic content traversal**:

```typescript
// Schema introspection creates a "marker" reference for richText fields
// { collection: 'pages', fieldPath: 'content', isLexicalBlock: true }

// At scan time, use generic traversal to find all IDs in Lexical content
const lexicalContent = doc.content
const ids = extractIdsFromLexicalContent(lexicalContent)
// Finds all numeric IDs in block fields (TextBoxBlock.image, GalleryBlock.items, etc.)
```

The generic traversal:
1. Recursively walks the Lexical content tree
2. Identifies block nodes (`type: 'block'`)
3. Scans all non-metadata fields for numeric ID values
4. Handles both direct IDs and arrays of objects with nested IDs

### Key Points
- Use `discoverReferencesForCollection()` to auto-discover field references
- Wildcard `*` in field paths represents array indices (e.g., `panels.*.media`)
- Lexical blocks use generic content traversal instead of block-specific introspection
- The `isLexicalBlock` flag indicates a richText field needing special handling
- This pattern eliminates hardcoded collection/field knowledge for maintenance-free discovery

## Storage Adapter Naming Pattern

When creating or renaming storage adapters and their associated URL fields:

### Naming Convention
- **Adapter**: `<purpose>Adapter` (e.g., `mixedMediaAdapter`, `cloudflareImagesAdapter`)
- **URL Field Factory**: `<purpose>UrlField` (e.g., `mixedMediaUrlField`, `virtualUrlField`)
- **Config Interface**: `<AdapterName>Config` (e.g., `MixedMediaAdapterConfig`)

### Shared Logic Extraction
When adapter and URL field need identical routing logic, extract to shared utility:

```typescript
// src/lib/storage/mimeUtils.ts
export type MimeCategory = 'image' | 'video' | 'other'

export function getMimeCategory(mimeType: string | undefined): MimeCategory {
  if (!mimeType) return 'other'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'other'
}
```

### Adapter Factory Pattern

```typescript
export const mixedMediaAdapter = (config: MixedMediaAdapterConfig): Adapter => {
  const { routes, r2Adapter } = config

  return {
    name: 'mixed-media-adapter',
    handleUpload: async (args) => {
      const { file, data } = args
      const category = getMimeCategory(file.mimetype)

      // Route to appropriate adapter
      for (const [prefix, adapter] of Object.entries(routes)) {
        if (file.mimetype?.startsWith(prefix)) {
          return adapter.handleUpload(args)
        }
      }

      // Default to R2 for 'other' category
      return r2Adapter.handleUpload(args)
    },
    // ... other adapter methods
  }
}
```

### Key Points
- Always use shared utility for routing logic used by both adapter and URL field
- Name interface parameters clearly (e.g., `r2Adapter` not `default`)
- Update barrel exports in `index.ts` when renaming
- Update storagePlugin.ts collection configurations

## Common JavaScript Pitfalls

### parseInt Parses Partial Strings

**Problem**: `parseInt()` parses the initial numeric portion of a string, ignoring non-numeric suffixes:

```typescript
// ❌ Unexpected behavior
parseInt('123abc', 10)           // Returns 123, not NaN!
parseInt('1748234234_abcdef', 10) // Returns 1748234234, not NaN!
```

This caused a subtle bug in schema introspection where Lexical block item IDs like `'1748234234_abcdef'` were incorrectly parsed as valid numeric IDs.

**Solution**: Use a regex to validate fully numeric strings before parsing:

```typescript
// ✅ Correct: Validate string is fully numeric
function isNumericString(str: string): boolean {
  return /^\d+$/.test(str)
}

function extractId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && isNumericString(value)) {
    return parseInt(value, 10)
  }
  // ... handle objects with .id property
  return null
}
```

### Key Points
- Always validate strings are fully numeric before using `parseInt()`
- Use `/^\d+$/` regex to check for digits-only strings
- This applies when extracting IDs from mixed data structures
- See `src/lib/schemaUtils.ts` for the production implementation

## External API Response Validation with Zod

When integrating with external APIs (like Cloudflare, Stripe, etc.), use Zod schemas for runtime validation instead of TypeScript type assertions.

### Why Use Zod for API Validation?

**Benefits**:
1. **Runtime Type Safety**: Catches API contract changes immediately
2. **Better Error Messages**: Zod provides detailed path-based validation errors
3. **Self-Documenting**: Schemas serve as living API documentation
4. **Type Inference**: Single source of truth for both runtime and TypeScript types
5. **Industry Standard**: Widely adopted (Next.js, Vercel, T3 Stack)

**Anti-Pattern** (Type Assertions):
```typescript
// ❌ DON'T: No runtime validation
interface ApiResponse {
  success: boolean
  errors?: Array<{ message: string }>
  result?: { id: string }
}

const result = (await response.json()) as ApiResponse

if (!result.success) {
  const errors = result.errors?.map((e) => e.message).join(', ') || 'Unknown error'
  throw new Error(`API failed: ${errors}`)
}

// result.result.id might be undefined!
const id = result.result?.id
if (!id) {
  throw new Error('Response missing ID')
}
```

### Pattern: Centralized Zod Schemas

**Step 1**: Create a schemas file (e.g., `src/lib/storage/cloudflareSchemas.ts`):

```typescript
import { z } from 'zod'

/**
 * Common API error schema
 */
export const ApiErrorSchema = z.object({
  code: z.number().optional(),
  message: z.string(),
})

/**
 * Base API response structure
 */
const BaseResponseSchema = z.object({
  success: z.boolean(),
  errors: z.array(ApiErrorSchema).default([]),
  messages: z.array(z.string()).optional(),
})

/**
 * Specific API response with required fields
 */
export const ApiResponseSchema = BaseResponseSchema.extend({
  result: z
    .object({
      id: z.string().min(1), // Required field - no optional chaining needed!
      name: z.string().optional(),
      created: z.string().optional(),
    })
    .optional(), // Optional when success: false
})

// Type inference for TypeScript
export type ApiResponse = z.infer<typeof ApiResponseSchema>
```

**Step 2**: Use schemas with `.parse()` for validation:

```typescript
import { z } from 'zod'
import { ApiResponseSchema } from './schemas'

try {
  // ✅ DO: Runtime validation with Zod
  const result = ApiResponseSchema.parse(await response.json())

  if (!result.success) {
    // errors is guaranteed to be an array (no optional chaining)
    const errors = result.errors.map((e) => e.message).join(', ')
    throw new Error(`API failed: ${errors}`)
  }

  // TypeScript knows result.result.id exists when success is true
  const id = result.result?.id
  if (!id) {
    throw new Error('Response missing ID')
  }

  // Use the validated data safely
  return id
} catch (error) {
  // Handle Zod validation errors separately
  if (error instanceof z.ZodError) {
    logger.error({
      msg: 'API response validation failed',
      validationIssues: error.issues,
    })
    throw new Error(`API response validation failed: ${error.message}`)
  }
  throw error
}
```

### Schema Design Guidelines

1. **Optional vs Required Fields**:
   - Mark top-level `result` as optional (absent when `success: false`)
   - Use `.default([])` for arrays to avoid optional chaining
   - Require critical fields within result (e.g., `id: z.string().min(1)`)

2. **Field Completeness**:
   - Include all documented API fields
   - Mark rarely-used fields as optional
   - Allows future use without schema changes

3. **Validation Constraints**:
   - Use `.min(1)` for non-empty strings
   - Use `.url()` for URL fields
   - Use `.enum()` for fixed values

### Error Handling Pattern

```typescript
try {
  const result = ApiResponseSchema.parse(await response.json())

  // Handle API-level errors (success: false)
  if (!result.success) {
    const errors = result.errors.map((e) => e.message).join(', ')
    throw new Error(`API operation failed: ${errors}`)
  }

  // Use validated data
  return result.result.id
} catch (error) {
  // Handle Zod validation errors (malformed response)
  if (error instanceof z.ZodError) {
    payload.logger.error({
      msg: 'API response validation failed',
      validationIssues: error.issues,
    })
    throw new Error(`API response validation failed: ${error.message}`)
  }

  // Re-throw API errors or other errors
  throw error
}
```

### When to Use This Pattern

- **External API integrations** (Cloudflare, Stripe, etc.)
- **Webhook payloads** from third-party services
- **Data imports** from external systems
- **Any untrusted data source** where the shape isn't guaranteed

### When NOT to Use This Pattern

- **Internal PayloadCMS collections** (already validated)
- **TypeScript-first code** within your codebase
- **Performance-critical paths** (though Zod is quite fast)
- **Simple boolean/string checks** (overkill for trivial validation)

### Real-World Example

See Cloudflare API integration:
- **Schemas**: `src/lib/storage/cloudflareSchemas.ts`
- **Usage**: `src/lib/storage/cloudflareImagesAdapter.ts`
- **Usage**: `src/lib/storage/cloudflareStreamAdapter.ts`

### Key Points
- Use Zod for external API response validation
- Create centralized schema files for each API
- Handle `z.ZodError` separately from API errors
- Leverage type inference (`z.infer<>`) for TypeScript types
- Validate at API boundaries, trust internal types

## RRule Library Pitfall: Undefined Values

When using the `rrule` library for recurrence rules, avoid passing `undefined` values in options objects. The library crashes when `toText()` is called on rules with `undefined` interval.

### Problem

```typescript
// ❌ Crashes with "Cannot read properties of undefined (reading 'toString')"
const rule = new RRule({
  freq: Frequency.DAILY,
  interval: state.interval > 1 ? state.interval : undefined,  // DON'T pass undefined
})
rule.toText()  // Crash!
```

### Solution

```typescript
// ✅ Always pass a number value
const rule = new RRule({
  freq: Frequency.DAILY,
  interval: state.interval > 1 ? state.interval : 1,  // Always a number
})
rule.toText()  // Works!
```

### Key Points
- Don't conditionally include properties that might be undefined
- Use default values (e.g., `interval: 1`) instead of omitting/undefined
- This applies to other rrule options that expect specific types
- See `src/components/admin/ScheduleField/utils.ts` for correct usage
