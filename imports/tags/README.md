# Meditation & Music Tags Import

This script imports MeditationTags (24 items) and MusicTags (4 items) from Cloudinary-hosted SVG assets into Payload CMS.

## Overview

**Source**: Cloudinary-hosted SVG icons with predefined tag data
**Target**: PayloadCMS `meditation-tags` and `music-tags` collections

### Data Imported

| Collection | Items | Fields |
|------------|-------|--------|
| Meditation Tags | 24 | title, slug, color, SVG icon |
| Music Tags | 4 | title, slug, SVG icon |

## Quick Start

```bash
# Dry run - validate without writing to database
npx tsx imports/tags/import.ts --dry-run

# Full import - creates new tags, updates existing ones
npx tsx imports/tags/import.ts

# Clean import - delete all existing tags first
npx tsx imports/tags/import.ts --reset

# Fresh start - clear cache and reset
npx tsx imports/tags/import.ts --clear-cache --reset
```

## Command Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate data and SVGs without writing to database |
| `--reset` | Delete all existing tags before import |
| `--clear-cache` | Clear downloaded SVG cache before import |

## Features

### SVG Color Processing

The script downloads SVG icons from Cloudinary and processes them for theming flexibility:

**Before** (hardcoded color):
```xml
<path fill="#FFD591" d="..." />
<circle fill="#FFD591" r="5" />
```

**After** (themeable):
```xml
<path fill="currentColor" d="..." />
<circle fill="currentColor" r="5" />
```

This allows the SVG icons to inherit the text color from their parent element, enabling dynamic theming in the frontend.

### Idempotent Updates

Running the script multiple times is safe:
- First run: Creates all tags
- Subsequent runs: Updates existing tags with matching slugs (no duplicates)

### Local Caching

Downloaded SVGs are cached locally in `imports/cache/tags/assets/`:
- `meditation-{slug}.svg` - Original SVG files from Cloudinary
- `music-{slug}.svg` - Original SVG files from Cloudinary

Use `--clear-cache` to re-download all SVGs.

## Tag Data

### Meditation Tags (24 items)

Categories for user emotional states:

| Title | Slug | Color |
|-------|------|-------|
| Excited for the day | `excited-today` | `#FFD591` |
| Stressed and tense | `stressed-tense` | `#DF8D7A` |
| Sad, emotionally down | `emotionally-down` | `#DF8E7A` |
| Can't wake up, lethargic | `feeling-lethargic` | `#A4D9D1` |
| Too many thoughts | `hard-to-focus` | `#DF8D7A` |
| ... and 19 more | | |

### Music Tags (4 items)

Categories for background music:

| Title | Slug |
|-------|------|
| Nature | `nature` |
| Flute | `flute` |
| None | `none` |
| Strings | `strings` |

**Note**: The `music-tags` collection does not have a color field. The color data is only used for SVG processing.

## Environment Variables

The script requires the standard Payload environment variables:

```env
PAYLOAD_SECRET=your-secret-key
```

## File Structure

```
imports/
├── tags/
│   ├── import.ts       # Main import script
│   └── README.md       # This file
└── cache/
    └── tags/
        ├── import.log  # Import log file
        └── assets/     # Downloaded SVG cache
            ├── meditation-*.svg
            └── music-*.svg
```

## Troubleshooting

### SVG Download Errors

If SVGs fail to download:
1. Check your internet connection
2. Verify Cloudinary URLs are accessible
3. Try with `--clear-cache` to re-download

### Tag Creation Errors

If tag creation fails:
1. Check that Payload is properly configured
2. Verify `PAYLOAD_SECRET` is set
3. Run with `--dry-run` to validate data first

### Database Issues

If you encounter database errors:
1. Run `pnpm generate:types` to regenerate types
2. Run `pnpm payload migrate` if migrations are pending
3. Check database connection settings

## Related Documentation

- [Main Migration README](../README.md)
- [MeditationTags Collection](../../src/collections/tags/MeditationTags.ts)
- [MusicTags Collection](../../src/collections/tags/MusicTags.ts)
