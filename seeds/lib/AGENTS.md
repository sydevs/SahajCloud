# Seed Utilities Library

Shared utilities for import scripts. Every importer extends `BaseImporter`.

## BaseImporter class

Abstract base class providing common functionality for all imports.

### Required overrides

```typescript
class MyImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'My Import' // Display name
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/my-import')

  protected async import(): Promise<void> {
    // Your import logic here
  }
}
```

### Lifecycle hooks

| Method      | Purpose                               | Default           |
| ----------- | -------------------------------------- | ------------------ |
| `setup()`   | Custom initialization after Payload    | No-op              |
| `import()`  | **Required** — main import logic       | Abstract           |
| `cleanup()` | Custom cleanup (DB connections, etc.)  | Closes Payload DB  |

### Core methods

**Idempotent upsert** — find by natural key, update or create:

```typescript
const result = await this.upsert<Lesson>(
  'lessons',
  { slug: { equals: 'step-1' } },  // Natural key
  { title: 'Step 1', ... },        // Data
  { locale: 'en', file: fileData } // Optional
)
// result.action: 'created' | 'updated' | 'skipped'
```

**Find by natural key** (read-only lookup):

```typescript
const existing = await this.findByNaturalKey<Page>('pages', { slug: { equals: 'home' } })
```

**Error handling**:

```typescript
this.addError('Context', error) // Log error, increment counter
this.addWarning('Warning message') // Log warning
this.skip('Skipping item') // Log skip, increment counter
```

### Built-in properties

- `this.payload` — Payload instance (null in dry-run)
- `this.logger` — Logger instance
- `this.fileUtils` — FileUtils instance
- `this.report` — ValidationReport instance
- `this.options.dryRun` — Boolean flag

## Shared utilities

### Logger

```typescript
import { Logger } from '../lib'
const logger = new Logger(CACHE_DIR)

await logger.success('Created record') // Green
await logger.error('Failed') // Red
await logger.warn('Warning') // Yellow
await logger.info('Processing...') // Cyan
await logger.skip('Skipped item') // Gray
await logger.progress(50, 100, 'Items') // Progress bar
```

### FileUtils

```typescript
import { FileUtils } from '../lib'
const fileUtils = new FileUtils(logger)

await fileUtils.downloadFileFetch(url, destPath)
await fileUtils.ensureDir(dirPath)
await fileUtils.clearDir(dirPath)
const exists = await fileUtils.fileExists(path)
const mime = fileUtils.getMimeType('audio.mp3') // 'audio/mpeg'
```

### MediaUploader

```typescript
import { MediaUploader } from '../lib'
const uploader = new MediaUploader(payload, logger)

// Upload with deduplication by filename pattern
const result = await uploader.uploadWithDeduplication(localPath, {
  alt: 'Description',
  credit: 'Photo by...',
  tags: [tagId],
  locale: 'en',
})
// Returns: { id, filename, wasReused } | null

const stats = uploader.getStats() // { uploaded: number, reused: number }
```

### TagManager

```typescript
import { TagManager } from '../lib'
const tagManager = new TagManager(payload, logger)

// For user-choices and music-tags collections (require SVG icons)
const tagId = await tagManager.ensureTag('user-choices', 'My Tag')

// For image tags (now inline enum strings — pass a string array directly)
await tagManager.addTagsToImage(imageId, ['thumbnail', 'meditation'])
```

### LexicalConverter

```typescript
import { convertEditorJSToLexical, ConversionContext } from '../lib'

const context: ConversionContext = {
  payload,
  logger,
  pageId: 123,
  pageTitle: 'Home Page', // For error messages
  locale: 'en',
  mediaMap: new Map(), // image URL → Media ID
  formMap: new Map(), // form type → Form ID
  lectureMap: new Map(), // vimeo_id → Lecture ID
  treatmentMap: new Map(), // treatment ID → Page ID
  treatmentThumbnailMap: new Map(), // treatment ID → Media ID
  meditationTitleMap: new Map(), // meditation title → Meditation ID
  meditationRailsTitleMap: new Map(), // Rails meditation ID → title
}

const lexical = await convertEditorJSToLexical(editorJsContent, context)
```

### CLI parser

```typescript
import { parseArgs } from '../lib'

const options = parseArgs()
// options.dryRun, options.clearCache
```

## Key patterns

### Preload pattern (skip/update mode optimization)

Preload collections in `setup()` for efficient skip/update decisions without
per-item queries:

```typescript
protected async setup(): Promise<void> {
  // Preload all collections that will be checked for existing docs
  await Promise.all([
    this.preloadCollection('user-choices', 'slug'),  // naturalKey = 'slug'
    this.preloadCollection('frames', 'filename'),       // naturalKey = 'filename'
  ])
}

protected async import(): Promise<void> {
  for (const item of items) {
    // Skip mode: if the doc exists in cache, upsert() skips it entirely (no DB ops)
    // Update mode: if the doc exists in cache, upsert() updates it using the cached ID
    await this.upsert('user-choices', { slug: { equals: item.slug } }, data)
  }
}
```

**Preload methods:**

- `preloadCollection(collection, naturalKey, additionalFields?)` — bulk fetch for the cache
- `getPreloaded(collection, keyValue)` — get a cached doc by natural key
- `hasPreloaded(collection, keyValue)` — check whether a doc exists in the cache

**The cache includes soft-deleted docs** (`trash: true` on its find). A
trashed row still occupies its natural key, so it must count as "exists" —
otherwise `upsert` takes its `isPreloaded && !preloadedDoc` branch straight
to `payload.create` (there is no fallback find) and duplicates the row on
every re-seed. This was a live bug: `CleanupOrphanedMedia` trashes orphaned
Files/Images, so a later `storyblok`/`meditations` run re-uploaded them.
Guarded by `tests/int/seed-importer-preload.int.spec.ts`.

Consequence worth knowing: **a deliberately-trashed doc is not re-created by
a re-seed** — it is skipped (or updated, in `--update` mode). Permanently
delete it to force recreation.

### Pagination pattern

For large imports, to keep each request bounded and avoid long-running seed
requests timing out:

```typescript
protected async import(): Promise<void> {
  // Check if targeting a specific collection
  if (!this.isCollectionTargeted('meditations')) {
    return  // Skip if not targeted
  }

  const items = await this.loadItems()
  const batch = this.paginateItems(items)  // Returns slice based on offset/limit

  for (const item of batch) {
    await this.processItem(item)
  }
}

// Optional: override to rebuild ID maps for paginated runs
protected async reconstructIdMaps(): Promise<void> {
  // Called automatically when isPaginated() is true, before import()
  this.narratorIdMap = await this.reconstructIdMap('narrators', 'slug')
}
```

**Pagination methods:**

- `isPaginated()` — check whether pagination is active
- `isCollectionTargeted(collection)` — check whether the collection should be processed
- `paginateItems(items)` — get a slice based on offset/limit
- `reconstructIdMap(collection, naturalKey)` — rebuild an ID map from existing docs
- `reconstructIdMaps()` — hook for subclasses to rebuild maps (called before `import()`)

### Error handling architecture

Two tiers:

**Helper classes** (payloadHelpers, fileUtils, MediaUploader) — use
`logger.error()` to log without tracking, and return null/false on failure.
The caller decides how to handle it.

**Importer classes** (extend BaseImporter) — use `addError()` to log **and**
track in the report. Check a helper's return value and call `addError()`
when tracking is needed.

```typescript
// In a helper class
async uploadFile(path: string): Promise<string | null> {
  try { ... } catch (error) {
    await this.logger.error(`Failed: ${error}`)  // Log only
    return null
  }
}

// In an importer class
const id = await helper.uploadFile(path)
if (!id) {
  this.addError('Uploading file', new Error('Failed'))  // Track in report
}
```

### Resilient error handling

```typescript
for (const item of items) {
  try {
    await this.processItem(item)
  } catch (error) {
    this.addError(`Item ${item.id}`, error)
    continue // Keep processing!
  }
}
```

### File upload format

Payload expects buffer-based objects:

```typescript
const fileData: FileData = {
  data: Buffer.from(content),
  name: 'filename.svg',
  mimetype: 'image/svg+xml',
  size: buffer.length,
}
```

### Creating a new seed script

1. Create `seeds/<name>/import.ts`.
2. Extend `BaseImporter`.
3. Implement `import()`.
4. Add it to the `seeds/run.ts` SCRIPTS map.
5. Add an npm script to `package.json`.

## File structure

```
lib/
├── BaseImporter.ts      # Abstract base class
├── cliParser.ts         # CLI argument parsing
├── logger.ts            # Colored logging + file output
├── fileUtils.ts         # File operations, MIME types
├── tagManager.ts        # Tag creation/management
├── payloadHelpers.ts    # Common Payload operations
├── mediaDownloader.ts   # Image download + WebP conversion
├── MediaUploader.ts     # Media upload with deduplication
├── lexicalConverter.ts  # EditorJS → Lexical conversion
├── validationReport.ts  # Import statistics tracking
└── index.ts             # Barrel export
```
