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

**Environment variables**:

- `SAHAJCLOUD_URL` - Target URL (default: `http://localhost:PORT`)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` - **only needed for a remote target** (loaded
  from `.env.local` by `seeds/env.ts`)

**Seeding localhost needs no credentials.** Local dev enables Payload's
`admin.autoLogin` (`src/payload.config.ts`), which Payload applies in its JWT
auth strategy — a request carrying no token is authenticated as that admin. The
CLI probes `/api/managers/me`, and when the target auto-logs-in it skips the
login step and sends its requests without an `Authorization` header. Leave
`ADMIN_PASSWORD` blank or unset locally; production and E2E disable auto-login,
so they fall through to the credential path on their own.

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

Pagination enables large imports to run efficiently by splitting work across multiple HTTP requests. The CLI uses pagination for all collections where `requiresPagination: true`.

### How It Works

1. **Metadata Fetch**: CLI fetches metadata via GET to determine batch sizes
2. **Pagination Decision**: Uses pagination when `requiresPagination: true` in metadata
3. **Collection Ordering**: Collections are imported in dependency order
4. **Stateless Execution**: Each request is independent; ID maps are reconstructed from database

### Batch Sizes

| Collection Type   | Batch Size |
| ----------------- | ---------- |
| Without Uploads   | 100        |
| With File Uploads | 10         |

### Collection Metadata

Each script has collection-level metadata in `seeds/lib/expectedCounts.ts`:

| Script      | Collection   | Items | Paginated? | Dependencies            |
| ----------- | ------------ | ----- | ---------- | ----------------------- |
| tags        | user-choices | 27    | No         | None                    |
| tags        | music-tags   | 7     | No         | None                    |
| wemeditate  | authors      | 18    | No         | None                    |
| wemeditate  | albums       | 8     | No         | None                    |
| wemeditate  | music        | 27    | No         | albums                  |
| wemeditate  | pages        | 60    | Yes        | authors                 |
| meditations | narrators    | 2     | No         | None                    |
| meditations | frames       | 60    | Yes        | None                    |
| meditations | meditations  | 73    | Yes        | narrators, frames, tags |
| storyblok   | lessons      | 17    | Yes        | None                    |
| storyblok   | lectures     | 0     | No         | None                    |
| atlas       | managers      | 327   | No         | None                    |
| atlas       | regions       | 482   | No         | managers                |
| atlas       | users         | 755   | Yes        | None                    |
| atlas       | events        | 511   | Yes        | managers, regions       |
| atlas       | registrations | 886   | Yes        | events, users           |
| atlas       | clients       | 25    | No         | managers                |

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

| Script      | Command                 | Prerequisites                              | Target Collections                    |
| ----------- | ----------------------- | ------------------------------------------ | ------------------------------------- |
| storyblok   | `pnpm seed storyblok`   | STORYBLOK_ACCESS_TOKEN                     | lessons, images, files                |
| wemeditate  | `pnpm seed wemeditate`  | data.json (pre-extracted)                  | pages, authors, page-tags, albums     |
| meditations | `pnpm seed meditations` | Run `tags` + `wemeditate` first, data.json | meditations, frames, music, narrators |
| tags        | `pnpm seed tags`        | None                                       | user-choices, music-tags              |
| atlas       | `pnpm seed atlas`       | The 8 JSON dumps in `seeds/atlas/data/`    | managers, regions, users, events, registrations, clients |

**Seed Order**: For a full seed, run scripts in this order:

1. `pnpm seed tags` - Creates tag definitions
2. `pnpm seed wemeditate` - Creates albums (music requires albums)
3. `pnpm seed meditations` - Creates meditations and music (matches music to albums by credit/artist)

`atlas` is **independent of the chain above** — it populates a disjoint set of
collections (Sahaj Atlas managers/regions/users/events/registrations/clients) and
can run at any point. Its own six collections do have an internal order, which
the importer handles; `SCRIPT_RUN_ORDER` in [run.ts](run.ts) places it last.

Atlas reads its eight pre-extracted dumps from `seeds/atlas/data/` (regenerated
by [atlas/extract.ts](atlas/extract.ts) from a PostgreSQL dump — note that
`events.json` carries hand-curated `website` values that a re-extraction drops;
see [atlas/AGENTS.md](atlas/AGENTS.md)). For the Atlas-specific backend surface
and importer decisions, see [atlas/AGENTS.md](atlas/AGENTS.md) and
[atlas/MIGRATION_PLAN.md](atlas/MIGRATION_PLAN.md).

## Common Flags

| Flag            | Description                                      |
| --------------- | ------------------------------------------------ |
| `--dry-run`     | Validate data without writing to database        |
| `--clear-cache` | Clear downloaded files before import             |
| `--update`      | Update existing records (default: skip existing) |

## Skip Mode vs Update Mode

By default, seed scripts run in **skip mode** - existing documents are skipped entirely (no updates, no file re-uploads). This dramatically reduces DB queries and speeds up imports when adding new content.

Use `--update` flag to enable **update mode** (upsert behavior) when content has changed:

| Mode                | Behavior                            | DB Queries                           | Use Case                                    |
| ------------------- | ----------------------------------- | ------------------------------------ | ------------------------------------------- |
| Skip (default)      | Skip existing docs, only create new | Minimal (bulk preload + creates)     | Adding new content, resuming failed imports |
| Update (`--update`) | Update existing + create new        | Bulk preload + update/create per doc | Content has changed, fixing data issues     |

### How It Works

1. **Bulk Preload**: On startup, each importer preloads relevant collections into memory with only the fields needed for existence checks (id + natural key)
2. **Skip Mode**: If document exists in preload cache, skip entirely (no DB operation, no file upload)
3. **Update Mode**: If document exists, update directly using cached ID (no find query needed)
4. **New Documents**: If not in cache, create new document

### Query Reduction

| Scenario                     | Before (per-doc find)       | After (bulk preload)            |
| ---------------------------- | --------------------------- | ------------------------------- |
| 73 meditations, all exist    | 146 queries (find + skip)   | 2 queries (preload + done)      |
| 73 meditations, all new      | 146 queries (find + create) | ~75 queries (preload + creates) |
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

For local development, add to `.env.local` (gitignored):

```bash
# CLI Authentication — only for seeding a REMOTE target; auto-login covers
# localhost, so these can be left blank for local development.
ADMIN_EMAIL=
ADMIN_PASSWORD=
PAYLOAD_SECRET=your-secret-key

# Storyblok
STORYBLOK_ACCESS_TOKEN=your-token

# Meditations
STORAGE_BASE_URL=https://storage.googleapis.com/your-bucket
```

For seeding production, provide credentials via shell and target production:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=prod-password SAHAJCLOUD_URL=https://cloud.sydevelopers.com pnpm seed <script>
```

## Design Principles

1. **Idempotent**: Uses slug-based upsert - finds existing records and updates, or creates new
2. **Resilient**: Continues on errors, reports all issues at end
3. **Comprehensive Reporting**: Summary with counts, warnings, errors

## Maintenance: Updating Seed Scripts

**When collection fields change, update corresponding seed scripts:**

If you add a new field to a collection (e.g., adding `timings` to Meditations), the seed script must be updated to populate that field. Otherwise, seeded documents will have the field empty/default.

**Checklist for field additions:**

1. Identify which seed script populates the collection
2. Update the importer to extract/compute the new field value from source data
3. Add the field to the `upsert()` data object
4. Test with `--dry-run` to verify the mapping
5. Run full seed with `--update` flag to update existing documents

**Example** (adding `timings` field to meditations):

```typescript
// Extract timing values from legacy tags
const TIMING_SLUGS = new Set(['morning', 'afternoon', 'evening'])

private extractTimingsFromTags(taggings, allTags) {
  const timings = []
  for (const tagging of taggings) {
    const tag = allTags.find(t => t.id === tagging.tag_id)
    const slug = this.mapLegacyTagSlug(tag?.name)
    if (TIMING_SLUGS.has(slug)) {
      timings.push(slug)
    }
  }
  return [...new Set(timings)]
}

// Include in upsert
await this.upsert('meditations', where, {
  ...otherFields,
  timings: this.extractTimingsFromTags(taggings, allTags),
})
```

## Utility Architecture

Import scripts use centralized utilities in `seeds/lib/` for common patterns like rate limiting, retries, and data loading.

### Delay Utilities (`delays.ts`)

```typescript
import { rateLimitDelay, withRetry } from '../lib'

// Rate limit delay
await rateLimitDelay(300)

// Retry with exponential backoff
const result = await withRetry(() => fetchData(), { maxRetries: 3 })
```

| Function              | Behavior                         |
| --------------------- | -------------------------------- |
| `rateLimitDelay(ms)`  | Waits ms                         |
| `withRetry(fn, opts)` | Retries with exponential backoff |

### Data Loading (`dataLoader.ts`)

```typescript
import { fetchAsset, readCache, writeCache, loadJsonData } from '../lib'

// Load JSON data file (fs locally, URL in Workers)
const data = await loadJsonData<MyType>({
  localPath: 'seeds/data.json',
  workerUrl: 'https://raw.githubusercontent.com/.../data.json',
})

// Fetch asset with caching (cache only works locally)
const buffer = await fetchAsset(url, { cachePath: 'seeds/cache/file.jpg' })

// Direct cache operations (no-op in Workers)
const cached = await readCache('seeds/cache/file.jpg')
await writeCache('seeds/cache/file.jpg', buffer)
```

| Function                 | Local Mode             | Workers Mode             |
| ------------------------ | ---------------------- | ------------------------ |
| `loadDataFile(source)`   | Reads from `localPath` | Fetches from `workerUrl` |
| `fetchAsset(url, opts)`  | Caches to `cachePath`  | Streams directly         |
| `readCache(path)`        | Returns file buffer    | Returns `null`           |
| `writeCache(path, data)` | Writes to disk         | No-op                    |
| `cacheExists(path)`      | Checks file exists     | Returns `false`          |

## File Organization

```
seeds/
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
│   ├── runtime.ts         # Buffer conversion helpers (Node)
│   ├── delays.ts          # Rate limiting and retry utilities
│   ├── dataLoader.ts      # Data loading and caching
│   ├── fileUtils.ts       # File operations and MIME type detection
│   ├── logger.ts          # Console logging (no file output)
│   └── ...                # Other shared utilities
├── cache/                 # Downloaded files (git-ignored, local dev only)
├── run.ts                 # CLI runner (HTTP client that calls API endpoint)
└── extract-to-json.ts     # One-time PostgreSQL data extraction script

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

- `seeds/wemeditate/data.json` - WeMeditate Rails database extract
- `seeds/meditations/data.json` - Meditations database extract

These files were generated from PostgreSQL dumps using `seeds/extract-to-json.ts` (one-time extraction).
If you need to regenerate them from original `data.bin` files:

```bash
# Requires PostgreSQL installed locally
pnpm tsx seeds/extract-to-json.ts
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

## Creating a New Seed Script

This section provides a checklist and code patterns for implementing new seed scripts.

### Checklist

1. **Create script folder**: `seeds/<script-name>/`
2. **Create import file**: `seeds/<script-name>/import.ts` extending `BaseImporter`
3. **Add script metadata**: Update `seeds/lib/expectedCounts.ts` with collection metadata
4. **Register script**: Add to `getImporter()` function in `src/app/(payload)/api/seed/[script]/route.ts`
5. **Document**: Add script to "Available Scripts" table in `seeds/AGENTS.md`

### Code Template

```typescript
import path from 'path'
import { BaseImporter, type BaseImportOptions } from '../lib'

export interface MyScriptOptions extends BaseImportOptions {
  // Add any script-specific options here
}

export class MyScriptImporter extends BaseImporter<MyScriptOptions> {
  protected readonly importName = 'My Script'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/my-script')

  protected async setup(): Promise<void> {
    // Preload collections for skip/update optimization
    // This enables O(1) lookups for existing documents
    await this.preloadCollection('target-collection', 'slug')
  }

  protected async import(): Promise<void> {
    const items = await this.loadData()

    for (const item of items) {
      try {
        await this.upsert(
          'target-collection',
          { slug: { equals: item.slug } },
          {
            title: item.title,
            slug: item.slug,
            // ... other fields
          },
          { identifier: item.slug }, // Always pass explicit identifier
        )
      } catch (error) {
        // Resilient error handling - continue processing other items
        this.addError(`Item ${item.id}`, error)
        continue
      }
    }
  }

  private async loadData(): Promise<MyDataType[]> {
    // Use loadJsonData for dual-mode (local/Workers) support
    const { loadJsonData } = await import('../lib/dataLoader')
    return loadJsonData<MyDataType[]>({
      localPath: 'seeds/my-script/data.json',
      workerUrl:
        'https://raw.githubusercontent.com/sydevs/SahajCloud/main/seeds/my-script/data.json',
    })
  }
}

export default MyScriptImporter
```

### Required Patterns

#### 1. Preload Pattern

Preload collections in `setup()` for skip/update optimization:

```typescript
protected async setup(): Promise<void> {
  // Single field preload
  await this.preloadCollection('meditations', 'slug')

  // Multi-field preload (for composite keys)
  await this.preloadCollection('music', 'slug', ['id', 'slug', 'album'])
}
```

#### 2. Upsert Pattern with Natural Keys

Always use natural keys (not IDs) for idempotent imports:

```typescript
await this.upsert(
  'pages',
  { slug: { equals: page.slug } }, // Natural key where clause
  { title: page.title, slug: page.slug },
  { identifier: page.slug }, // Explicit identifier for logging
)
```

#### 3. Error Handling

Use per-item try/catch with `this.addError()` for resilient imports:

```typescript
for (const item of items) {
  try {
    await this.processItem(item)
  } catch (error) {
    this.addError(`Item ${item.id}`, error)
    continue // Keep processing other items
  }
}
```

#### 4. Pagination Support

For collections that may exceed 25 items in production, enable pagination in `expectedCounts.ts`:

```typescript
'my-collection': {
  expectedCount: 100,
  requiresPagination: true,  // Enables paginated import on Workers
  hasFileUploads: false,
}
```

#### 5. Media Upload Pattern

For file uploads, use the MediaUploader helper:

```typescript
import { MediaUploader } from '../lib/MediaUploader'

const uploader = new MediaUploader(this.payload, this.options.dryRun)
const media = await uploader.uploadFromUrl({
  url: item.imageUrl,
  collection: 'images',
  filename: `${item.slug}.jpg`,
  alt: item.title,
})
```

#### 6. Locale Handling

For localized content, specify locale in upsert:

```typescript
await this.upsert(
  'pages',
  { slug: { equals: page.slug } },
  { title: { en: page.title_en, cs: page.title_cs } },
  { identifier: page.slug, locale: 'en' },
)
```

---

## Identified Inconsistencies

The following inconsistencies exist across seed scripts and are documented for future standardization:

| Area               | Current State                                                                                | Recommended Pattern                          | Priority |
| ------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------- | -------- |
| Data source        | Mixed: embedded constants (tags), JSON files (wemeditate/meditations), API fetch (storyblok) | Document rationale for each approach         | Low      |
| Error handling     | Mixed: try/catch per-item vs entire loop                                                     | Per-item with `this.addError()` continuation | Medium   |
| Locale handling    | Varies: hardcoded 'en', full 16-locale, none                                                 | Document requirements per script             | Low      |
| Custom preload     | storyblok uses manual composite keys                                                         | Consider `preloadWithCompositeKey()` helper  | Medium   |
| Identifier passing | Inconsistent explicit vs auto-generated                                                      | Always pass explicit `identifier`            | Low      |

### Follow-up Issues

These inconsistencies should be addressed in separate issues:

1. **Standardize error handling** - Ensure all scripts use per-item try/catch with `this.addError()`
2. **Add preloadWithCompositeKey helper** - Abstract storyblok's composite key pattern into BaseImporter
3. **Standardize identifier passing** - Update all scripts to pass explicit identifiers
