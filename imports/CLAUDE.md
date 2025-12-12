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
| wemeditate | `pnpm import wemeditate` | PostgreSQL installed | pages, authors, page-tags, albums |
| meditations | `pnpm import meditations` | Run `tags` + `wemeditate` first, PostgreSQL | meditations, frames, music, narrators |
| tags | `pnpm import tags` | None | meditation-tags, music-tags |

**Import Order**: For a full import, run scripts in this order:
1. `pnpm import tags` - Creates tag definitions
2. `pnpm import wemeditate` - Creates albums (music requires albums)
3. `pnpm import meditations` - Creates meditations and music (matches music to albums by credit/artist)

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
├── wemeditate/import.ts   # WeMeditate Rails DB import
├── meditations/import.ts  # Meditations PostgreSQL import
├── tags/import.ts         # Cloudinary SVG tags import
├── lib/                   # Shared utilities (BaseImporter, Logger, etc.)
├── tests/                 # Test infrastructure
├── cache/                 # Downloaded files (git-ignored)
├── run.ts                 # Unified CLI runner
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
