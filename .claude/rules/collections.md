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
2. Call bypass function (ordered by frequency):
   - Admin managers: allow
   - Inactive managers/clients: deny
   - customResourceAccess: allow for specific documents
   - Self-access: allow read/update of own document
3. Extract roles (handles flat array for clients, localized for managers)
4. Unified permission check per role:
   - Implicit read: project-based visibility (includes shared collections)
   - Explicit permissions: role configuration
   - Translate: localized field updates only
5. Default: deny

## Key Behaviors

- **Implicit Read Access**: Both managers and API clients can read collections in their role's project + shared collections
- **Localized Roles**: Manager permissions are per-locale (checks `req.locale`)
- **Client Roles**: Apply uniformly to all locales

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

## filterOptions Return Types

The `filterOptions` callback must return `Where | true`:

```typescript
// ✅ Correct: Return Where object or `true`
filterOptions: ({ id }) => {
  if (id) {
    return { id: { not_equals: id } }
  }
  return true  // Allow all options
},

// ❌ Wrong: Empty object is not assignable to Where
filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : {})
// TypeScript error: Type '{ id?: undefined; }' is not assignable to type 'Where'
```

## Adding New Roles

### 1. Define Role in roles.ts
```typescript
// src/lib/access/config/roles.ts
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
import { hasPermission, bypassPermissions } from '@/lib/access'

const manager = await testData.createManager(payload, { roles: ['my-new-role'] })
const canCreate = hasPermission(
  { user: manager, collection: 'my-collection', operation: 'create' },
  bypassPermissions
)
expect(canCreate).toBe(true)
```

**Note**: No manual collection access or visibility setup needed - plugin handles automatically.

Full RBAC reference: @.claude/docs/rbac.md
