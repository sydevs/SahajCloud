# Data Seed Scripts

Scripts for seeding content from external sources into Payload CMS. All scripts use `BaseImporter` for idempotent, resilient imports.

## Quick Start

### CLI Usage

The CLI (`pnpm seed`) is a thin HTTP client that calls the seed API endpoint.
It can target both local development and production environments.

```bash
# Show available scripts
pnpm seed --help

# Run seed with dry-run validation (local dev)
pnpm seed <script> --dry-run

# Run full seed (idempotent - safe to re-run)
pnpm seed <script>

# Seed production database
SAHAJCLOUD_URL=https://cloud.sydevelopers.com pnpm seed <script>
```

**Required environment variables** (set in `.env` or shell):
- `ADMIN_EMAIL` - Admin email for authentication
- `ADMIN_PASSWORD` - Admin password for authentication
- `SAHAJCLOUD_URL` - Target URL (default: `http://localhost:PORT`)

### API Route

The CLI calls the seed API endpoint which handles all import logic:

```
POST /api/seed/<script>?dryRun=true&clearCache=false
```

- **Authentication**: Requires admin session (Manager with `admin: true`)
- **Response**: Server-Sent Events (SSE) with progress updates
- **Scripts**: `tags`, `wemeditate`, `meditations`, `storyblok`

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
# CLI Authentication (required for pnpm seed)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-password
SAHAJCLOUD_URL=https://cloud.sydevelopers.com  # Optional, defaults to localhost

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
4. **Dual-Mode**: Works identically in local development and Cloudflare Workers

## Dual-Mode Architecture

Import scripts run in two environments with different capabilities:
- **Local development**: Full filesystem access, caching for faster iteration
- **Cloudflare Workers**: No filesystem, streaming only

All environment-specific logic is abstracted into `imports/lib/` utilities. **Import scripts should never call `isCloudflareWorker()` directly or use `fs` imports.**

### Delay Utilities (`delays.ts`)

```typescript
import { rateLimitDelay, withRetry } from '../lib'

// Rate limit delay - skips entirely in local mode (0ms)
await rateLimitDelay(300)

// Retry with exponential backoff (delays skip locally)
const result = await withRetry(() => fetchData(), { maxRetries: 3 })
```

| Function | Local Mode | Workers Mode |
|----------|------------|--------------|
| `rateLimitDelay(ms)` | Skips (0ms) | Waits ms |
| `withRetry(fn, opts)` | Retries with 0ms delays | Retries with exponential backoff |

### Data Loading (`dataLoader.ts`)

```typescript
import { fetchAsset, readCache, writeCache, loadJsonData } from '../lib'

// Load JSON data file (fs locally, URL in Workers)
const data = await loadJsonData<MyType>({
  localPath: 'imports/data.json',
  workerUrl: 'https://raw.githubusercontent.com/.../data.json',
})

// Fetch asset with caching (cache only works locally)
const buffer = await fetchAsset(url, { cachePath: 'imports/cache/file.jpg' })

// Direct cache operations (no-op in Workers)
const cached = await readCache('imports/cache/file.jpg')
await writeCache('imports/cache/file.jpg', buffer)
```

| Function | Local Mode | Workers Mode |
|----------|------------|--------------|
| `loadDataFile(source)` | Reads from `localPath` | Fetches from `workerUrl` |
| `fetchAsset(url, opts)` | Caches to `cachePath` | Streams directly |
| `readCache(path)` | Returns file buffer | Returns `null` |
| `writeCache(path, data)` | Writes to disk | No-op |
| `cacheExists(path)` | Checks file exists | Returns `false` |

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
├── lib/
│   ├── BaseImporter.ts    # Abstract base class for all importers
│   ├── runtime.ts         # Cloudflare Worker detection (internal use only)
│   ├── delays.ts          # Rate limiting and retry utilities
│   ├── dataLoader.ts      # Dual-mode data loading and caching
│   ├── fileUtils.ts       # File operations and MIME type detection
│   ├── logger.ts          # Console logging (no file output)
│   └── ...                # Other shared utilities
├── cache/                 # Downloaded files (git-ignored, local dev only)
├── run.ts                 # CLI runner (HTTP client that calls API endpoint)
├── extract-to-json.ts     # One-time PostgreSQL data extraction script
└── reset-migrations.sh    # Database migration reset script

src/app/(payload)/api/seed/[script]/route.ts  # API route for post-deployment seeding
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
1. Run with `--dry-run` first to validate data
2. Use `--clear-cache` to re-download files
3. Check console output for detailed error messages

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
