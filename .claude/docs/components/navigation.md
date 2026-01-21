# Project-Focused Navigation

The CMS implements project-focused navigation to manage content for three distinct projects (WeMeditate Web, WeMeditate App, Sahaj Atlas) plus an "Admin View" that shows all collections. The system dynamically filters sidebar collections based on the currently selected project.

## Projects Configuration

- **File**: [src/lib/access/config/](../../src/lib/access/config/) - Centralized configuration (single source of truth)
- **Projects** (3 defined):
  - `wemeditate-web` (WeMeditate Web) - Web application content
  - `wemeditate-app` (WeMeditate App) - Mobile application content
  - `sahaj-atlas` (Sahaj Atlas) - Atlas application content
- **Admin View**: When `currentProject` is `null`, shows all collections (labeled "Sahaj Cloud")
- **Helper Functions**: Exported from `@/lib/access`: `getProjectLabel()`, `getProjectOptions()`, `isValidProject()`

## Manager Profile

- **Field**: `currentProject` in Managers collection ([src/collections/access/Managers.ts](../../src/collections/access/Managers.ts))
- **Type**: Select field with project options (nullable)
- **Position**: Sidebar
- **Default**: `null` (shows "Sahaj Cloud" / admin view)
- **Purpose**: Stores user's currently selected project preference

## ProjectSelector Component

- **File**: [src/components/admin/ProjectSelector.tsx](../../src/components/admin/ProjectSelector.tsx)
- **Location**: Rendered in `beforeNavLinks` (top of sidebar navigation)
- **Features**:
  - Dropdown showing all four projects
  - Updates manager profile on project change via API
  - Automatically reloads page to update sidebar visibility
  - Uses Payload's theme CSS variables for consistent styling
- **Context Integration**: Uses ProjectContext for reactive state management

## ProjectContext Provider

- **File**: `src/contexts/ProjectContext.tsx`
- **Purpose**: React context for sharing project state across admin components
- **Provider**: Wrapped in AdminProvider component
- **Hook**: `useProject()` - Access current project and setter
- **Auto-sync**: Syncs with user profile changes via `useAuth` hook

## Collection Visibility Filtering

Collections use `admin.hidden` functions to control visibility based on `user.currentProject`:

### Collection Visibility Map

| Collection | All Content | WeMeditate Web | WeMeditate App | Sahaj Atlas |
|------------|-------------|----------------|----------------|-------------|
| **Content** |||||
| Pages | ✓ | ✓ | ✗ | ✗ |
| Meditations | ✓ | ✓ | ✓ | ✗ |
| Songs | ✓ | ✓ | ✓ | ✗ |
| Lessons | ✓ | ✗ | ✓ | ✗ |
| **Resources** |||||
| Media | ✓ | ✓ | ✓ | ✓ |
| Lectures | ✓ | ✓ | ✓ | ✓ |
| Frames | ✓ | ✗ | ✓ | ✗ |
| Narrators | ✓ | ✓ | ✓ | ✗ |
| Authors | ✓ | ✓ | ✗ | ✗ |
| Files | ✓ | ✓ | ✓ | ✓ |
| **Tags** |||||
| MeditationTags | ✓ | ✓ | ✓ | ✗ |
| SongTags | ✓ | ✓ | ✓ | ✗ |
| **System/Access** |||||
| All Others | ✓ | ✓ | ✓ | ✓ |

### Example Implementation

The `accessPlugin` automatically generates `admin.hidden` functions for all collections based on the project configuration. No manual setup is required - collections are automatically shown/hidden based on project assignments in `src/lib/access/config/projects.ts`.

## Technical Notes

- **Server-Side Evaluation**: `admin.hidden` functions run server-side and access `user.currentProject` directly (no React context needed)
- **Page Reload Required**: Changing projects triggers `window.location.reload()` to re-evaluate all `admin.hidden` functions
- **Import Map**: ProjectSelector requires `pnpm generate:importmap` to be included in Payload's component system
- **Default Export**: Custom admin components must use default export (not named export)

## Project-Aware Dashboard System

The CMS features a dynamic dashboard that adapts based on the user's currently selected project, providing project-specific views and analytics.

### Implementation

The custom Dashboard view component is registered in `payload.config.ts`:

```typescript
admin: {
  components: {
    views: {
      dashboard: {
        Component: '@/components/admin/Dashboard',
      },
    },
  },
}
```

### Dashboard Component

[src/components/admin/Dashboard.tsx](../../src/components/admin/Dashboard.tsx):
- **Type**: Server Component (no 'use client' directive)
- **Props**: Receives `DashboardProps` from PayloadCMS including `user` object
- **Routing**: Switches dashboard view based on `user.currentProject`

### Project-Specific Dashboards

1. **WeMeditate Web** → [FathomDashboard](../../src/components/admin/dashboard/FathomDashboard.tsx)
   - Embeds Fathom Analytics (siteId: `pfpcdamq`)
   - Full-screen iframe with error handling
   - Client component (needs state for error handling)

2. **Sahaj Atlas** → [FathomDashboard](../../src/components/admin/dashboard/FathomDashboard.tsx)
   - Embeds Fathom Analytics (siteId: `qqwctiuv`)
   - Same component, different site configuration

3. **WeMeditate App** → [MetricsDashboard](../../src/components/admin/dashboard/MetricsDashboard.tsx)
   - **Server component** with direct Payload API access
   - Displays collection counts (meditations, lessons, songs)
   - Uses `payload.count()` for efficient counting
   - Parallel queries with `Promise.all()`

4. **All Content** → [DefaultDashboard](../../src/components/admin/dashboard/DefaultDashboard.tsx)
   - Quick links to key collections
   - General content management interface

**Security Note**: CSP headers in `next.config.mjs` whitelist `https://app.usefathom.com` for Fathom Analytics iframes
