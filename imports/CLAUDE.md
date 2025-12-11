# Data Import Scripts

Scripts for importing content from external sources into Payload CMS. All scripts use `BaseImporter` for idempotent, resilient imports.

## Quick Start

```bash
# Show available scripts
pnpm run import --help

# Run import with dry-run validation
pnpm run import <script> --dry-run

# Run full import (idempotent - safe to re-run)
pnpm run import <script>
```

## Available Scripts

| Script | Command | Prerequisites | Target Collections |
|--------|---------|---------------|-------------------|
| storyblok | `pnpm import storyblok` | STORYBLOK_ACCESS_TOKEN | lessons, images, files |
| wemeditate | `pnpm import wemeditate` | PostgreSQL installed | pages, authors, page-tags |
| meditations | `pnpm import meditations` | Run `tags` first, PostgreSQL | meditations, frames, music, narrators |
| tags | `pnpm import tags` | None | meditation-tags, music-tags |

## Common Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate data without writing to database |
| `--clear-cache` | Clear downloaded files before import |
| `--unit=N` | (Storyblok only) Import specific unit 1-4 |

## Environment Variables

```bash
# All scripts
PAYLOAD_SECRET=your-secret-key

# Storyblok
STORYBLOK_ACCESS_TOKEN=your-token

# Meditations
STORAGE_BASE_URL=https://storage.googleapis.com/your-bucket
```

## Design Principles

1. **Idempotent**: Uses slug-based upsert - finds existing records and updates, or creates new
2. **Resilient**: Continues on errors, reports all issues at end
3. **Comprehensive Reporting**: Summary with counts, warnings, errors

## File Organization

```
imports/
├── storyblok/import.ts    # Storyblok CMS API import
├── wemeditate/import.ts   # WeMeditate Rails DB import
├── meditations/import.ts  # Meditations PostgreSQL import
├── tags/import.ts         # Cloudinary SVG tags import
├── lib/                   # Shared utilities (BaseImporter, Logger, etc.)
├── tests/                 # Test infrastructure
├── cache/                 # Downloaded files (git-ignored)
└── run.ts                 # Unified CLI runner
```

## Troubleshooting

### Script Won't Run
```bash
# Check environment variables
echo $PAYLOAD_SECRET
echo $STORYBLOK_ACCESS_TOKEN

# Regenerate Payload types
pnpm generate:types
```

### Errors During Import
1. Check log: `imports/cache/<script>/import.log`
2. Run with `--dry-run` first to validate
3. Use `--clear-cache` to re-download files

### Database Issues (PostgreSQL imports)
```bash
# Check PostgreSQL is running
pg_isready

# Drop temp database manually if stuck
dropdb temp_wemeditate_import
```

## Summary Output Format

```
============================================================
IMPORT SUMMARY
============================================================

Records Created:
  Lessons:             18
  Media Files:         45

Warnings (2):
  1. Missing image for lesson step-3...

No errors - import completed successfully!
============================================================
```
