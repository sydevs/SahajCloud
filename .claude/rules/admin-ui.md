---
paths:
  - src/components/admin/**/*.tsx
  - src/globals/**/*.ts
---

# Admin UI Development Rules

Rules for PayloadCMS admin panel components.

## CSS Variables (Quick Reference)

**Always use PayloadCMS CSS variables** for consistent styling and theme compatibility.

### Key Variables
| Variable | Purpose |
|----------|---------|
| `--base` | Base spacing unit (use with calc) |
| `--base-body-size` | Font size (13px) |
| `--theme-elevation-{0-1000}` | Color scale (light/dark) |
| `--theme-bg`, `--theme-text` | Background/text colors |
| `--style-radius-s/m/l` | Border radius (6/8/12px) |

### Example
```typescript
style={{
  padding: 'calc(var(--base) * 0.8)',
  fontSize: 'calc(var(--base-body-size) * 1px)',
  color: 'var(--theme-elevation-600)',
  borderRadius: 'var(--style-radius-m)',
}}
```

Full reference: @.claude/docs/styling.md

## Props Pattern for Views

Custom view components receive props from PayloadCMS including user object:

```typescript
// Server component accepting PayloadCMS props
export default function CustomView(props: ViewProps) {
  const currentProject = props.user?.currentProject || 'all-content'
  // Access user data directly from props - no useAuth() needed
  return <div>...</div>
}
```

**Important**: Do NOT use `useAuth()` in view components. PayloadCMS passes user data as props.

## Performance Optimization

### Direct Payload API Access (Recommended)
```typescript
import { getPayload } from 'payload'
import config from '@payload-config'

export default async function MetricsDashboard() {
  const payload = await getPayload({ config })
  const [meditationsCount, lessonsCount] = await Promise.all([
    payload.count({ collection: 'meditations' }),
    payload.count({ collection: 'lessons' }),
  ])
  return <div>{meditationsCount.totalDocs} meditations</div>
}
```

**Benefits**: No HTTP overhead, parallel queries, type-safe, efficient counting.

### Avoid HTTP Fetch for Internal Data
Reserve `fetch()` for external APIs only. Use server components with direct Payload access.

## Import Map Generation

After adding components to `payload.config.ts`:
```bash
pnpm generate:importmap
```

Requirements:
- Use default exports for custom components
- Path aliases (@/) supported via tsconfig.json

## Custom Field Components

### Field Property Destructuring
```typescript
export const CustomField: FieldClientComponent = ({ field, readOnly }) => {
  const {
    name, label, localized, required,
    options: fieldOptions,
    admin: { description, className, style } = {},
  } = field as SelectFieldClient
}
```

### useField Hook
```typescript
// Path inferred from context - no need to pass it
const { value, setValue, showError } = useField<string>()
```

### Field Markup Structure
```typescript
return (
  <div className={fieldClasses} id={fieldId} style={style}>
    <FieldLabel label={label} localized={localized} path={name} required={required} />
    <div className="field-type__wrap">
      <FieldError path={name} showError={showError} />
      <YourCustomInput />
    </div>
    <FieldDescription description={description} path={name} />
  </div>
)
```

## Component Wrapper Pattern

For complex field components, separate concerns:
- **Pure UI Component**: Stateless, accepts options/value/onChange
- **Field Wrapper**: Integrates with PayloadCMS useField, fetches data

### Default Value Alignment (Critical)
Both wrapper and UI component must agree on default values:
```typescript
// Field Wrapper - explicit default matching PayloadCMS behavior
const { hasMany = false } = field as RelationshipFieldClient

// Now hasMany is false (not undefined), and both components agree
<TagSelector hasMany={hasMany} ... />
```

## usePayloadAPI Limitations

The hook captures `initialParams` on first render. Avoid chained fetches with setParams.

**Solution**: Use custom endpoints for server-side data joining. See patterns.md for details.

## Custom Cell Components

Cell components display field values in list views. Choose the right type:

### Server Cell (Recommended)
Use `DefaultServerCellComponentProps` when you need:
- Access to collection config (labels, etc.) via `payload.collections`
- No interactivity (static display)

```typescript
import type { DefaultServerCellComponentProps, JoinField } from 'payload'

export const MyCell: React.FC<DefaultServerCellComponentProps> = ({
  cellData, rowData, field, payload,
}) => {
  const labels = payload.collections['pages']?.config?.labels
  return <span>{labels?.plural}</span>
}
```

### Client Cell
Use `DefaultCellComponentProps` only when you need:
- React hooks (useState, useEffect)
- Event handlers (onClick, etc.)
- Browser APIs

### Join Field Data Structure
```typescript
// cellData for join fields
interface JoinFieldData {
  docs: Array<{ id: string | number }>
  totalDocs?: number
  limit?: number
}
const count = (cellData as JoinFieldData)?.docs?.length ?? 0
```

Full reference: @.claude/docs/components/custom-components.md#custom-cell-components
