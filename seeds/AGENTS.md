# Data Seed Scripts

Scripts that seed content from external sources into Payload CMS. All
scripts use `BaseImporter` for idempotent, resilient imports.

## Quick start

### CLI usage

`pnpm seed` is a thin HTTP client that calls the seed API endpoint. It can
target local development or production.

```bash
pnpm seed --help                 # Show available scripts
pnpm seed <script> --dry-run     # Validate (local dev)
pnpm seed <script>               # Full seed (idempotent — safe to re-run)
SAHAJCLOUD_URL=https://cloud.sydevelopers.com pnpm seed <script>  # Seed production
```

**Environment variables:**

- `SAHAJCLOUD_URL` — target URL (default: `http://localhost:PORT`)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — **only needed for a remote target**.
  `seeds/env.ts` resolves them the way Next.js does: a shell-exported (or
  command-prefixed) value wins, then `.env.local`, then `.env` — so the
  blank `ADMIN_PASSWORD=` local dev keeps in `.env.local` never clobbers a
  credential passed for a production run.

**Seeding localhost needs no credentials.** Local dev enables Payload's
`admin.autoLogin` (`src/payload.config.ts`), applied in its JWT auth
strategy — a request with no token authenticates as that admin. The CLI
probes `/api/managers/me`. When the target auto-logs-in, it skips the
login step and sends requests with no `Authorization` header. Leave
`ADMIN_PASSWORD` blank or unset locally — production and E2E disable
auto-login and fall through to the credential path on their own.

### API route

The CLI calls the seed API endpoint, which handles all import logic:

```
GET  /api/seed/<script>                    # Get metadata (collections, batch sizes)
POST /api/seed/<script>?dryRun=true        # Bulk import (all at once)
POST /api/seed/<script>?collection=X&offset=0&limit=25  # Paginated import
```

Requires an admin session (a Manager with `admin: true`). The response is
Server-Sent Events (SSE) with progress updates. Scripts: `tags`,
`wemeditate`, `meditations`, `storyblok`, `atlas`.

## Pagination support

Pagination splits a large import across multiple HTTP requests. The CLI
paginates every collection with `requiresPagination: true`.

1. The CLI fetches metadata (GET) to learn batch sizes.
2. It paginates when metadata says `requiresPagination: true`.
3. Collections import in dependency order.
4. Each request is stateless — ID maps rebuild from the database.

**Batch sizes**: 100 without file uploads, 10 with.

Each script's collection metadata lives in `seeds/lib/expectedCounts.ts`:

| Script      | Collection    | Items | Paginated? | Dependencies            |
| ----------- | ------------- | ----- | ---------- | ------------------------ |
| tags        | user-choices  | 27    | No         | None                    |
| tags        | music-tags    | 7     | No         | None                    |
| wemeditate  | authors       | 18    | No         | None                    |
| wemeditate  | albums        | 8     | No         | None                    |
| wemeditate  | music         | 27    | No         | albums                  |
| wemeditate  | pages         | 60    | Yes        | authors                 |
| meditations | narrators     | 2     | No         | None                    |
| meditations | frames        | 60    | Yes        | None                    |
| meditations | meditations   | 73    | Yes        | narrators, frames, tags |
| storyblok   | lessons       | 17    | Yes        | None                    |
| storyblok   | lectures      | 0     | No         | None                    |
| atlas       | managers      | 495   | No         | None                    |
| atlas       | regions       | 646   | No         | managers                |
| atlas       | users         | 1864  | Yes        | None                    |
| atlas       | events        | 649   | Yes        | managers, regions       |
| atlas       | registrations | 2004  | Yes        | events, users           |
| atlas       | clients       | 31    | No         | managers                |

**Meditations note**: targeting `collection=meditations` also runs
`narrators`, `frames`, and `tags` in bulk (unpaginated) in the same
request, so keyframe and tag ID maps are populated before the meditations
themselves process, paginated if enabled.

The completion event on a paginated request carries a `pagination` block
(`offset`, `limit`, `processedCount`, `hasMore`, `nextOffset`,
`collection`) beside the summary. The CLI reads it to drive the next batch
automatically — printing per-batch progress as it goes.

## Available scripts

| Script      | Command                 | Prerequisites                              | Target Collections                    |
| ----------- | ------------------------ | -------------------------------------------- | ---------------------------------------- |
| storyblok   | `pnpm seed storyblok`   | STORYBLOK_ACCESS_TOKEN                     | lessons, images, files                |
| wemeditate  | `pnpm seed wemeditate`  | data.json (pre-extracted)                  | pages, authors, page-tags, albums     |
| meditations | `pnpm seed meditations` | Run `tags` + `wemeditate` first, data.json | meditations, frames, music, narrators |
| tags        | `pnpm seed tags`        | None                                       | user-choices, music-tags              |
| atlas       | `pnpm seed atlas`       | The 8 JSON dumps in `seeds/atlas/data/`    | managers, regions, users, events, registrations, clients |

**Seed order** for a full seed:

1. `pnpm seed tags` — creates tag definitions
2. `pnpm seed wemeditate` — creates albums (music needs albums)
3. `pnpm seed meditations` — creates meditations and music (matches music
   to albums by credit/artist)

`atlas` is **independent of the chain above** — it populates a disjoint
set of collections and can run at any point. Its own six collections have
an internal order the importer handles. `SCRIPT_RUN_ORDER` in
[run.ts](run.ts) places it last.

Atlas reads its eight pre-extracted dumps from `seeds/atlas/data/`
(regenerated by [atlas/extract.ts](atlas/extract.ts) from a PostgreSQL
dump. Current data is the 2026-08 dump). `events.json` carries curated
`website`/`contactEmail`/`languageCodes` values and a groomed
`customName`/`description`/`room` for most events, all of which a
re-extraction drops — each row's `legacyData` preserves the raw source, so
unchanged rows re-port mechanically. See [atlas/AGENTS.md](atlas/AGENTS.md)
for the procedure. For the Atlas backend surface and importer decisions,
see [atlas/AGENTS.md](atlas/AGENTS.md) and
[atlas/MIGRATION_PLAN.md](atlas/MIGRATION_PLAN.md).

## Common flags

| Flag            | Description                                       |
| --------------- | --------------------------------------------------- |
| `--dry-run`     | Validate data without writing to the database        |
| `--clear-cache` | Clear downloaded files before import                  |
| `--update`      | Update existing records (default: skip existing)      |

## Skip mode vs. update mode

By default, a seed script runs in **skip mode**: it skips existing
documents entirely (no updates, no file re-uploads), which cuts DB queries
and speeds up imports of new content. Pass `--update` for **update mode**
(upsert behavior) when content has changed:

| Mode                | Behavior                            | DB queries                            | Use case                                    |
| -------------------- | -------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Skip (default)      | Skip existing docs, only create new | Minimal (bulk preload + creates)      | Adding new content, resuming failed imports |
| Update (`--update`) | Update existing + create new        | Bulk preload + update/create per doc  | Content has changed, fixing data issues     |

On startup, each importer preloads the relevant collections into memory
with only the fields needed to validate existence (id + natural key). In
skip mode, a cache hit skips the document entirely. In update mode, it
updates using the cached ID. Either way, a cache miss creates.

| Scenario                     | Before (per-doc find)       | After (bulk preload)            |
| ------------------------------- | ------------------------------- | ------------------------------------ |
| 73 meditations, all exist    | 146 queries (find + skip)   | 2 queries (preload + done)      |
| 73 meditations, all new      | 146 queries (find + create) | ~75 queries (preload + creates) |
| 73 meditations with --update | 146 queries (find + update) | ~75 queries (preload + updates) |

```bash
pnpm seed meditations                    # Skip mode — fastest for new content
pnpm seed meditations --update           # Update mode — content changed
pnpm seed meditations --dry-run          # Dry run works with both modes
pnpm seed meditations --update --dry-run
```

## Environment variables

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

For production, pass credentials via the shell and target production:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=prod-password SAHAJCLOUD_URL=https://cloud.sydevelopers.com pnpm seed <script>
```

## Design principles

1. **Idempotent** — slug-based upsert: find existing records and update,
   or create new.
2. **Resilient** — continue on errors, report all issues at the end.
3. **Comprehensive reporting** — a summary with counts, warnings, errors.

## Maintenance: updating seed scripts when fields change

If you add a field to a collection (e.g. `timings` on Meditations), update
the matching seed script to populate it. Otherwise seeded documents get
that field empty or default.

**Checklist**:

1. Identify which seed script populates the collection.
2. Update the importer to extract/compute the new field from source data.
3. Add the field to the `upsert()` data object.
4. Test with `--dry-run` to validate the mapping.
5. Run a full seed with `--update` to update existing documents.

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

## Utility architecture

Import scripts share centralized utilities in `seeds/lib/` for rate
limiting, retries, and data loading. For the preload, upsert, error-
handling, pagination, media-upload, and locale-handling patterns
themselves, see [seeds/lib/AGENTS.md](lib/AGENTS.md) — this section covers
the two utilities not documented there.

### Delay utilities (`delays.ts`)

```typescript
import { rateLimitDelay, withRetry } from '../lib'

await rateLimitDelay(300) // Rate limit delay
const result = await withRetry(() => fetchData(), { maxRetries: 3 }) // Exponential backoff
```

| Function              | Behavior                         |
| ------------------------ | ----------------------------------- |
| `rateLimitDelay(ms)`  | Waits ms                         |
| `withRetry(fn, opts)` | Retries with exponential backoff |

### Data loading (`dataLoader.ts`)

```typescript
import { fetchAsset, readCache, writeCache, loadJsonData } from '../lib'

// Load a JSON data file (fs locally, URL in Workers)
const data = await loadJsonData<MyType>({
  localPath: 'seeds/data.json',
  workerUrl: 'https://raw.githubusercontent.com/.../data.json',
})

// Fetch an asset with caching (cache only works locally)
const buffer = await fetchAsset(url, { cachePath: 'seeds/cache/file.jpg' })

// Direct cache operations (no-op in Workers)
const cached = await readCache('seeds/cache/file.jpg')
await writeCache('seeds/cache/file.jpg', buffer)
```

| Function                 | Local mode              | Workers mode              |
| --------------------------- | -------------------------- | ---------------------------- |
| `loadDataFile(source)`   | Reads from `localPath`  | Fetches from `workerUrl`  |
| `fetchAsset(url, opts)`  | Caches to `cachePath`   | Streams directly          |
| `readCache(path)`        | Returns a file buffer   | Returns `null`            |
| `writeCache(path, data)` | Writes to disk          | No-op                     |
| `cacheExists(path)`      | Validates the file exists | Returns `false`        |

## File organization

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
├── lib/                   # Shared importer utilities — see lib/AGENTS.md
├── cache/                 # Downloaded files (git-ignored, local dev only)
├── run.ts                 # CLI runner (HTTP client that calls the API endpoint)
└── extract-to-json.ts     # One-time PostgreSQL data extraction script

src/app/(payload)/api/seed/[script]/route.ts  # API route for post-deployment seeding
```

## Troubleshooting

**Script won't run** — check env vars (`echo $PAYLOAD_SECRET`, `echo
$STORYBLOK_ACCESS_TOKEN`) and run `pnpm generate:types` if types look
stale.

**Errors during import** — run with `--dry-run` first to validate data,
use `--clear-cache` to re-download files, and check console output for
details.

**Missing data.json files** — `wemeditate` and `meditations` need
pre-extracted JSON at `seeds/wemeditate/data.json` and
`seeds/meditations/data.json`, generated from PostgreSQL dumps via
`seeds/extract-to-json.ts`. To regenerate from the original `data.bin`
files (requires PostgreSQL installed locally):

```bash
pnpm tsx seeds/extract-to-json.ts
```

## Summary output format

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

## Creating a new seed script

1. Create `seeds/<script-name>/import.ts`, extending `BaseImporter`.
2. Add collection metadata to `seeds/lib/expectedCounts.ts`.
3. Register it in `getImporter()` in
   `src/app/(payload)/api/seed/[script]/route.ts`.
4. Add it to the "Available Scripts" table above.

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
    // Preload for skip/update optimization — see lib/AGENTS.md's Preload Pattern
    await this.preloadCollection('target-collection', 'slug')
  }

  protected async import(): Promise<void> {
    const items = await this.loadData()

    for (const item of items) {
      try {
        await this.upsert(
          'target-collection',
          { slug: { equals: item.slug } },
          { title: item.title, slug: item.slug /* ...other fields */ },
          { identifier: item.slug }, // Always pass an explicit identifier
        )
      } catch (error) {
        this.addError(`Item ${item.id}`, error) // Resilient — keep processing
        continue
      }
    }
  }

  private async loadData(): Promise<MyDataType[]> {
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

## Known inconsistencies (backlog)

Documented for future standardization, not yet fixed: the data source
varies by script (embedded constants, JSON files, API fetch — each
choice's rationale should be documented). Error handling mixes per-item
try/catch with whole-loop try/catch (standardize on per-item with
`addError()`). Locale handling varies between hardcoded `'en'`, full
16-locale, and none. `storyblok` hand-rolls a composite-key preload that
could become a shared `preloadWithCompositeKey()` helper. Identifier
passing is inconsistent between explicit and auto-generated. Fix each in
its own issue, not as a drive-by.
