# Custom Admin Components Architecture

PayloadCMS allows extensive customization of the admin UI through custom components. Understanding the server/client component patterns and performance best practices is essential for building efficient admin interfaces.

## Server vs Client Components

### Server Components (Preferred for Data Fetching)
- **Definition**: React components without the `'use client'` directive
- **Execution**: Rendered on the server, HTML sent to client
- **Props**: Can receive non-serializable props (functions, class instances, etc.)
- **Data Access**: Direct access to Payload API via `getPayload()`
- **Use Cases**:
  - Dashboard views that display data
  - Components that need direct database/API access
  - Components receiving props from PayloadCMS (views, custom fields)

### Client Components (Only When Necessary)
- **Definition**: React components with `'use client'` directive at top
- **Execution**: Hydrated and rendered in the browser
- **Props**: Can only receive serializable props (JSON-compatible data)
- **Interactivity**: Required for useState, useEffect, event handlers
- **Use Cases**:
  - Interactive UI elements (dropdowns, modals, forms)
  - Components needing React hooks (useState, useEffect, useContext)
  - Components with event handlers (onClick, onChange, etc.)

## Props Pattern for PayloadCMS Views

Custom view components (dashboard, account, etc.) receive props from PayloadCMS including the authenticated user object:

```typescript
// Type definition for view props
interface ViewProps {
  user?: {
    id?: string | number
    currentProject?: ProjectSlug
    email?: string
    [key: string]: any
  }
  [key: string]: any
}

// Server component accepting PayloadCMS props
export default function CustomView(props: ViewProps) {
  const currentProject = props.user?.currentProject || 'all-content'

  // Access user data directly from props
  // No need for useAuth() hook

  return <div>...</div>
}
```

**Important**: Do NOT use `useAuth()` or other client-side hooks in view components. PayloadCMS passes user data as props, making server components the correct pattern.

## React Serialization Error

### Common Error
```
Error: Functions cannot be passed directly to Client Components unless
you explicitly expose it by marking it with "use server".
```

### Root Cause
PayloadCMS passes objects with methods (like locale objects with `toString()` functions) to custom components. Client components cannot receive non-serializable props.

### Solution
Use server components for custom views and components that receive PayloadCMS props. Only use client components for interactive UI elements that don't receive complex props from PayloadCMS.

**Example of Incorrect Pattern**:
```typescript
'use client' // ❌ Client component receiving PayloadCMS props

export default function Dashboard(props) {
  // Will fail if props contain non-serializable data
  return <div>...</div>
}
```

**Example of Correct Pattern**:
```typescript
// ✅ Server component receiving PayloadCMS props
export default function Dashboard(props) {
  // Can safely receive locale objects, user data with methods, etc.
  return <div>...</div>
}
```

## Performance Optimization Patterns

### Direct Payload API Access (Recommended)

```typescript
import { getPayload } from 'payload'
import config from '@payload-config'

export default async function MetricsDashboard() {
  // Direct server-side access - most efficient
  const payload = await getPayload({ config })

  // Use count() for counting, not find()
  const [meditationsCount, lessonsCount] = await Promise.all([
    payload.count({ collection: 'meditations' }),
    payload.count({ collection: 'lessons' }),
  ])

  return <div>{meditationsCount.totalDocs} meditations</div>
}
```

**Benefits**:
- No HTTP overhead - direct database access
- Parallel queries with Promise.all()
- Type-safe with full TypeScript support
- No need for API endpoints
- Efficient counting with payload.count()

### HTTP Fetch Pattern (Avoid for Internal Data)

```typescript
'use client'

export default function MetricsDashboard() {
  const [data, setData] = useState(null)

  useEffect(() => {
    // ❌ Inefficient - requires API endpoint + HTTP round trip
    fetch('/api/dashboard-metrics')
      .then(res => res.json())
      .then(setData)
  }, [])

  return <div>{data?.count}</div>
}
```

**Disadvantages**:
- Requires creating separate API endpoint
- HTTP overhead and latency
- Additional error handling needed
- More complex data flow

**Best Practice**: Use server components with direct Payload API access for internal data fetching. Reserve HTTP fetch for external APIs only.

## Import Map Generation

Custom admin components must be registered in PayloadCMS's import map to be available in the admin UI:

**Registration** (`payload.config.ts`):
```typescript
admin: {
  components: {
    beforeNavLinks: ['@/components/admin/ProjectSelector'],
    views: {
      dashboard: {
        Component: '@/components/admin/Dashboard',
      },
    },
  },
}
```

**Generate Import Map**:
```bash
pnpm generate:importmap
```

**Requirements**:
- Run after adding new custom components to `payload.config.ts`
- Use default exports (not named exports) for custom components
- Path aliases (@/) supported via tsconfig.json

**Generated File**: `.next/payload-component-map.json` (auto-generated, do not edit)

## Component Organization

Custom admin components should follow this structure:

```
src/components/
├── admin/                      # Admin UI components
│   ├── Dashboard.tsx          # Custom views (server components)
│   ├── ProjectSelector.tsx    # Interactive widgets (client components)
│   ├── ProjectTheme.tsx       # Theme providers (client components)
│   └── dashboard/             # Dashboard sub-components
│       ├── FathomDashboard.tsx    # Client (needs state)
│       ├── MetricsDashboard.tsx   # Server (data fetching)
│       └── DefaultDashboard.tsx   # Client (interactive links)
└── branding/                  # Branding components
    ├── Logo.tsx              # Client (interactive)
    └── Icon.tsx              # Client (dynamic rendering)
```

**Naming Convention**:
- Server components: No special suffix needed
- Client components: Include `'use client'` directive at top
- Descriptive names indicating purpose (Dashboard, Selector, etc.)

## PayloadCMS Custom Field Component Patterns

When creating custom field components for PayloadCMS, follow these patterns for clean, type-safe implementations:

### Field Property Destructuring

Use nested destructuring to extract field properties efficiently:

```typescript
export const CustomField: FieldClientComponent = ({ field, readOnly }) => {
  // ✅ Nested destructuring - clean and efficient
  const {
    name,
    label,
    localized,
    required,
    options: fieldOptions,  // Rename if needed
    admin: { description, className, style } = {},
  } = field as SelectFieldClient

  // ❌ Avoid: Multiple extraction steps
  // const { name, label, ... } = field
  // const description = admin?.description
  // const className = admin?.className
}
```

### useField Hook Usage

The `useField` hook infers path from context - no need to pass it explicitly:

```typescript
// ✅ Correct - path inferred from context
const { value, setValue, showError } = useField<string>()

// ❌ Incorrect - unnecessary path parameter
const { value, setValue, showError } = useField<string>({ path: name })
```

### Option Type Handling

PayloadCMS `Option` type is `string | OptionObject` - handle both cases:

```typescript
const options = useMemo(
  () =>
    fieldOptions.map((opt) => {
      if (typeof opt === 'string') {
        // String option - use as both label and value
        return { label: opt, value: opt }
      }
      // OptionObject - extract label (can be string or Record)
      const label = typeof opt.label === 'string' ? opt.label : opt.value
      return { label, value: opt.value }
    }),
  [fieldOptions],
)
```

### StaticLabel Handling

Client-side labels are `StaticLabel` (not `LabelFunction`), handle string and Record types:

```typescript
// Generate aria-label for accessibility
const ariaLabel =
  typeof label === 'string'
    ? label
    : typeof label === 'object' && label !== null
      ? label['en'] || Object.values(label)[0] || name
      : name
```

### Field Markup Structure

Follow PayloadCMS conventions for field markup:

```typescript
return (
  <div className={fieldClasses} id={fieldId} style={style}>
    {/* Use PayloadCMS field components */}
    <FieldLabel label={label} localized={localized} path={name} required={required} />

    <div className="field-type__wrap">
      <FieldError path={name} showError={showError} />
      <YourCustomInput />
    </div>

    <FieldDescription description={description} path={name} />
  </div>
)
```

**CSS Classes**:
- Base class: `field-type` (not `field`)
- Type class: `select`, `text`, etc.
- State classes: `error`, `read-only`

**Key Points**:
- Always use `field as SelectFieldClient` (or appropriate type) for type safety
- Extract aria-label to separate variable for readability
- Use PayloadCMS's `FieldLabel`, `FieldError`, `FieldDescription` components
- Match exact markup structure of PayloadCMS's built-in fields

## Component Wrapper Pattern (Pure UI + Field Wrapper)

For complex admin components with significant UI logic, separate concerns into:
- **Pure UI Component**: Stateless, accepts options/value/onChange as props, no PayloadCMS dependencies
- **Field Wrapper**: Integrates with PayloadCMS `useField` hook, fetches data from API, renders field markup

### Example: TagSelector

**Pure UI Component** ([TagSelector.tsx](../../src/components/admin/TagSelector/TagSelector.tsx)):
```typescript
export interface TagOption {
  id: string | number
  title: string
  url?: string
  color?: string
}

export interface TagSelectorProps {
  value: (string | number)[]
  onChange: (value: (string | number)[]) => void
  options: TagOption[]
  hasMany?: boolean
  readOnly?: boolean
}

export const TagSelector: React.FC<TagSelectorProps> = ({
  value,
  onChange,
  options,
  hasMany = true,
  readOnly = false,
}) => {
  const handleToggle = (tagId: string | number) => {
    if (readOnly) return
    if (hasMany) {
      const newValue = value.includes(tagId)
        ? value.filter((id) => id !== tagId)
        : [...value, tagId]
      onChange(newValue)
    } else {
      onChange(value.includes(tagId) ? [] : [tagId])
    }
  }

  return (
    <div role="group">
      {options.map((tag) => (
        <button key={tag.id} onClick={() => handleToggle(tag.id)} /* ... */ />
      ))}
    </div>
  )
}
```

**Field Wrapper** ([TagSelectorField.tsx](../../src/components/admin/TagSelector/TagSelectorField.tsx)):
```typescript
export const TagSelectorField: FieldClientComponent = ({ field, readOnly }) => {
  // IMPORTANT: hasMany defaults to false to match PayloadCMS relationship field behavior
  // The UI component (TagSelector) defaults hasMany to true for multi-select UX
  // These defaults must be aligned - see "Default Value Alignment" section below
  const { name, label, relationTo, hasMany = false, admin: { description } = {} } = field as RelationshipFieldClient
  const { value, setValue, showError } = useField<(string | number)[] | null>()
  const [options, setOptions] = useState<TagOption[]>([])

  // Fetch options from API
  useEffect(() => {
    const fetchOptions = async () => {
      const collection = Array.isArray(relationTo) ? relationTo[0] : relationTo
      const response = await fetch(`/api/${collection}?limit=100&depth=0`)
      const data: { docs: TagOption[] } = await response.json()
      setOptions(data.docs || [])
    }
    fetchOptions()
  }, [relationTo])

  return (
    <div className="field-type relationship">
      <FieldLabel label={label} path={name} required={required} />
      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />
        <TagSelector
          value={normalizedValue}
          onChange={(newValue) => setValue(hasMany ? newValue : newValue[0] || null)}
          options={options}
          hasMany={hasMany}
          readOnly={readOnly}
        />
      </div>
      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default TagSelectorField
```

### Default Value Alignment (Critical)

When a wrapper component passes props to a UI component, **both components must agree on default values** for optional props. Misaligned defaults cause subtle bugs.

**Common Pitfall**:
```typescript
// UI Component - defaults hasMany to true
export const TagSelector: React.FC<Props> = ({ hasMany = true, ... }) => { ... }

// Field Wrapper - NO default for hasMany (undefined)
const { hasMany } = field as RelationshipFieldClient  // undefined if not specified

// BUG: UI component receives undefined, uses default (true)
// But wrapper's handleChange treats undefined as falsy (false)
<TagSelector hasMany={hasMany} ... />  // hasMany is undefined!
```

**Solution**: Always provide explicit defaults in the wrapper that match the expected behavior:
```typescript
// Field Wrapper - explicit default matching PayloadCMS behavior
const { hasMany = false } = field as RelationshipFieldClient

// Now hasMany is false (not undefined), and both components agree
<TagSelector hasMany={hasMany} ... />
```

**Rule of Thumb**:
- Field wrappers should default to PayloadCMS's expected behavior (e.g., `hasMany = false` for relationship fields)
- UI components can have their own defaults for standalone usage
- When passing props from wrapper to UI, the wrapper's defaults take precedence

### Benefits
- **Testable**: Pure UI component can be unit tested without PayloadCMS setup
- **Reusable**: UI component can be used in different contexts or field configurations
- **Maintainable**: Clear separation between data fetching and rendering logic
- **Type-Safe**: Each component has focused, well-defined prop types

### When to Use This Pattern
- Complex interactive UI (multi-select, drag-drop, visual pickers)
- Components that fetch additional data from API
- UI that might be reused outside PayloadCMS context
- Components with significant rendering logic
