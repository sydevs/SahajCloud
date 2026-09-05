# Tags Import

Imports UserChoices (24 items) and MusicTags (4 items) from Cloudinary-hosted
SVG assets.

## No prerequisites

Runs independently. Run it **before** the meditations import.

## Commands

```bash
pnpm seed tags --dry-run     # Validate
pnpm seed tags               # Full seed (idempotent)
pnpm seed tags --clear-cache # Re-download SVGs
```

## Environment

```bash
PAYLOAD_SECRET=your-secret
```

## Data

### Meditation tags (24)

User emotional-state categories, each with a color:

| Title | Slug | Color |
|-------|------|-------|
| Excited for the day | `excited-today` | `#FFD591` |
| Stressed and tense | `stressed-tense` | `#DF8D7A` |
| Sad, emotionally down | `emotionally-down` | `#DF8E7A` |
| Can't wake up, lethargic | `feeling-lethargic` | `#A4D9D1` |
| Too many thoughts | `hard-to-focus` | `#DF8D7A` |
| ... | ... | ... |

### Music tags (4)

Background music categories, no colors:

| Title | Slug |
|-------|------|
| Nature | `nature` |
| Flute | `flute` |
| None | `none` |
| Strings | `strings` |

## SVG processing

1. Downloads SVG icons from Cloudinary URLs
2. Replaces hardcoded hex colors (`#RRGGBB`, `#RGB`) with `currentColor`
3. Caches locally in `seeds/cache/tags/assets/`
4. Uploads the SVGs as file attachments

**Before** (hardcoded):
```xml
<path fill="#FFD591" d="..." />
```

**After** (themeable):
```xml
<path fill="currentColor" d="..." />
```

## Idempotent updates

- First run: creates all tags.
- Later runs: update existing tags by slug. No duplicates.

## Troubleshooting

**SVG download errors** — check the internet connection and the Cloudinary
URLs are reachable. Use `--clear-cache` to re-download.

**Tag creation errors** — check the Payload configuration and that
`PAYLOAD_SECRET` is set. Run `pnpm generate:types` if types are stale.
