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
GET  /api/seed/<script>                    # Get metadata (collections, batch sizes)
POST /api/seed/<script>?dryRun=true        # Bulk import (all at once)
POST /api/seed/<script>?collection=X&offset=0&limit=25  # Paginated import
```

- **Authentication**: Requires admin session (Manager with `admin: true`)
- **Response**: Server-Sent Events (SSE) with progress updates
- **Scripts**: `tags`, `wemeditate`, `meditations`, `storyblok`

## Pagination Support

Pagination enables large imports to run on Cloudflare Workers without hitting D1 rate limits (~10 queries/sec, 6 simultaneous connections). The CLI uses pagination for all collections where `requiresPagination: true`, regardless of environment, ensuring test parity between local and production.

### How It Works

1. **Metadata Fetch**: CLI fetches metadata via GET to determine batch sizes
2. **Pagination Decision**: Uses pagination when `requiresPagination: true` in metadata (batch sizes are environment-aware)
3. **Collection Ordering**: Collections are imported in dependency order
4. **Stateless Execution**: Each request is independent; ID maps are reconstructed from database

### Batch Sizes

| Environment | Without Uploads | With File Uploads |
|-------------|-----------------|-------------------|
| Local Dev   | 100             | 10                |
| Workers     | 25              | 10                |

### Collection Metadata

Each script has collection-level metadata in `imports/lib/expectedCounts.ts`:

| Script | Collection | Items | Paginated? | Dependencies |
|--------|------------|-------|------------|--------------|
| tags | meditation-tags | 27 | No | None |
| tags | music-tags | 7 | No | None |
| wemeditate | authors | 18 | No | None |
| wemeditate | albums | 8 | No | None |
| wemeditate | music | 27 | No | albums |
| wemeditate | pages | 60 | Yes | authors |
| meditations | narrators | 2 | No | None |
| meditations | frames | 60 | Yes | None |
| meditations | meditations | 73 | Yes | narrators, frames, tags |
| storyblok | lessons | 17 | Yes | None |
| storyblok | lectures | 0 | No | None |

> **Note (meditations script)**: When targeting `collection=meditations`, the importer automatically runs `narrators`, `frames`, and `tags` imports in the same request (in bulk, without pagination). This ensures the ID maps are populated for keyframe and tag references. The meditations themselves are then processed with pagination if enabled.

### API Response: Pagination Result

When using pagination parameters, the completion event includes pagination info:

```json
{
  "type": "complete",
  "summary": { ... },
  "pagination": {
    "offset": 0,
    "limit": 25,
    "processedCount": 25,
    "hasMore": true,
    "nextOffset": 25,
    "collection": "meditations"
  }
}
```

### CLI Pagination Mode

The CLI automatically orchestrates paginated imports on Workers:

```
📋 Fetching metadata for meditations...
   Environment: workers
   Total items: 135
   Requires pagination: true

📁 Processing narrators (2 items)
   Running bulk import...
   ✓ 2 items imported

📁 Processing frames (60 items)
   Batch 1: offset=0, limit=10
   ✓ Processed 10 items, hasMore=true
   Batch 2: offset=10, limit=10
   ✓ Processed 10 items, hasMore=true
   ...
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
| `--update` | Update existing records (default: skip existing) |

## Skip Mode vs Update Mode

By default, seed scripts run in **skip mode** - existing documents are skipped entirely (no updates, no file re-uploads). This dramatically reduces D1 queries and speeds up imports when adding new content.

Use `--update` flag to enable **update mode** (upsert behavior) when content has changed:

| Mode | Behavior | D1 Queries | Use Case |
|------|----------|------------|----------|
| Skip (default) | Skip existing docs, only create new | Minimal (bulk preload + creates) | Adding new content, resuming failed imports |
| Update (`--update`) | Update existing + create new | Bulk preload + update/create per doc | Content has changed, fixing data issues |

### How It Works

1. **Bulk Preload**: On startup, each importer preloads relevant collections into memory with only the fields needed for existence checks (id + natural key)
2. **Skip Mode**: If document exists in preload cache, skip entirely (no DB operation, no file upload)
3. **Update Mode**: If document exists, update directly using cached ID (no find query needed)
4. **New Documents**: If not in cache, create new document

### Query Reduction

| Scenario | Before (per-doc find) | After (bulk preload) |
|----------|----------------------|---------------------|
| 73 meditations, all exist | 146 queries (find + skip) | 2 queries (preload + done) |
| 73 meditations, all new | 146 queries (find + create) | ~75 queries (preload + creates) |
| 73 meditations with --update | 146 queries (find + update) | ~75 queries (preload + updates) |

### Examples

```bash
# Skip mode (default) - fastest for adding new content
pnpm seed meditations

# Update mode - when content has changed
pnpm seed meditations --update

# Dry run still works with both modes
pnpm seed meditations --dry-run
pnpm seed meditations --update --dry-run
```

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
│   ├── pagination.ts      # Pagination types and utilities
│   ├── expectedCounts.ts  # Collection metadata and verification
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

## Reset Scripts

### Database and Asset Storage Reset

A comprehensive reset script that clears databases and all Cloudflare asset storage (R2, Images, Stream).

```bash
# Reset both environments (default, prompts for confirmation)
pnpm reset

# Reset local environment only
pnpm reset --local

# Reset production environment only (prompts for confirmation)
pnpm reset --production

# Skip confirmation prompt (for automation)
pnpm reset --yes
```

**Environment Variables Required for Production Reset**:
```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id           # Already in wrangler.toml
CLOUDFLARE_API_KEY=your-api-token               # For Images & Stream deletion
CLOUDFLARE_R2_ACCESS_KEY_ID=your-r2-key         # For R2 bucket deletion
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-r2-secret  # For R2 bucket deletion
```

**What it resets**:

| Component | Local | Production |
|-----------|-------|------------|
| Database | `local.db`, `.wrangler/state/`, `tests/.e2e.sqlite` | D1 `sahajcloud` (drops all tables) |
| R2 | N/A | `sahajcloud` bucket (batch delete via S3 API) |
| Images | N/A | All Cloudflare Images (individual delete) |
| Stream | N/A | All Cloudflare Stream videos (individual delete) |
| Local uploads | `public/{images,meditations,...}` | N/A |

**After reset**:
1. Run local migrations: `pnpm payload migrate`
2. Deploy production migrations: `pnpm run deploy:database`
3. Re-seed data: `pnpm seed`

### Migration Reset Script (Legacy)

**WARNING**: The `reset-migrations.sh` script is now legacy. Use `pnpm reset --production` instead for database resets.

```bash
# Preview what will happen (no changes made)
./imports/reset-migrations.sh --dry-run

# Execute full reset
./imports/reset-migrations.sh
```

**What it does** (in addition to database reset):
1. Deletes all migration files in `src/migrations/`
2. Resets `src/migrations/index.ts` to empty array
3. Generates a fresh initial migration
4. Renames migration to `*_initial_schema`
5. Deploys migration to production

**Use cases**:
- Consolidating multiple migrations into a single initial migration
- Fixing migration state inconsistencies

**Note**: The `payload migrate:fresh` command doesn't work with Cloudflare D1 adapter. This script uses wrangler to drop tables directly.
