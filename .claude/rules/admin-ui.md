---
paths:
  - src/components/admin/**/*.tsx
  - src/components/branding/**/*.tsx
  - src/globals/**/*.ts
---

# Admin UI

Rules for PayloadCMS admin-panel components — server vs client, field
components, cells, branding, dashboard, project visibility, and the
frame editor.

## Prefer Payload's built-in components (don't hand-roll)

**Before building or styling any admin UI, check whether `@payloadcms/ui`
already exports it, and use that.** Custom components are a maintenance burden
and drift from the CMS's look & feel. Only write a custom-styled component when
no built-in fits — and when you do, say so in the PR / commit (what was missing).

Everything below is exported from `@payloadcms/ui` (import directly, e.g.
`import { Banner, Button, Pill } from '@payloadcms/ui'`). This is a curated
list; for the full set see `node_modules/@payloadcms/ui/dist/exports/client/index.d.ts`.

| Need | Use |
|---|---|
| Inline notice / callout | `Banner` (`type` default/error/success; `icon`) |
| Status / tag chip | `Pill`, `ErrorPill` |
| Tabular data | `Table` (columns + `renderedCells`), `OrderableTable` |
| Buttons / actions | `Button`, `SaveButton`, `PublishButton`, `SaveDraftButton`, `CopyToClipboard` |
| Cards / layout | `Card`, `Gutter`, `Collapsible`, `AnimateHeight` |
| Tooltip / popover | `Tooltip`, `Popup`, `PopupList` |
| Modals / drawers | `Drawer` + `useModal`/`useDrawerSlug`, `ConfirmationModal`, `FullscreenModal` |
| Loading | `LoadingOverlay`, `ProgressBar`, `ShimmerEffect` |
| Pagination / list | `Pagination`, `PerPage`, `ListControls` |
| Drag & drop | `DraggableSortable`, `DraggableSortableItem` |
| Uploads | `Dropzone`, `Upload`, `FileDetails` |
| Toasts | `toast` (from `@payloadcms/ui`) |
| Severity icons | `WarningIcon`, `ErrorIcon`, `InfoIcon`, `SuccessIcon` |
| Other icons | `CalendarIcon`, `CheckIcon`, `ChevronIcon`, `CopyIcon`, `EditIcon`, `ExternalLinkIcon`, `GearIcon`, `PlusIcon`, `SearchIcon`, `XIcon`, … |

**Building a custom field component?** Compose Payload's field primitives instead
of bespoke markup (see "Custom field components" below): `FieldLabel`,
`FieldError`, `FieldDescription`, plus the input fields `TextField`,
`TextareaField`, `NumberField`, `SelectField`, `RadioGroupField`,
`CheckboxField`, `DateTimeField`, `EmailField`, `JSONField`, `CodeField`,
`RelationshipField`, `UploadField`, `ArrayField`, `GroupField`, `BlocksField`,
and `RenderFields` (render a whole field set). Hooks: `useField`, `useForm`,
`useFormFields`, `useDocumentInfo`, `useConfig`, `useAuth`, `useTranslation`.

For non-admin (public) React, Payload's components don't apply — use
`lucide-react` (see `.claude/rules/code-style.md`). Emails never use either
(no SVG) — see `.claude/rules/email.md`.

## Styling — PayloadCMS CSS variables

**Always use PayloadCMS CSS variables** for theme compatibility (dark/light
mode + project theming). Hardcoded colors and pixel sizes break the
elevation scale.

| Variable | Purpose |
|---|---|
| `--base` | Base spacing unit (use with `calc(...)`) |
| `--gutter-h` | Horizontal gutter |
| `--base-body-size` | Base font size (13 — use as `calc(var(--base-body-size) * 1px)`) |
| `--font-body`, `--font-serif`, `--font-mono` | Font stacks |
| `--theme-elevation-{0-1000}` | Elevation color scale (auto light/dark) |
| `--theme-bg`, `--theme-text`, `--theme-input-bg` | Background / text / input |
| `--style-radius-s/m/l` | Border radius (6 / 8 / 12 px) |
| `--nav-width` | Sidebar width (275) |
| `--app-header-height`, `--doc-controls-height` | Layout heights |

Complete reference: https://github.com/payloadcms/payload/tree/main/packages/ui/src/scss

```typescript
style={{
  padding: 'calc(var(--base) * 0.8)',
  fontSize: 'calc(var(--base-body-size) * 1px)',
  color: 'var(--theme-elevation-600)',
  borderRadius: 'var(--style-radius-m)',
}}
```

## Server vs client components

- **Server components** (no `'use client'`) — preferred. Can receive
  non-serializable props (locale objects with methods, user objects, etc.)
  and have direct access to Payload via `getPayload()`.
- **Client components** (`'use client'`) — only when you need React hooks
  (`useState`, `useEffect`, `useContext`), event handlers, or browser APIs.
  Props must be JSON-serializable.

PayloadCMS passes user data and locale objects with methods to view
components. **Custom views must be server components** — a client view
will throw `Functions cannot be passed directly to Client Components` the
moment Payload hands it a locale object.

```typescript
// ✅ Server component — accepts PayloadCMS view props directly
export default function CustomView(props: ViewProps) {
  const currentProject = props.user?.currentProject || 'all-content'
  // No useAuth() hook needed — user is in props
  return <div>...</div>
}
```

## Performance — direct Payload access

Server components have direct DB access via `getPayload()`. Don't fetch
internal data over HTTP from a client component.

```typescript
import { getPayload } from 'payload'
import config from '@payload-config'

export default async function MetricsDashboard() {
  const payload = await getPayload({ config })

  // payload.count() is cheaper than payload.find() for counts
  const [meditationsCount, lessonsCount] = await Promise.all([
    payload.count({ collection: 'meditations' }),
    payload.count({ collection: 'lessons' }),
  ])
  return <div>{meditationsCount.totalDocs} meditations</div>
}
```

Reserve `fetch()` for external APIs only.

## Component organization

```
src/components/
├── admin/
│   ├── ProjectSelector.tsx          # standalone interactive widget
│   ├── AnalyticsView.tsx            # custom admin page at /admin/analytics
│   ├── AnalyticsNavLink.tsx         # beforeNavLinks sidebar link to /admin/analytics
│   ├── Dashboard/                   # component family → folder + barrel
│   │   ├── index.ts
│   │   ├── FathomDashboard.tsx      # client (state) — used by AnalyticsView
│   │   ├── InactiveAccountAlert.tsx # beforeDashboard — self-guards via useAuth()
│   │   └── ProjectSelectionPrompt.tsx # beforeDashboard — self-guards via useAuth()
│   └── ThumbnailCell/
│       ├── index.ts
│       ├── ThumbnailCell.tsx
│       └── utils.ts
├── branding/                        # branding components with barrel
│   ├── index.ts
│   ├── Icon.tsx
│   ├── Logo.tsx
│   ├── InlineLogo.tsx
│   └── ProjectTheme.tsx
└── AdminProvider.tsx                # provider wrapping admin UI
```

- **Component families** (main + sub-components): dedicated folder + barrel.
- **Standalone components**: a single file is fine.
- **Barrel exports** must include a default export — PayloadCMS imports
  default by name.

## Import map generation

After adding a component to `payload.config.ts` (`admin.components`):

```bash
pnpm generate:importmap
```

Requirements:
- **Default exports** for components registered in PayloadCMS.
- Path aliases (`@/`) supported via tsconfig.
- Generated file (`.next/payload-component-map.json`) is auto-managed —
  never hand-edit.

## Custom field components

### Property destructuring

```typescript
export const CustomField: FieldClientComponent = ({ field, readOnly }) => {
  const {
    name,
    label,
    localized,
    required,
    options: fieldOptions,
    admin: { description, className, style } = {},
  } = field as SelectFieldClient
}
```

### `useField` hook

```typescript
// Path inferred from FieldPathContext — don't pass it for simple fields
const { value, setValue, showError } = useField<string>()
```

**Exception — custom array field components**: when building an
`ArrayFieldClientComponent`, you **must** pass `path` from props to
`useField` so the hook uses the up-to-date path during row reordering:

```typescript
const MyArrayField: ArrayFieldClientComponent = ({ path: pathFromProps, ... }) => {
  const { rows, path, showError } = useField<number>({ hasRows: true, path: pathFromProps })
}
```

### Option type handling

PayloadCMS `Option` is `string | OptionObject`:

```typescript
const options = useMemo(() =>
  fieldOptions.map((opt) => {
    if (typeof opt === 'string') return { label: opt, value: opt }
    const label = typeof opt.label === 'string' ? opt.label : opt.value
    return { label, value: opt.value }
  }),
  [fieldOptions],
)
```

### `StaticLabel` handling (aria-labels)

```typescript
const ariaLabel =
  typeof label === 'string'
    ? label
    : typeof label === 'object' && label !== null
      ? label['en'] || Object.values(label)[0] || name
      : name
```

### Field markup

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

CSS class conventions:
- Base class: `field-type` (NOT `field`).
- Type class: `select`, `text`, etc.
- State classes: `error`, `read-only`.

Use `FieldLabel` / `FieldError` / `FieldDescription` from `@payloadcms/ui`
— don't roll your own. Match the markup of PayloadCMS's built-in fields.

## Custom cell components (list views)

Two prop types:

- **`DefaultServerCellComponentProps`** (preferred) — gets `payload`, can
  read collection labels, can use Next.js `<Link>`. No client JS.
- **`DefaultCellComponentProps`** — only for cells that need React hooks,
  event handlers, or browser APIs.

### Server cell example

```typescript
import type { DefaultServerCellComponentProps, JoinField } from 'payload'
import Link from 'next/link'

export const MyCell: React.FC<DefaultServerCellComponentProps> = ({
  cellData, rowData, field, payload,
}) => {
  const joinField = field as JoinField
  const targetCollection = payload.collections[joinField.collection]
  const labels = targetCollection?.config?.labels
  return <span>{labels?.plural}</span>
}
```

### Join field cell data shape

Join fields put a structured object in `cellData`, not a simple value:

```typescript
interface JoinFieldData {
  docs: Array<{ id: string | number; [key: string]: unknown }>
  totalDocs?: number
  limit?: number
}
const count = (cellData as JoinFieldData)?.docs?.length ?? 0
```

### Extracting collection labels

PayloadCMS labels can be `string | LabelFunction | Record<string, string>`.
Use a small helper:

```typescript
function extractLabel(label: unknown): string | null {
  if (!label) return null
  if (typeof label === 'string') return label.toLowerCase()
  if (typeof label === 'object' && label !== null && 'en' in label) {
    return ((label as Record<string, string>).en ?? '').toLowerCase()
  }
  return null
}
```

Reference implementation: `src/components/admin/RelationshipCountCell.tsx`.

## Component wrapper pattern (pure UI + field wrapper)

For complex interactive components, separate concerns:

- **Pure UI component**: stateless; accepts options/value/onChange; no
  PayloadCMS deps. Independently testable.
- **Field wrapper**: integrates with `useField`, fetches data, wraps the
  UI component in PayloadCMS field markup.

### Default-value alignment (critical pitfall)

Wrapper and UI component **must agree on default values**. Mismatched
defaults cause subtle bugs:

```typescript
// UI component — defaults hasMany to true (good for standalone usage)
export const TagSelector: React.FC<Props> = ({ hasMany = true, ... }) => { ... }

// ❌ BUG: wrapper has no default, undefined gets passed
const { hasMany } = field as RelationshipFieldClient

// ✅ Wrapper provides explicit default matching PayloadCMS's relationship-field default
const { hasMany = false } = field as RelationshipFieldClient
<TagSelector hasMany={hasMany} ... />
```

**Rule of thumb**: field wrappers should default to PayloadCMS's expected
behavior (`hasMany = false` for relationship fields). UI components can
default differently for standalone usage.

### Components using this pattern

- **TagSelector** (`src/components/admin/TagSelector/`) — visual tag picker
  with colored circular buttons + SVG icons.
- **RulesEditor** (`src/components/admin/RulesEditor/`) — visual targeting
  rules editor for JSON fields. Reads `ruleDefinitions` from
  `field.admin?.custom?.ruleDefinitions`. Auto-derives labels via
  `toWords` from `payload/shared`. Created by `rulesField()` factory.
- **ToggleGroup** (`src/components/admin/ToggleGroupField/`) — segmented
  button group, supports `hasMany`, `clearable` (works in both modes —
  optional single-selects can be cleared too), and `readOnly`.
- **SelectDescription** (`src/components/admin/SelectDescription.tsx`) —
  dynamic per-value descriptions for select fields. Reads from
  `field.admin?.custom?.descriptions`.

### When to use

- Complex interactive UI (multi-select, drag-drop, visual pickers).
- Components that fetch additional data from API.
- UI that might be reused outside PayloadCMS context.

## Configurable components via `admin.custom`

`field.admin.custom` accepts any JSON-serializable data. Use it to make a
single component reusable across many fields without modifying the
component code.

```typescript
{
  name: 'type',
  type: 'select',
  options: [
    { label: 'Quick', value: 'quick' },
    { label: 'Daily', value: 'daily' },
  ],
  admin: {
    custom: {
      descriptions: {
        quick: 'Time-based meditations offered based on time of day.',
        daily: 'Personalized meditations with interactive features.',
      },
    },
    components: { Description: '@/components/admin/SelectDescription' },
  },
}
```

```typescript
export const SelectDescription: FieldDescriptionClientComponent<SelectFieldClient> = ({ field, path }) => {
  const { value } = useField<string>({ path })
  const descriptions = field.admin?.custom?.descriptions as Record<string, string> | undefined
  return <FieldDescription description={descriptions?.[value as string]} path={path} />
}
```

Common keys: `descriptions` (per-value help text), `ruleDefinitions`
(RulesEditor), `filterQuery` (TagSelector API filtering),
`size: 'small' | 'large'` (size variants).

## Custom array field components

When the built-in `ArrayField` doesn't fit (e.g. flat rows, no per-row
collapsibles, no drag-drop), use `ArrayFieldClientComponent`.

### Component props

```typescript
const MyArrayField: ArrayFieldClientComponent = ({
  field,              // array config (fields, label, maxRows, etc.)
  path: pathFromProps, // can be stale during reorder — see below
  parentSchemaPath,
  permissions,        // boolean OR object with .fields
  readOnly,
}) => { ... }
```

### `useField({ hasRows: true })`

```typescript
const {
  rows = [],        // row objects with .id
  path,             // current up-to-date path (use this, not pathFromProps)
  showError,
  value: rowCount,
} = useField<number>({ hasRows: true, path: pathFromProps })
```

### `useForm()`

```typescript
const { addFieldRow, removeFieldRow } = useForm()
addFieldRow({ path, rowIndex, schemaPath })
removeFieldRow({ path, rowIndex })
```

### Deriving `schemaPath`

`useField` does NOT return `schemaPath`. Derive from typed props:

```typescript
const schemaPath = parentSchemaPath ? `${parentSchemaPath}.${name}` : name
```

### Threading `permissions` into `RenderFields`

```typescript
<RenderFields
  fields={fields}
  parentIndexPath=""
  parentPath={`${path}.${i}`}
  parentSchemaPath={schemaPath}
  permissions={permissions === true ? permissions : (permissions?.fields ?? true)}
  readOnly={readOnly}
/>
```

### `Button` style limitation

The PayloadCMS `Button` component does NOT accept a `style` prop. Wrap
in a div if needed:

```typescript
// ✅
<div style={{ marginTop: '8px' }}>
  <Button icon="x" round />
</div>
```

Reference implementation: `src/components/admin/FlatArrayField/FlatArrayField.tsx`.

## `usePayloadAPI` race conditions

`usePayloadAPI` captures `initialParams` on first render via `useState`.
Chained fetches with `setParams` are race-prone:

```typescript
// ❌ Race-condition prone
const [{ data: parent }] = usePayloadAPI(`/api/parents/${id}`)
const [{ data: children }, { setParams }] = usePayloadAPI('/api/children')
useEffect(() => {
  if (parent?.type) setParams({ where: { type: { equals: parent.type } } })
}, [parent?.type])
```

**Fix**: write a custom Payload collection endpoint that does the join
server-side, then call it from a single `usePayloadAPI`:

```typescript
const [{ data, isLoading, isError }] = usePayloadAPI(
  narratorId ? `/api/frames/by-narrator/${narratorId}` : '',
)
```

See `.claude/rules/endpoints.md` for endpoint authoring patterns.

## Label generation with `toWords`

`payload/shared` exports `toWords` which converts camelCase / PascalCase
to "Title Case With Spaces". Use it instead of writing custom label
derivation.

```typescript
import { toWords } from 'payload/shared'

toWords('pathProgress')           // → "Path Progress"
toWords('meditationsPerWeek')     // → "Meditations Per Week"
toWords('totalLecturesViewed')    // → "Total Lectures Viewed"
```

Used by `RulesEditor` to auto-derive rule labels from
`RuleDefinition.name`, avoiding a separate `label` property.

## Project-aware navigation

Three projects + an admin view:

| Project | Slug | Theme | Logo |
|---|---|---|---|
| All Content (admin view) | `null` (sidebar default) | Default PayloadCMS | `sahaj-cloud.svg` |
| WeMeditate Web | `wemeditate-web` | Coral (#F07855) | `wemeditate-web.svg` |
| WeMeditate App | `wemeditate-app` | Teal (#61aaa0) | `wemeditate-app.svg` |
| Sahaj Atlas | `sahaj-atlas` | Royal blue (#4a8cd4) | `sahaj-atlas.webp` |

Manager profile field `currentProject` (in Managers collection) stores the
selection, sidebar position, nullable.

### `ProjectSelector` (`src/components/admin/ProjectSelector.tsx`)

- Rendered in `beforeNavLinks` (top of sidebar).
- Updates `manager.currentProject` via API on change.
- Calls `window.location.reload()` to re-evaluate `admin.hidden`
  functions, then redirects to `/admin` so users don't view a now-hidden
  collection.
- Uses Payload theme CSS variables.
- Subscribes to `ProjectContext` for reactive state.

### `ProjectContext` (`src/contexts/ProjectContext.tsx`)

- Wrapped in `AdminProvider`.
- `useProject()` hook exposes current project + setter.
- Auto-syncs with user profile via `useAuth`.

### `currentProject` is server-side

`admin.hidden` functions run server-side and read `user.currentProject`
directly. They do not need React context. Page reload after switching
re-evaluates them.

## Project-aware dashboard

The admin dashboard uses Payload's built-in widget system. Dashboard-related
concerns are separated into dedicated Payload slots:

```typescript
admin: {
  components: {
    beforeNavLinks: ['@/components/admin/ProjectSelector', '@/components/admin/AnalyticsNavLink'],
    beforeDashboard: [
      '@/components/admin/Dashboard/InactiveAccountAlert',
      '@/components/admin/Dashboard/ProjectSelectionPrompt',
    ],
    views: {
      analytics: { Component: '@/components/admin/AnalyticsView', path: '/analytics' },
    },
  },
}
```

**`AnalyticsView`** (`src/components/admin/AnalyticsView.tsx`) — server
component at `/admin/analytics`; typed as `AdminViewServerProps` (from
`payload`); wraps content in `DefaultTemplate` from
`@payloadcms/next/templates`; routes by `initPageResult.req.user.currentProject`:

- `wemeditate-web` → `FathomDashboard` (siteId `pfpcdamq`)
- `sahaj-atlas` → `FathomDashboard` (siteId `qqwctiuv`)
- other → "No analytics available" message

**`InactiveAccountAlert`** — client component; self-guards via
`useAuth()` and returns `null` unless `user.type === 'inactive'`.

**`ProjectSelectionPrompt`** — client component; self-guards via
`useAuth()` and returns `null` unless user is a regular manager with no
`currentProject`. Computes allowed projects via `getProjectsFromRoles()`
from `@/plugins/access`.

**`AnalyticsNavLink`** (`src/components/admin/AnalyticsNavLink.tsx`) —
client component rendered in `beforeNavLinks`; link to `/admin/analytics`;
highlights when pathname matches.

CSP headers in `next.config.mjs` whitelist `https://app.usefathom.com` for
Fathom iframes.

## Project-based branding

Branding components live in `src/components/branding/`. All read the
manager's `currentProject` and adapt:

- **`Icon.tsx`** — project-specific icon (default size 30 px); accepts
  `size`, `alt`, `style`. Uses Next.js `Image`. Logos in `/public/images/`.
- **`Logo.tsx`** — stacked vertical, 64 px. For login/signup pages.
  Registered as `graphics.Logo`. Bold text in `--theme-elevation-800`.
- **`InlineLogo.tsx`** — horizontal layout with 25 % border-radius icon,
  48 px. For the admin nav. Registered as `graphics.Icon`.
- **`ProjectTheme.tsx`** — injects project-specific
  `--theme-elevation-{0..1000}` variables (light + dark) and updates on
  project switch + theme toggle. Uses `MutationObserver` to detect
  light/dark changes. Mounted by `AdminProvider`.

### Brand colors source of truth

`src/lib/branding/themeColors.ts`:

- `PROJECT_BRAND_COLORS` — primary / dark / light per project.
- Color utilities: `lighten`, `darken`, `tint`, `shade`.
- `deriveScalarTheme()` / `getScalarThemeColors()` for the Scalar API docs
  theme (consumed by `src/plugins/openapi/scalarPlugin.ts`).

| Project | Primary | Dark | Light |
|---|---|---|---|
| WeMeditate Web | `#F07855` (coral) | `#D86545` | `#FF9477` |
| WeMeditate App | `#61aaa0` (teal) | `#4c8d84` | `#72b3a9` |
| Sahaj Atlas | `#4a8cd4` (royal blue) | `#2d6db8` | `#6fa3dd` |

`next.config.mjs` allows images from `raw.githubusercontent.com` for We
Meditate logo assets.

## Project visibility (collection sidebar filtering)

`accessPlugin` auto-generates `admin.hidden` for every collection and
global. **Never hand-write `admin.hidden` on a collection — let the plugin do it.**

### Logic

For each collection/global:

1. **No write permission** (create/update/delete) → hidden.
2. **Not in any project** → shared, always visible.
3. **`currentProject === null` (admin view)** → all collections with write
   permission visible.
4. **Current project includes this collection** → visible.
5. Otherwise → hidden.

```typescript
hidden: ({ user }) => {
  if (!hasWritePermission(user, collectionSlug)) return true
  if (!projectsContainingCollection.length) return false  // shared
  if (!user.currentProject) return false                  // admin view
  return !projectsContainingCollection.includes(user.currentProject)
}
```

### Project assignments

Defined in `src/plugins/access/config/projects.ts` as an internal `PROJECTS`
constant (not exported). Lookup tables (`PROJECT_TO_COLLECTIONS`,
`COLLECTION_TO_PROJECTS`) compute at module load.

To add a collection to a project: edit the `collections:` array in
`PROJECTS`. No manual lookup-table updates needed.

### Visibility matrix (current)

| Collection / Global | wemeditate-web | wemeditate-app | sahaj-atlas |
|---|:-:|:-:|:-:|
| **Content** | | | |
| pages, meditations, songs, albums, videos | ✅ | ✅ | |
| lessons, lectures | | ✅ | |
| lecture-clips | | ✅ (sidebar-hidden) | |
| **Resources** | | | |
| images, files | ✅ | ✅ | ✅ |
| narrators, frames | ✅ | ✅ | |
| authors | ✅ | | |
| **Tags / Audiences** | | | |
| audiences | | ✅ | |
| user-choices, song-tags | ✅ | ✅ | |
| **Forms** | | | |
| forms, form-submissions | ✅ | | |
| **Globals** | | | |
| we-meditate-web-settings | ✅ | | |
| we-meditate-app-settings | | ✅ | |
| sahaj-atlas-settings | | | ✅ |

Page, Video, and Image tags are inline enum select fields (not separate
collections).

## Frame editor

`src/components/admin/FrameEditor/` — audio-synchronized frame management
for the Meditations collection, integrated with PayloadCMS Live Preview.

### Layout

```
FrameEditor/
├── index.ts              # barrel
├── FrameListManager.tsx  # custom field component for managing frames
├── FrameInserter.tsx     # browse/insert UI
├── utils.ts              # formatTime, parseTime, validateTimestamp
└── styles.ts             # shared style objects (CSS variables)
```

Types: `KeyframeDefinition` (id + timestamp) and `KeyframeData` (enriched
with full Frame data) in `src/types/frames.ts`.

### Meditations Video tab structure

```
Video (tab)
├── Manage   — FrameListManager (edit, reorder, remove)
└── Insert   — FrameInserter (browse + add at current playback time)
```

### Live preview integration

- `useLivePreviewContext` — auto-opens the live preview panel
  (`setIsLivePreviewing(true)` on mount).
- PostMessage `{ type: 'PLAYBACK_TIME_UPDATE', currentTime }` from the
  iframe drives the active-frame highlight.
- Inserts happen at the current playback time. Existing frame at the
  same timestamp is replaced rather than throwing.

### Filtering

- Frames filtered by narrator gender (imageSet) automatically.
- Category filter pills toggle the visible frame library.

### Validation (collection-level on Meditations)

- Timestamps ≥ 0, integers (rounded on save).
- No duplicate timestamps.
- At least one frame required when audio exists (on update).
- Frames required to set `publishAt`.

### Hooks

- `beforeChange` — sort frames by timestamp on save.
- `afterRead` — enrich frame data with Frame collection details.

### Shared utilities (`utils.ts`)

| Helper | Purpose |
|---|---|
| `formatTime(seconds)` | seconds → MM:SS |
| `parseTime(str)` | MM:SS → seconds (null if invalid) |
| `validateTimestamp(t, existing, currentIndex?)` | constraint validation |
| `getCategoryLabel(value)` | human-readable category label |

### PayloadCMS UI primitives used

`Pill`, `FieldLabel`, `FieldDescription`, `FieldError`, `toast`.

### Tests

- `tests/int/meditationFrames.int.spec.ts` — validation, sorting,
  enrichment, publish rules.
- `tests/int/frameFiltering.int.spec.ts` — filtering by gender, category,
  pagination.
