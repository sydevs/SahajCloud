# Component Development Rules

Rules for creating React components in this codebase.

## Prefer built-in components over custom ones

Before you build or style a component, check for an existing one and use it.
A custom component adds maintenance burden and drifts from the CMS look and
feel.

- **Admin panel**: prefer `@payloadcms/ui`'s built-ins (Banner, Pill, Table,
  Card, Tooltip, Drawer, Button, field primitives, icons, …). See the catalog
  in `docs/rules/admin-ui.md` ("Prefer Payload's built-in components"). Write
  a custom-styled component only when no built-in fits, and note why.
- **Public frontend / non-admin**: use `lucide-react` for icons (see
  `docs/code-style.md`). Payload UI components do not apply there.

## Server vs client components

### Server components (preferred for data fetching)
- **Definition**: components with no `'use client'` directive
- **Props**: can receive non-serializable props (functions, class instances)
- **Data access**: direct access to the Payload API via `getPayload()`
- **Use cases**: dashboard views, components receiving PayloadCMS props

### Client components (only when necessary)
- **Definition**: components with a `'use client'` directive at the top
- **Props**: can only receive serializable props (JSON-compatible)
- **Use cases**: interactive elements, components with useState/useEffect

### Common error
```
Error: Functions cannot be passed directly to Client Components...
```
**Fix**: use server components for views that receive PayloadCMS props.

## Component folder organization

### When to use a folder
- The component has multiple related files (UI + wrapper, sub-components).
- Types export alongside the component.
- The component registers in the PayloadCMS config (needs a default export).

### Pattern: field component (UI + wrapper)
```
src/components/admin/
└── TagSelector/
    ├── index.ts              # Barrel export
    ├── TagSelector.tsx       # Pure UI component
    └── TagSelectorField.tsx  # PayloadCMS field wrapper
```

### Pattern: view component family
```
src/components/admin/
└── Dashboard/
    ├── index.ts              # Barrel export
    ├── Dashboard.tsx         # Main entry point (server)
    ├── DefaultDashboard.tsx  # Sub-component
    └── MetricsDashboard.tsx  # Sub-component (server, data fetching)
```

### Barrel export pattern
```typescript
export { TagSelector, type TagOption } from './TagSelector'
export { TagSelectorField } from './TagSelectorField'
export { default } from './TagSelectorField'  // Default for PayloadCMS
```

### Key points
- **Default export**: required for PayloadCMS component registration.
- **Named exports**: allow importing specific components.
- **Folder naming**: match the main component name (Dashboard/ contains
  Dashboard.tsx).
- **Utilities**: place in `utils.ts` within the component folder.
