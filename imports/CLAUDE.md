# Data Seed Scripts

Scripts for seeding content from external sources into Payload CMS. All scripts use `BaseImporter` for idempotent, resilient imports.

## Quick Start

```bash
# Show available scripts
pnpm seed --help

# Run seed with dry-run validation
pnpm seed <script> --dry-run

# Run full seed (idempotent - safe to re-run)
pnpm seed <script>
```

## Available Scripts

| Script | Command | Prerequisites | Target Collections |
|--------|---------|---------------|-------------------|
| storyblok | `pnpm seed storyblok` | STORYBLOK_ACCESS_TOKEN | lessons, images, files |
| wemeditate | `pnpm seed wemeditate` | data.json (pre-extracted) | pages, authors, page-tags, albums |
| meditations | `pnpm seed meditations` | Run `tags` + `wemeditate` first, data.json | meditations, frames, music, narrators |
| tags | `pnpm seed tags` | None | meditation-tags, music-tags |

**Seed Order**: For a full seed, run scripts in this order:
1. `pnpm seed tags` - Creates tag definitions
2. `pnpm seed wemeditate` - Creates albums (music requires albums)
3. `pnpm seed meditations` - Creates meditations and music (matches music to albums by credit/artist)

## Common Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate data without writing to database |
| `--clear-cache` | Clear downloaded files before import |

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
├── wemeditate/
│   ├── import.ts          # WeMeditate Rails data import (reads JSON)
│   ├── data.json          # Pre-extracted data from Rails PostgreSQL
│   └── data.bin           # Original PostgreSQL dump (optional, for re-extraction)
├── meditations/
│   ├── import.ts          # Meditations data import (reads JSON)
│   ├── data.json          # Pre-extracted meditation data
│   └── data.bin           # Original PostgreSQL dump (optional, for re-extraction)
├── tags/import.ts         # Cloudinary SVG tags import
├── lib/                   # Shared utilities (BaseImporter, Logger, etc.)
├── tests/                 # Test infrastructure
├── cache/                 # Downloaded files (git-ignored)
├── run.ts                 # Unified CLI runner
├── extract-to-json.ts     # One-time PostgreSQL data extraction script
└── reset-migrations.sh    # Database migration reset script
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

### Missing data.json Files
The `wemeditate` and `meditations` imports require pre-extracted JSON data files:
- `imports/wemeditate/data.json` - WeMeditate Rails database extract
- `imports/meditations/data.json` - Meditations database extract

These files were generated from PostgreSQL dumps using `imports/extract-to-json.ts` (one-time extraction).
If you need to regenerate them from original `data.bin` files:
```bash
# Requires PostgreSQL installed locally
pnpm tsx imports/extract-to-json.ts
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

---

## Database Reset Script

A separate script for completely resetting migrations and the production database.

### reset-migrations.sh

**WARNING**: This script deletes ALL data in the production database.

```bash
# Preview what will happen (no changes made)
./imports/reset-migrations.sh --dry-run

# Execute full reset
./imports/reset-migrations.sh
```

**What it does**:
1. Deletes all migration files in `src/migrations/`
2. Resets `src/migrations/index.ts` to empty array
3. Drops ALL tables in production D1 database
4. Generates a fresh initial migration
5. Renames migration to `*_initial_schema`
6. Deploys migration to production
7. Verifies success

**Use cases**:
- Consolidating multiple migrations into a single initial migration
- Fixing migration state inconsistencies
- Complete fresh start of production database

**Note**: The `payload migrate:fresh` command doesn't work with Cloudflare D1 adapter. This script uses wrangler to drop tables directly.
