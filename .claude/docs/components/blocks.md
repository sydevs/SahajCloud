# Custom Block Icons

This document covers creating custom icons for PayloadCMS Lexical editor blocks.

## Overview

PayloadCMS blocks can display custom icons in the Lexical editor's:
- Slash menu (when typing `/`)
- Block inserter toolbar button

Icons are configured via the `imageURL` property on Block configs.

## Icon Specifications

| Property | Value |
|----------|-------|
| ViewBox | `0 0 20 20` (20×20 pixels) |
| Format | SVG encoded as base64 data URL |
| Color | `#6B7280` (gray-500) |
| Style | Stroked (outline) preferred |
| Stroke | `stroke-linecap="round"` `stroke-linejoin="round"` |

**Important**: Do NOT use `currentColor` - it renders as black in data URL images because there's no CSS context.

## SVG Template

### Stroked Style (Preferred)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"
     fill="none" stroke="#6B7280" stroke-linecap="round" stroke-linejoin="round">
  <!-- icon elements here -->
</svg>
```

### Filled Style

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"
     fill="#6B7280">
  <!-- icon elements here -->
</svg>
```

## Creating an Icon

### Step 1: Design the SVG

Create a 20×20 SVG icon. Keep it simple - icons appear small in the UI.

### Step 2: Encode to Base64

```bash
echo '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="#6B7280" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="14" height="8" rx="2"/></svg>' | base64
```

### Step 3: Add to Block Config

```typescript
import { Block } from 'payload'

export const MyBlock: Block = {
  slug: 'my-block',
  // Icon: [Description] (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iNiIgd2lkdGg9IjE0IiBoZWlnaHQ9IjgiIHJ4PSIyIi8+PC9zdmc+Cg==',
  labels: {
    singular: 'My Block',
    plural: 'My Blocks',
  },
  // ... rest of block config
}
```

## Comment Convention

Always include a descriptive comment above the `imageURL`:

```typescript
// Icon: [Description] (20x20, gray stroked)
// Icon: [Description] (20x20, gray filled)
```

Examples:
- `// Icon: Rounded button shape (20x20, gray stroked)`
- `// Icon: Quotation marks (20x20, gray filled)`
- `// Icon: Star with content lines (20x20, gray filled/stroked)`

## Common Pitfalls

| ❌ DON'T | ✅ DO |
|----------|-------|
| Use `stroke="currentColor"` | Use `stroke="#6B7280"` |
| Use `fill="currentColor"` | Use `fill="#6B7280"` |
| Use external URLs | Use inline base64 data URLs |
| Omit the comment | Include descriptive `// Icon:` comment |
| Use viewBox other than 20×20 | Use `viewBox="0 0 20 20"` |

## Icon Style Examples

### Stroked Style

[ButtonBlock.ts](../../../src/blocks/pages/ButtonBlock.ts) - Outlined rounded rectangle with text line:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"
     fill="none" stroke="#6B7280" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="6" width="14" height="8" rx="2"/>
  <line x1="7" y1="10" x2="13" y2="10"/>
</svg>
```

### Filled Style

[QuoteBlock.ts](../../../src/blocks/pages/QuoteBlock.ts) - Gray filled quotation marks:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"
     fill="#6B7280">
  <path d="M6 8C6 6.9 6.9 6 8 6C9.1 6 10 6.9 10 8C10 10.2 8 12 6 13V11.5C7 11 8 10 8 8.5C7.4 8.8 6.7 9 6 9V8Z"/>
  <path d="M12 8C12 6.9 12.9 6 14 6C15.1 6 16 6.9 16 8C16 10.2 14 12 12 13V11.5C13 11 14 10 14 8.5C13.4 8.8 12.7 9 12 9V8Z"/>
</svg>
```

### Mixed Style

[ShowcaseBlock.ts](../../../src/blocks/pages/ShowcaseBlock.ts) - Filled star with stroked lines:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"
     fill="none" stroke="#6B7280" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" fill="#6B7280"/>
  <line x1="4" y1="16" x2="16" y2="16"/>
  <line x1="6" y1="18" x2="14" y2="18"/>
</svg>
```

## Testing Icons

1. Start the dev server: `.claude/skills/dev-server/dev-server.sh`
2. Navigate to admin panel → Pages → Edit any page
3. In the Lexical editor, type `/` to open slash menu
4. Verify your block appears with the custom icon
5. Check visibility in both light and dark admin themes

## Block File Location

All page blocks are in `src/blocks/pages/`:
- [index.ts](../../../src/blocks/pages/index.ts) - Barrel exports and `pageBlocks` array
- Individual block files use PascalCase naming: `TextBoxBlock.ts`, `QuoteBlock.ts`, etc.

## Key Files

| File | Purpose |
|------|---------|
| [src/blocks/pages/](../../../src/blocks/pages/) | Page block definitions |
| [src/lib/richEditor.ts](../../../src/lib/richEditor.ts) | Lexical editor configuration |
| [src/collections/content/Pages.ts](../../../src/collections/content/Pages.ts) | Pages collection using blocks |
