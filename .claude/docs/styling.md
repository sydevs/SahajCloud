# PayloadCMS CSS Variables

When building custom admin components, **always use PayloadCMS CSS variables** for consistent styling and theme compatibility.

## Variable Reference

Complete variable definitions: https://github.com/payloadcms/payload/tree/main/packages/ui/src/scss

## Key Variables

### Spacing & Layout

- `--base` - Base spacing unit (calculated from `--base-px: 20`)
- `--gutter-h` - Horizontal gutter spacing
- `--base-body-size` - Base font size (13px)
- Usage: `calc(var(--base) * 0.8)` for proportional spacing

### Typography

- `--font-body` - System font stack
- `--font-serif` - Serif font stack
- `--font-mono` - Monospace font stack
- `--base-body-size` - Base font size (use with `calc(var(--base-body-size) * 1px)`)

### Colors & Theme

- `--theme-elevation-{0-1000}` - Elevation-based color scale (supports light/dark)
- `--theme-bg` - Background color
- `--theme-text` - Text color
- `--theme-input-bg` - Input background

### Borders & Radius

- `--style-radius-s` - Small border radius (6px in custom.scss)
- `--style-radius-m` - Medium border radius (8px in custom.scss)
- `--style-radius-l` - Large border radius (12px in custom.scss)

### Layout Dimensions

- `--nav-width` - Sidebar width (275px)
- `--app-header-height` - Header height (`calc(var(--base) * 2.8)`)
- `--doc-controls-height` - Control height (`calc(var(--base) * 2.8)`)

## Example Usage

[src/components/admin/ProjectSelector.tsx](../../src/components/admin/ProjectSelector.tsx):

```typescript
style={{
  paddingBottom: 'calc(var(--base) * 0.8)',       // Use --base for spacing
  marginBottom: 'calc(var(--base) * 0.4)',
  fontSize: 'calc(var(--base-body-size) * 1px)',  // Use --base-body-size for fonts
  color: 'var(--theme-elevation-600)',             // Use elevation colors
  borderBottom: '1px solid var(--theme-elevation-100)',
}}
```

## Benefits

- Automatic dark/light theme support
- Responsive scaling
- Consistent with PayloadCMS design system
- Respects user's custom theme overrides
