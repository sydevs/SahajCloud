# Role-Based Access Control System

The CMS implements a role-based permission system with predefined roles for Managers and API Clients. Managers can optionally have a global admin flag that bypasses all permissions.

## Manager Roles

### Admin Boolean Field
- **Purpose**: Global administrative privilege that bypasses all role-based restrictions
- **Behavior**: When `admin: true`, the roles, customResourceAccess, and permissions fields are hidden in the admin UI
- **Scope**: Admin status applies to all locales (not locale-specific)

### Available Manager Roles (3 roles)
1. **meditations-editor**: Can create and edit meditations, upload related media and files
2. **path-editor**: Can edit lessons and external videos, upload related media and files
3. **translator**: Can edit localized fields in pages and music (read-only for non-localized fields)

### Manager Role Characteristics
- **Localized**: Roles can be assigned per-locale (e.g., translator for French, meditations-editor for English)
- **Multiple Roles**: Managers can have multiple roles per locale
- **Read Access**: All managers have implicit read access to non-restricted collections
- **Collection Visibility**: Collections only appear in admin UI if the manager has appropriate role permissions
- **Custom Resource Access**: Managers can be granted update access to specific documents (e.g., individual pages)

## API Client Roles

### Available Client Roles (3 roles)
1. **we-meditate-web**: Access for We Meditate web frontend application
2. **we-meditate-app**: Access for We Meditate mobile application
3. **sahaj-atlas**: Access for Sahaj Atlas application

### Client Role Characteristics
- **Not Localized**: Client roles apply to all locales
- **Read-Only by Default**: Clients primarily have read access to content
- **Form Submissions**: Clients can create form submissions
- **No Delete Access**: Clients never get delete access, even with manage-level permissions
- **Collection Restrictions**: Managers and Clients collections are completely blocked

## Permission System Architecture

### Permissions Data Structure

Permissions use a simplified map structure:
```typescript
// Role permission definition
permissions: {
  meditations: ['read', 'create', 'update'],
  media: ['read', 'create']
}

// Merged permissions (same structure)
type MergedPermissions = {
  [collection: string]: PermissionLevel[]
}
```

### Field Factories

**ManagerPermissionsField()**: Returns 4 fields for Managers collection:
1. `admin` (boolean) - Global admin flag
2. `roles` (select with hasMany, localized) - Manager role selection with PermissionsTable afterInput (hidden if admin)
3. `customResourceAccess` (relationship) - Document-level permissions (hidden if admin)
4. `permissions` (virtual json, hidden) - **IMPORTANT**: Automatic permission caching via afterRead hook

**ClientPermissionsField()**: Returns 2 fields for Clients collection:
1. `roles` (select with hasMany) - Client role selection with PermissionsTable afterInput
2. `permissions` (virtual json, hidden) - **IMPORTANT**: Automatic permission caching via afterRead hook

### Virtual Permissions Field (Automatic Caching)
- When managers/clients are fetched from database, the afterRead hook populates the `permissions` field
- The access control system checks this field first and uses it if present
- Only computes permissions on-demand if the cached field is missing
- Provides efficient permission caching without requiring separate cache management
- For managers: Locale-aware computation based on current request locale

### PermissionsTable Component
- Displays computed permissions in real-time as roles are selected
- Shown as `afterInput` component on the `roles` field
- Automatically computes permissions using `mergeRolePermissions()`
- Color-coded operation pills (read: gray, create: blue, update: orange, delete: red)

## Access Control Functions

- **roleBasedAccess()**: Main access control function used by all collections
- **hasPermission()**: Core permission checking - checks user permissions for a collection/operation
- **mergeRolePermissions(roles: (ManagerRole | ClientRole)[], collectionSlug: 'clients' | 'managers')**: Merge permissions from multiple roles into unified permissions object
- **createFieldAccess()**: Field-level access control for translate permission
- **createLocaleFilter()**: Query filtering based on locale permissions
- **isAPIClient()**: Type guard to check if user is an API client
- **extractRoleSlugs()**: Internal helper to extract role slugs from localized/non-localized role structures

## Permission Checking Flow

1. Check if user is active → Block if inactive
2. Check if user is a manager with `admin: true` → Grant full access
3. Check if collection is restricted (managers, clients, payload-jobs) → Block for non-admins
4. **Check/compute cached permissions**:
   - If `user.permissions` exists → Use cached permissions (populated by virtual field's afterRead hook)
   - If missing → Compute on-demand using `mergeRolePermissions()` and cache on user object
5. Check document-level permissions via `customResourceAccess` (managers only, update operations)
6. Check collection-specific permissions from merged permissions object
7. Check if operation is delete and user is a client → Block (clients can't delete)
8. Apply implicit read access for managers (any manager with roles can read non-restricted collections)
9. Apply locale filtering based on user's role permissions

## Important Behaviors & Limitations

### Implicit Read Access
- Managers with ANY role get read access to ALL non-restricted collections
- Example: A "translator" (pages/music only) can still read meditations, frames, narrators, etc.
- Rationale: Improves UX by allowing content discovery without explicit permissions
- Restricted collections (managers, clients, payload-jobs) are always blocked

### Localized Manager Roles
- Manager roles are per-locale - different roles can be assigned for different languages
- Access checks use the current request locale (`req.locale`) only
- **Limitation**: When accessing content with a different locale, permissions are computed for that locale's roles
- **Example**: Manager has "meditations-editor" in English but "translator" in Czech:
  - Viewing meditation in English admin UI → Can edit
  - Viewing same meditation in Czech admin UI → Cannot edit (only translate permission)
- **Workaround**: Assign same roles to all locales if consistent permissions needed

### Client Roles (Not Localized)
- API client roles apply to ALL locales uniformly
- Clients get same permissions regardless of `?locale=` parameter
- **Rationale**: API clients typically need consistent cross-locale access

### customResourceAccess (Document-Level Permissions)
- Allows managers to update specific documents without collection-level update permission
- Only applies to `pages` collection (configurable via relationTo)
- Only grants update permission, not create or delete
- **Example**: Translator can update specific pages assigned to them via customResourceAccess
- Checked during update operations before collection-level permissions

### Admin-Only Collections
- `forms` and `authors` collections are managed exclusively by admins
- No manager roles have create/update permissions for these collections
- Web clients have read-only access to `forms` and `authors`

## Type Organization

The RBAC system uses a well-organized type structure with types separated into dedicated files in the `src/types/` directory:

**Type Files Structure**:
```
src/types/
├── roles.ts        # Role type definitions
├── users.ts        # User type definitions
└── permissions.ts  # Permission structure types
```

**[src/types/roles.ts](../../src/types/roles.ts)** - Role type definitions:
- `ManagerRole` - Manager role enum type
- `ClientRole` - Client role enum type
- `PermissionLevel` - Permission operations type
- Role configuration interfaces

**[src/types/users.ts](../../src/types/users.ts)** - User type definitions:
- `TypedManager` - Extended manager user type
- `TypedClient` - Extended client user type

**[src/types/permissions.ts](../../src/types/permissions.ts)** - Permission structure types:
- `MergedPermissions` - Cached permissions structure
- `CollectionPermissions` - Helper type for type-safe collection permission access

## Key Files

**Type Definitions**:
- [src/types/roles.ts](../../src/types/roles.ts) - Role type definitions
- [src/types/users.ts](../../src/types/users.ts) - User type definitions
- [src/types/permissions.ts](../../src/types/permissions.ts) - Permission structure types

**Implementation**:
- [src/fields/PermissionsField.ts](../../src/fields/PermissionsField.ts) - Role data definitions, field factories, and mergeRolePermissions utility
- [src/lib/accessControl.ts](../../src/lib/accessControl.ts) - Core permission checking functions
- [src/components/admin/PermissionsTable.tsx](../../src/components/admin/PermissionsTable.tsx) - Real-time permissions display component

**Collections**:
- [src/collections/access/Managers.ts](../../src/collections/access/Managers.ts) - Manager collection
- [src/collections/access/Clients.ts](../../src/collections/access/Clients.ts) - Client collection
- All content collections - Use `roleBasedAccess()` for access control

## Testing
- [tests/int/role-based-access.int.spec.ts](../../tests/int/role-based-access.int.spec.ts) - Comprehensive RBAC integration tests
- [tests/int/managers.int.spec.ts](../../tests/int/managers.int.spec.ts) - Manager collection tests
- [tests/utils/testData.ts](../../tests/utils/testData.ts) - Test helpers for creating managers and clients with roles
