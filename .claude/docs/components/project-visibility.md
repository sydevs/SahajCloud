# Project Visibility System

The CMS implements a project-based visibility system that dynamically shows/hides collections in the admin sidebar based on the manager's currently selected project. This allows multiple frontend applications to share a single CMS while maintaining clean, focused admin interfaces.

## How It Works

Project visibility is automatically managed by the `accessPlugin`. No manual configuration is needed on individual collections.

```typescript
// In payload.config.ts - visibility is automatic
plugins: [
  accessPlugin({
    enabled: true,
    bypassPermissions: (user, context) => { /* ... */ },
  }),
]
```

The plugin automatically generates `admin.hidden` functions for all collections and globals based on the project configuration in `src/lib/access/config.ts`.

## Project Values

The system supports three project contexts defined in `src/lib/access/config.ts`:

- **wemeditate-web** - We Meditate website frontend
- **wemeditate-app** - We Meditate mobile application
- **sahaj-atlas** - Sahaj Atlas mapping application

Additionally, the manager's `currentProject` field can be `null` to show all collections (admin view).

## Visibility Logic

For each collection/global, the `accessPlugin` generates a hidden function with this logic:

1. **Write Permission Check**: If user has no write permission (create/update/delete) for the collection, hide it
2. **Not In Any Project**: If collection is not listed in any project, show it (implicitly shared across all projects)
3. **Admin View**: If user's `currentProject` is `null`, show all collections they have write access to
4. **Project Match**: If user's current project is in the allowed projects list, show it
5. **Otherwise**: Hide the collection

```typescript
// Generated hidden function (conceptual)
hidden: ({ user }) => {
  if (!hasWritePermission(user, collectionSlug)) return true
  if (!projectsContainingCollection.length) return false  // Shared
  if (!user.currentProject) return false  // Admin view
  return !projectsContainingCollection.includes(user.currentProject)
}
```

## Project Configuration

Collections are assigned to projects in `src/lib/access/config.ts`:

```typescript
export const PROJECTS = {
  'wemeditate-web': {
    collections: [
      'pages', 'meditations', 'music', 'albums',
      'forms', 'form-submissions', 'authors',
      'page-tags', 'meditation-tags', 'music-tags',
      'narrators', 'frames', 'images', 'files',
    ],
    globals: ['we-meditate-web-settings'],
  },
  'wemeditate-app': {
    collections: [
      'meditations', 'music', 'albums', 'lessons',
      'lectures', 'frames', 'narrators',
      'meditation-tags', 'music-tags', 'images', 'files',
    ],
    globals: ['we-meditate-app-settings'],
  },
  'sahaj-atlas': {
    collections: ['images', 'files'],
    globals: ['sahaj-atlas-settings'],
  },
} as const
```

## Collection Visibility Matrix

Collections are visible based on which projects include them AND whether the user has write permission:

| Collection/Global | wemeditate-web | wemeditate-app | sahaj-atlas | Shared |
|------------------|----------------|----------------|-------------|--------|
| **Content** |
| pages | ✅ | | | |
| meditations | ✅ | ✅ | | |
| music | ✅ | ✅ | | |
| albums | ✅ | ✅ | | |
| lessons | | ✅ | | |
| lectures | | ✅ | | |
| **Resources** |
| images | ✅ | ✅ | ✅ | |
| files | ✅ | ✅ | ✅ | |
| authors | ✅ | | | |
| narrators | ✅ | ✅ | | |
| frames | ✅ | ✅ | | |
| **Tags** |
| page-tags | ✅ | | | |
| meditation-tags | ✅ | ✅ | | |
| music-tags | ✅ | ✅ | | |
| image-tags | | | | ✅ |
| **Forms** |
| forms | ✅ | | | |
| form-submissions | ✅ | | | |
| **Globals** |
| we-meditate-web-settings | ✅ | | | |
| we-meditate-app-settings | | ✅ | | |
| sahaj-atlas-settings | | | ✅ | |

**Note**: "Shared" collections (like `image-tags`) are not in any project and are visible to all users with write permission.

## Special Behaviors

### Admin View (null currentProject)
- When `user.currentProject` is `null`, all collections the user has write access to are shown
- Admin users can access all collections regardless of project
- Controlled via the manager's `currentProject` field in the Managers collection

### Shared Collections
- Collections not listed in any project (like `image-tags`) are visible across all projects
- Useful for shared resources that all projects need access to
- Note: `images` and `files` are now explicitly included in all three projects rather than being implicitly shared

### Project Switching UX
- When managers switch projects via ProjectSelector component, they're automatically redirected to `/admin`
- Prevents viewing collections that become hidden after project switch
- Implemented in `src/components/admin/ProjectSelector.tsx` using `router.push('/admin')`

## Key Files

**Configuration**:
- [src/lib/access/config.ts](../../../src/lib/access/config.ts) - Project definitions (single source of truth)
- [src/lib/access/data.ts](../../../src/lib/access/data.ts) - Internal lookup tables and public lookup functions
- [src/payload.config.ts](../../../src/payload.config.ts) - Plugin configuration with bypass logic

**Plugin Implementation**:
- [src/lib/access/accessPlugin.ts](../../../src/lib/access/accessPlugin.ts) - Consolidated plugin (permission checking, access configs, visibility)

**Admin Components**:
- [src/components/admin/ProjectSelector.tsx](../../../src/components/admin/ProjectSelector.tsx) - Project switching dropdown

## Adding Collections to Projects

To add a collection to a project:

1. Update `src/lib/access/config.ts`:
```typescript
export const PROJECTS = {
  'wemeditate-web': {
    collections: [
      // ... existing collections
      'new-collection',  // Add here
    ],
  },
} as const
```

2. Update internal lookup tables in `src/lib/access/data.ts`:
```typescript
const COLLECTION_TO_PROJECTS: Record<string, string[]> = {
  'new-collection': ['wemeditate-web'],
  // ... other mappings
}

const PROJECT_TO_COLLECTIONS: Record<string, string[]> = {
  'wemeditate-web': [...existingCollections, 'new-collection'],
  // ... other projects
}
```

The collection will automatically become visible when the user selects that project (if they have write permission).

## Testing

Project visibility is tested through:
- `tests/int/role-based-access.int.spec.ts` - Permission and visibility integration tests
- Admin UI manual testing after project switching
