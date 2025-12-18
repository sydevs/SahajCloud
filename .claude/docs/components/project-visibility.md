# Project Visibility System

The CMS implements a project-based visibility system that dynamically shows/hides collections in the admin sidebar based on the manager's currently selected project. This allows multiple frontend applications to share a single CMS while maintaining clean, focused admin interfaces.

## Project Values

The system supports four project contexts defined in `src/lib/projects.ts`:

- **wemeditate-web** - We Meditate website frontend
- **wemeditate-app** - We Meditate mobile application
- **sahaj-atlas** - Sahaj Atlas mapping application
- **all-content** - Special mode showing collections across all projects (content managers only)

## Helper Functions

**Location**: `src/lib/projectVisibility.ts`

### handleProjectVisibility()

Creates dynamic `admin.hidden` functions for collections and globals based on project visibility and write permissions:

```typescript
handleProjectVisibility(
  collectionSlug: string,
  allowedProjects: ProjectSlug[],
  options?: { excludeFromAdminView?: boolean }
)
```

**Parameters**:
- `collectionSlug` - Collection slug to check write permissions (create/update/delete). Users without write access to this collection will not see it.
- `allowedProjects` - Array of project values where collection should be visible
- `options.excludeFromAdminView` - If true, collection is hidden even in "all-content" mode (default: false)

**Behavior**:
1. First checks if user has write permissions (create, update, or delete) for the specified collection
2. If no write access, the collection is hidden regardless of project
3. Then checks if user's current project is in the allowed projects list
4. Note: The `update` permission check also covers `translate` permission (translators can see collections they can translate)

**Examples**:
```typescript
// Visible only in Web project (requires write access to pages)
admin: {
  hidden: handleProjectVisibility('pages', ['wemeditate-web'])
}

// Visible in Web + App (requires write access to meditations)
admin: {
  hidden: handleProjectVisibility('meditations', ['wemeditate-web', 'wemeditate-app'])
}

// Global settings: visible only in specific project, excluded from all-content mode
admin: {
  hidden: handleProjectVisibility('we-meditate-web-settings', ['wemeditate-web'], { excludeFromAdminView: true })
}
```

### adminOnlyVisibility

Shorthand for collections that should only be visible to admin users (bypasses project filtering):

```typescript
admin: {
  hidden: adminOnlyVisibility
}
```

## Collection Visibility Rules

| Collection/Global | Visible In Projects | All-Content Mode | Notes |
|------------------|---------------------|------------------|-------|
| **Content** |
| Pages | web, app, atlas | ✅ Visible | Cross-project content |
| Meditations | web, app | ✅ Visible | Shared meditation content |
| Music | web, app | ✅ Visible | Background music tracks |
| Lessons | web, app | ✅ Visible | Path Steps content |
| **Resources** |
| Media | web, app, atlas | ✅ Visible | Shared media library |
| Authors | web, app, atlas | ✅ Visible | Article authors |
| Narrators | app | ❌ Hidden | App-specific, excluded from all-content |
| External Videos | web, app | ✅ Visible | Not used in Atlas |
| Frames | app | ✅ Visible | Meditation pose images/videos |
| **Tags** |
| Page Tags | web | ✅ Visible | Requires write access to page-tags |
| Meditation Tags | web, app | ✅ Visible | Requires write access to meditation-tags |
| Music Tags | web, app | ✅ Visible | Requires write access to music-tags |
| Image Tags | web, app, atlas | ✅ Visible | Requires write access to image-tags |
| **System** |
| Managers | all-content only | Admin-only | User management |
| Clients | all-content only | Admin-only | API client management |
| File Attachments | (none) | ❌ Hidden | Completely hidden, internal use |
| Forms | web, app, atlas | ✅ Visible | Form definitions |
| Form Submissions | web, all-content | ❌ Hidden | Web-specific submissions |
| Payload Jobs | all-content only | Admin-only | Background jobs |
| **Globals** |
| WeMeditate Web Settings | web only | ❌ Hidden | Web-specific configuration |

## Special Behaviors

### All-Content Mode
- Special project value that shows collections across all projects
- Typically used by content managers who need cross-project visibility
- Collections with `excludeAllContent: true` remain hidden in this mode
- System collections (Managers, Clients, Payload Jobs) only visible in all-content mode

### ExcludeAllContent Option
- Used for project-exclusive content that shouldn't appear in all-content mode
- Examples: Narrators (app-only), WeMeditate Web Settings (web-only)
- Ensures strict project isolation for sensitive or project-specific collections

### Project Switching UX
- When managers switch projects via ProjectSelector component, they're automatically redirected to `/admin`
- Prevents viewing collections that become hidden after project switch
- Implemented in `src/components/admin/ProjectSelector.tsx` using `router.push('/admin')`

## Implementation Details

### Collection Configuration

Collections use `handleProjectVisibility()` in their admin config:

```typescript
export const Lectures: CollectionConfig = {
  slug: 'lectures',
  access: roleBasedAccess('lectures'),
  admin: {
    group: 'Resources',
    hidden: handleProjectVisibility('lectures', ['wemeditate-web', 'wemeditate-app']),
  },
  // ... fields
}
```

### Global Configuration

Globals use the same helper function:

```typescript
export const WeMeditateWebSettings: GlobalConfig = {
  slug: 'we-meditate-web-settings',
  admin: {
    group: 'System',
    hidden: handleProjectVisibility('we-meditate-web-settings', ['wemeditate-web'], { excludeFromAdminView: true }),
  },
  // ... fields
}
```

### Custom Visibility Functions

For complex visibility rules, implement custom functions in `src/payload.config.ts`:

```typescript
// Form Submissions: visible in all-content OR wemeditate-web
formSubmissionOverrides: {
  admin: {
    hidden: ({ user }) => {
      const currentProject = user?.currentProject
      return currentProject !== 'all-content' && currentProject !== 'wemeditate-web'
    },
  },
}
```

## Testing

The project visibility system is tested through:
- Admin UI navigation after project switching
- Collection visibility checks in different project modes
- All-content mode filtering behavior
- ExcludeAllContent option functionality
