---
paths:
  - src/lib/richEditor/blocks/**/*.ts
---

# Custom Block Icons (Lexical Editor)

Page blocks live in `src/lib/richEditor/blocks/`. Icons appear in the Lexical
editor's slash menu (typing `/`) and the block-inserter toolbar button.
Icons are configured via the `imageURL` property on the Block config as
inline base64 data URLs.

## Icon specs

| Property | Value |
|---|---|
| ViewBox | `0 0 20 20` (20×20 px) |
| Format | SVG encoded as base64 data URL |
| Color | `#6B7280` (gray-500) |
| Style | Stroked outline preferred |
| Stroke attrs | `stroke-linecap="round" stroke-linejoin="round"` |

**Critical**: do NOT use `currentColor` — it renders as black in data-URL
images because there's no CSS context.

## Templates

```svg
<!-- Stroked (preferred) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"
     fill="none" stroke="#6B7280" stroke-linecap="round" stroke-linejoin="round">
  <!-- icon elements -->
</svg>

<!-- Filled -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"
     fill="#6B7280">
  <!-- icon elements -->
</svg>
```

## Workflow

```bash
# Encode an icon
echo '<svg ...></svg>' | base64
```

```typescript
import { Block } from 'payload'

export const MyBlock: Block = {
  slug: 'my-block',
  // Icon: Rounded button shape (20x20, gray stroked)
  imageURL: 'data:image/svg+xml;base64,PHN2Zy...',
  labels: { singular: 'My Block', plural: 'My Blocks' },
  // ... rest of config
}
```

Always include a descriptive `// Icon:` comment above `imageURL` so future
edits know what the icon depicts without decoding the base64.

## Common pitfalls

| Don't | Do |
|---|---|
| `stroke="currentColor"` | `stroke="#6B7280"` |
| External icon URLs | Inline base64 data URLs |
| Omit the `// Icon:` comment | Describe the icon in a one-line comment |
| `viewBox` other than 20×20 | `viewBox="0 0 20 20"` |

## Reference examples

- `src/lib/richEditor/blocks/ButtonBlock.ts` — stroked rounded rectangle with text line
- `src/lib/richEditor/blocks/QuoteBlock.ts` — filled quotation marks
- `src/lib/richEditor/blocks/ShowcaseBlock.ts` — filled star with stroked lines

## Testing

1. Start the dev server (`.claude/skills/dev-server/dev-server.sh`).
2. Admin → Pages → edit any page.
3. Type `/` in the editor — verify your block's icon appears.
4. Check both light and dark admin themes.

## Key files

- `src/lib/richEditor/blocks/index.ts` — barrel export and `pageBlocks` array
- `src/lib/richEditor/index.ts` — Lexical editor configuration presets
- `src/collections/Pages/Pages.ts` — collection consuming the blocks
