---
paths:
  - src/collections/**/*.ts
  - src/fields/**/*.ts
---

# Collection Development Rules

Rules for PayloadCMS collections and field configurations.

## Access Control

### Collection-Level Access
```typescript
import { roleBasedAccess } from '@/lib/access'

export const MyCollection: CollectionConfig = {
  slug: 'my-collection',
  access: roleBasedAccess('my-collection'),
  // ... fields
}
```

### Operation-Specific Checks
```typescript
import { hasPermission } from '@/lib/access'

const canUpdate = hasPermission({
  user,
  collection: 'meditations',
  operation: 'update',
  locale: req.locale,
})
```

### Field-Level Access
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

## Permission Checking Flow

1. Check if user is active
2. Check if manager with `admin: true` → Grant full access
3. Check if collection is restricted (managers, clients, payload-jobs)
4. Check cached permissions from `user.permissions`
5. Check document-level permissions via `customResourceAccess`
6. Check collection-specific permissions
7. API clients never get delete access

## Key Behaviors

- **Implicit Read Access**: Any manager with roles can read non-restricted collections
- **Localized Roles**: Manager permissions are per-locale (checks `req.locale`)
- **Client Roles**: Apply uniformly to all locales
- **Restricted Collections**: managers, clients, payload-jobs are admin-only

## Field Factory Naming Convention

```typescript
// DO: Use lowercase camelCase without prefix
virtualUrlField({ collection, adapter })
previewUrlField({ collection })
slugField('title')

// DON'T: Use create* prefix or PascalCase
createVirtualUrlField()
VirtualUrlField()
```

## Adding New Roles

### 1. Define Role in PermissionsField.ts
```typescript
export const MANAGER_ROLES: Record<ManagerRole, ManagerRoleConfig> = {
  'my-new-role': {
    slug: 'my-new-role',
    label: 'My New Role',
    project: 'wemeditate-web',
    permissions: {
      'my-collection': ['read', 'create', 'update'],
      'media': ['read', 'create'],
    },
  },
}
```

### 2. Apply roleBasedAccess() to Collection

### 3. Update Project Visibility
```typescript
admin: {
  hidden: handleProjectVisibility('my-collection', ['wemeditate-web']),
}
```

### 4. Add Tests
```typescript
const manager = await testData.createManager(payload, { roles: ['my-new-role'] })
const canCreate = hasPermission({
  user: manager,
  collection: 'my-collection',
  operation: 'create'
})
expect(canCreate).toBe(true)
```

Full RBAC reference: @.claude/docs/rbac.md
