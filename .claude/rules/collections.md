---
paths:
  - src/collections/**/*.ts
  - src/fields/**/*.ts
---

# Collection Development Rules

Rules for PayloadCMS collections and field configurations.

## Access Control

Access control is **automatically applied by `accessPlugin`**. Collections do NOT need manual access configuration.

### How It Works

The `accessPlugin` in `payload.config.ts` automatically:
1. Applies `access` config to all collections
2. Applies `admin.hidden` functions for project visibility
3. Applies field-level access to translatable collections

### Checking Permissions Manually

For custom logic outside collections, use `hasPermission`:

```typescript
import { hasPermission } from '@/lib/access'

const canUpdate = hasPermission({
  user,
  collection: 'meditations',
  operation: 'update',
})
```

## Permission Checking Flow

1. Block null users
2. Call bypass function (handles inactive, admin, customResourceAccess)
3. O(1) permission lookup via pre-computed lookup tables
4. Handle translate permission for localized fields
5. Handle project-based implicit read access

## Key Behaviors

- **Implicit Read Access**: Managers with roles can read collections in their role's project + shared collections
- **Localized Roles**: Manager permissions are per-locale (checks `req.locale`)
- **Client Roles**: Apply uniformly to all locales
- **API Clients**: Only get implicit read for collections in their project (not shared collections)

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

### 1. Define Role in config.ts
```typescript
// src/lib/access/config.ts
const ROLES = {
  'my-new-role': {
    label: 'My New Role',
    description: 'Description of the role',
    project: 'wemeditate-web' as const,
    permissions: {
      'my-collection': ['create', 'update'] as PermissionLevel[],
    },
  },
  // ... existing roles
}
```

### 2. Run Type Generation
```bash
pnpm generate:types
```

### 3. Add Tests
```typescript
const manager = await testData.createManager(payload, { roles: ['my-new-role'] })
const canCreate = hasPermission({
  user: manager,
  collection: 'my-collection',
  operation: 'create'
})
expect(canCreate).toBe(true)
```

**Note**: No manual collection access or visibility setup needed - plugin handles automatically.

Full RBAC reference: @.claude/docs/rbac.md
