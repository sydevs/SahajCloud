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
