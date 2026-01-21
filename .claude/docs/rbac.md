# Role-Based Access Control System

The CMS implements a unified role-based permission system via the `accessPlugin`. This plugin consolidates RBAC and project visibility with a simplified architecture:

- Static permission checking functions (no factory pattern)
- Explicit O(1) lookup tables (no runtime derivation)
- Automatic access control application to all collections
- Automatic admin.hidden application based on project config
- Automatic field-level access for localized fields
- Bypass logic configured in payload.config.ts

## Configuration

Access control configuration is split into focused sub-modules within `src/lib/access/config/` (single source of truth for projects and roles), while bypass logic is in `src/lib/access/bypassPermissions.ts`:

**Configuration** (modular structure):
- [src/lib/access/config/projects.ts](../../src/lib/access/config/projects.ts) - Project configuration, lookup tables, and helper functions
- [src/lib/access/config/roles.ts](../../src/lib/access/config/roles.ts) - Role configuration, lookup tables, and helper functions
- [src/lib/access/config/index.ts](../../src/lib/access/config/index.ts) - Barrel export

**Bypass Logic**: [src/lib/access/bypassPermissions.ts](../../src/lib/access/bypassPermissions.ts) - Shared bypass function

**Plugin Configuration**: [src/payload.config.ts](../../src/payload.config.ts)

```typescript
import { accessPlugin, bypassPermissions } from '@/lib/access'

plugins: [
  accessPlugin({
    enabled: true,
    bypassPermissions,
  }),
]
```

The bypass function handles:
- Self-access (users can read/update their own document)
- Inactive user blocking (managers and clients)
- Admin bypass (full access for admin managers)
- Custom resource access (document-level permissions)

## Manager Roles

### Manager Type Field
- **Purpose**: Controls access level via select field (`inactive` | `manager` | `admin`)
- **Behavior**: When `type: 'admin'`, the roles and customResourceAccess fields are hidden in the admin UI
- **Scope**: Admin status applies to all locales (not locale-specific)

### Available Manager Roles (3 roles)
1. **meditations-editor**: Can create and edit meditations, upload related media and files
2. **path-editor**: Can edit lessons and lectures, upload related media and files
3. **web-translator**: Can edit localized fields in pages, music, and albums (read-only for non-localized fields)

### Manager Role Characteristics
- **Localized**: Roles can be assigned per-locale (e.g., web-translator for French, meditations-editor for English)
- **Multiple Roles**: Managers can have multiple roles per locale
- **Project-Based Read Access**: Managers get implicit read access to collections in their role's project
- **Collection Visibility**: Collections only appear in admin UI if the manager has write permissions
- **Custom Resource Access**: Managers can be granted update access to specific documents (e.g., individual pages)

## API Client Roles

### Available Client Roles (3 roles)
1. **wemeditate-web-client**: Access for We Meditate web frontend application
2. **wemeditate-app-client**: Access for We Meditate mobile application
3. **sahaj-atlas-client**: Access for Sahaj Atlas application

**Note**: Client roles use a `-client` suffix to distinguish them from project slugs. This is intentional to provide clear type separation between projects and client API roles.

### Client Role Characteristics
- **Not Localized**: Client roles apply to all locales
- **Read-Only by Default**: Clients primarily have read access to content
- **Form Submissions**: wemeditate-web client can create form submissions

## Permission System Architecture

### Access Plugin Flow

The `accessPlugin` automatically applies access control to all collections:

```typescript
// In payload.config.ts
plugins: [
  accessPlugin(accessPluginConfig),
]
```

The plugin:
1. Builds lookup tables at initialization (O(1) runtime lookups)
2. Applies `access` config to each collection
3. Applies `admin.hidden` based on project visibility
4. Applies field-level access to localized fields

### Bypass Functions

Bypass functions are checked FIRST and can short-circuit permission checking. The shared bypass function is defined in `src/lib/access/bypassPermissions.ts` and handles:
- Self-access (users can read/update their own document)
- Inactive user blocking
- Admin bypass (full access)
- Custom resource access (document-level permissions)

**Return values**:
- `'allow'` - Grant access immediately, skip further checks
- `'deny'` - Block access immediately, skip further checks
- `'continue'` - Continue with normal role-based checking

### Permission Checking Flow

1. Block null users
2. Call bypass function (handles self-access, inactive, admin, customResourceAccess)
3. O(1) permission lookup via pre-computed lookup tables
4. Handle translate permission for localized fields
5. Handle project-based implicit read access

## Permission Checking Usage

The access control system provides a static permission checking API with no configuration needed.

### Primary API: hasPermission

Check permission for a single operation (most common use case):

```typescript
import { hasPermission } from '@/lib/access'

// Check single permission (clear and simple)
const canRead = hasPermission({
  user,
  collection: 'pages',
  operation: 'read',
})

// Check update permission for localized field
const canEditLocalized = hasPermission({
  user,
  collection: 'pages',
  operation: 'update',
  field: { localized: true },
})

// Check create permission
const canCreate = hasPermission({
  user,
  collection: 'meditations',
  operation: 'create',
})

// With bypass function (for testing or custom logic)
const canUpdate = hasPermission({
  user,
  collection: 'pages',
  operation: 'update',
}, bypassFn)
```

### Helper: hasAnyPermission

For visibility checking and complex scenarios requiring multiple operations:

```typescript
import { hasAnyPermission } from '@/lib/access'

// Check for any write permission (OR logic)
const hasWrite = hasAnyPermission({
  user,
  collection: 'pages',
  operations: ['create', 'update', 'delete'],
})

// With bypass function
const hasWriteWithBypass = hasAnyPermission({
  user,
  collection: 'pages',
  operations: ['create', 'update', 'delete'],
}, bypassFn)

// Visibility checking - hide if no write access
if (!hasWrite) {
  // Hide collection from admin UI
}
```

### API Design Philosophy

- **Static Functions**: No configuration or factory pattern needed
- **Direct Imports**: Import `hasPermission` directly from `@/lib/access`
- **Optional Bypass**: Pass bypass function as second parameter when needed
- **Simple API**: Clear, predictable, type-safe

### Permissions Data Structure

Permissions are defined per-role in the config:

```typescript
'meditations-editor': {
  label: 'Meditations Editor',
  project: 'wemeditate-app',
  permissions: {
    meditations: ['create', 'update'],
    narrators: ['create', 'update'],
    images: ['create'],
    files: ['create'],
  },
}
```

### PermissionsTable Component
- Displays computed permissions in real-time as roles are selected
- Shown as `afterInput` component on the `roles` field
- Color-coded operation pills (read: gray, create: blue, update: orange, delete: red)

## Important Behaviors

### Project-Based Implicit Read Access

Both managers and API clients get the same implicit read access:
- Collections in their role's associated project
- Shared collections (collections not in any project)

**Examples**:
- A "web-translator" (wemeditate-web project) can read pages, meditations, music, etc. (wemeditate-web project) AND shared collections.
- `wemeditate-web-client` → Can read pages, meditations, music, etc. (wemeditate-web project) AND shared collections
- `wemeditate-app-client` → Can read meditations, lessons, lectures, etc. (wemeditate-app project) AND shared collections
- `sahaj-atlas-client` → Can read images, files (sahaj-atlas project) AND shared collections

### Localized Manager Roles
- Manager roles are per-locale - different roles can be assigned for different languages
- Access checks use the current request locale (`req.locale`) only
- **Example**: Manager has "meditations-editor" in English but "web-translator" in Czech:
  - Viewing meditation in English admin UI → Can edit
  - Viewing same meditation in Czech admin UI → Cannot edit (only translate permission)

### Client Roles (Not Localized)
- API client roles apply to ALL locales uniformly
- Clients get same permissions regardless of `?locale=` parameter

### customResourceAccess (Document-Level Permissions)
- Allows managers to update specific documents without collection-level update permission
- Only applies to `pages` collection (configurable via relationTo)
- Only grants update permission, not create or delete
- Checked in the bypass function before collection-level permissions

### Self-Access Pattern
- Users can always read and update their own document in their auth collection
- Implemented in the bypass function (checked before role-based permissions)
- Ensures users can manage their own profile

### Restricted Collections (Implicit Access Control)
Access collections (`managers`, `clients`) and system collections (`payload-jobs`, `payload-kv`, etc.) are implicitly restricted:
- They are not listed in any project configuration
- Only users with explicit permissions or admin bypass can access them
- This is handled automatically by the project-based implicit read logic - no hardcoded restrictions needed

## Key Files

**Configuration** (modular structure):
- [src/lib/access/config/projects.ts](../../src/lib/access/config/projects.ts) - Project configuration, lookup tables, and helper functions
- [src/lib/access/config/roles.ts](../../src/lib/access/config/roles.ts) - Role configuration, lookup tables, and helper functions
- [src/lib/access/config/index.ts](../../src/lib/access/config/index.ts) - Barrel export
- [src/lib/access/bypassPermissions.ts](../../src/lib/access/bypassPermissions.ts) - Shared bypass function for accessPlugin and tests
- [src/payload.config.ts](../../src/payload.config.ts) - Plugin configuration

**Plugin Implementation** (modular architecture):
- [src/lib/access/accessPlugin.ts](../../src/lib/access/accessPlugin.ts) - Main plugin orchestration
- [src/lib/access/permissions.ts](../../src/lib/access/permissions.ts) - Permission checking (`hasPermission`, `hasAnyPermission`)
- [src/lib/access/accessConfigs.ts](../../src/lib/access/accessConfigs.ts) - Access configuration factories
- [src/lib/access/fieldAccess.ts](../../src/lib/access/fieldAccess.ts) - Field-level access for translatable collections
- [src/lib/access/visibility.ts](../../src/lib/access/visibility.ts) - Admin UI visibility (`createHidden`)
- [src/lib/access/types.ts](../../src/lib/access/types.ts) - Plugin type definitions
- [src/lib/access/index.ts](../../src/lib/access/index.ts) - Barrel export (public API)

**Supporting Modules**:
- [src/lib/access/filterAvailableLocales.ts](../../src/lib/access/filterAvailableLocales.ts) - Admin UI locale filtering

**Admin Components**:
- [src/components/admin/PermissionsTable.tsx](../../src/components/admin/PermissionsTable.tsx) - Real-time permissions display

**Collections**:
- [src/collections/access/Managers.ts](../../src/collections/access/Managers.ts) - Manager collection with type, roles, customResourceAccess fields
- [src/collections/access/Clients.ts](../../src/collections/access/Clients.ts) - Client collection with roles field

## Testing

- [tests/int/role-based-access.int.spec.ts](../../tests/int/role-based-access.int.spec.ts) - Comprehensive RBAC integration tests
- [tests/utils/testData.ts](../../tests/utils/testData.ts) - Test helpers for creating managers and clients with roles

## Adding New Roles

1. Add role definition to `src/lib/access/config/roles.ts` in the `ROLES` constant:
```typescript
const ROLES = {
  // Manager roles
  'new-role': {
    label: 'New Role',
    description: 'Description of the role',
    project: 'wemeditate-web' as const,  // Associate with a project
    permissions: {
      'collection-slug': ['create', 'update'] as PermissionLevel[],
    },
  },
  // ... existing roles
} as const
```

The lookup tables are automatically computed at module load from the `ROLES` configuration - no manual updates needed.

2. Run `pnpm generate:types` to update TypeScript types (includes RoleSlug union)

3. Add tests in `tests/int/role-based-access.int.spec.ts`
