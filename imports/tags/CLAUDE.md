# Tags Import

Imports MeditationTags (24 items) and MusicTags (4 items) from Cloudinary-hosted SVG assets.

## No Prerequisites

Can run independently. Should run **before** meditations import.

## Commands

```bash
pnpm import tags --dry-run     # Validate
pnpm import tags               # Full import (idempotent)
pnpm import tags --clear-cache # Re-download SVGs
```

## Environment

```bash
PAYLOAD_SECRET=your-secret
```

## Data

### Meditation Tags (24)

User emotional state categories with colors:

| Title | Slug | Color |
|-------|------|-------|
| Excited for the day | `excited-today` | `#FFD591` |
| Stressed and tense | `stressed-tense` | `#DF8D7A` |
| Sad, emotionally down | `emotionally-down` | `#DF8E7A` |
| Can't wake up, lethargic | `feeling-lethargic` | `#A4D9D1` |
| Too many thoughts | `hard-to-focus` | `#DF8D7A` |
| ... | ... | ... |

### Music Tags (4)

Background music categories (no colors):

| Title | Slug |
|-------|------|
| Nature | `nature` |
| Flute | `flute` |
| None | `none` |
| Strings | `strings` |

## SVG Processing

1. Downloads SVG icons from Cloudinary URLs
2. Replaces hardcoded hex colors (`#RRGGBB`, `#RGB`) with `currentColor`
3. Caches locally in `imports/cache/tags/assets/`
4. Uploads as SVG file attachments

**Before** (hardcoded):
```xml
<path fill="#FFD591" d="..." />
```

**After** (themeable):
```xml
<path fill="currentColor" d="..." />
```

## Idempotent Updates

- First run: Creates all tags
- Subsequent runs: Updates existing tags by slug (no duplicates)

## Troubleshooting

### SVG download errors
- Check internet connection
- Verify Cloudinary URLs accessible
- Use `--clear-cache` to re-download

### Tag creation errors
- Check Payload configuration
- Verify `PAYLOAD_SECRET` is set
- Run `pnpm generate:types` if types are stale
