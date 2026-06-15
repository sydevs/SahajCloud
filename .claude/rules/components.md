---
paths:
  - src/components/**/*.tsx
---

# Component Development Rules

Rules for creating React components in this codebase.

## Prefer built-in components over custom ones

Before building or styling a component, check for an existing one and use it —
custom components add maintenance burden and drift from the CMS look & feel.

- **Admin panel**: prefer `@payloadcms/ui`'s built-ins (Banner, Pill, Table,
  Card, Tooltip, Drawer, Button, field primitives, icons, …). See the catalog
  in `.claude/rules/admin-ui.md` ("Prefer Payload's built-in components"). Only
  write a custom-styled component when no built-in fits, and note why.
- **Public frontend / non-admin**: use `lucide-react` for icons (see
  `.claude/rules/code-style.md`); Payload UI components don't apply there.

## Server vs Client Components

### Server Components (Preferred for Data Fetching)
- **Definition**: React components without the `'use client'` directive
- **Props**: Can receive non-serializable props (functions, class instances)
- **Data Access**: Direct access to Payload API via `getPayload()`
- **Use Cases**: Dashboard views, components receiving PayloadCMS props

### Client Components (Only When Necessary)
- **Definition**: Components with `'use client'` directive at top
- **Props**: Can only receive serializable props (JSON-compatible)
- **Use Cases**: Interactive elements, components with useState/useEffect

### Common Error
```
Error: Functions cannot be passed directly to Client Components...
```
**Solution**: Use server components for views receiving PayloadCMS props.

## Component Folder Organization

### When to Use Folders
- Component has multiple related files (UI + wrapper, sub-components)
- Types should be exported alongside component
- Component is registered in PayloadCMS config (needs default export)

### Pattern: Field Component (UI + Wrapper)
```
src/components/admin/
└── TagSelector/
    ├── index.ts              # Barrel export
    ├── TagSelector.tsx       # Pure UI component
    └── TagSelectorField.tsx  # PayloadCMS field wrapper
```

### Pattern: View Component Family
```
src/components/admin/
└── Dashboard/
    ├── index.ts              # Barrel export
    ├── Dashboard.tsx         # Main entry point (server)
    ├── DefaultDashboard.tsx  # Sub-component
    └── MetricsDashboard.tsx  # Sub-component (server, data fetching)
```

### Barrel Export Pattern
```typescript
export { TagSelector, type TagOption } from './TagSelector'
export { TagSelectorField } from './TagSelectorField'
export { default } from './TagSelectorField'  // Default for PayloadCMS
```

### Key Points
- **Default export**: Required for PayloadCMS component registration
- **Named exports**: Allow importing specific components
- **Folder naming**: Match main component name (Dashboard/ contains Dashboard.tsx)
- **Utilities**: Place in `utils.ts` within component folder
