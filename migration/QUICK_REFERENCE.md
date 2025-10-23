# Migration Scripts - Quick Reference

## Command Line Usage

### Storyblok Import ✅ READY
```bash
# Dry run (validate without writing)
npx tsx migration/storyblok/import.ts --dry-run --unit=1

# Full import with reset
npx tsx migration/storyblok/import.ts --reset

# Import specific unit with clean cache
npx tsx migration/storyblok/import.ts --clear-cache --unit=2
```

### WeMeditate Import ✅ READY
```bash
# Dry run
npx tsx migration/wemeditate/import.ts --dry-run

# Full import with reset
npx tsx migration/wemeditate/import.ts --reset

# Clear cache and reset
npx tsx migration/wemeditate/import.ts --clear-cache --reset
```

### Meditations Import ✅ READY
```bash
# Dry run
npx tsx migration/meditations/import.ts --dry-run

# Full import with reset
npx tsx migration/meditations/import.ts --reset
```

---

## Common Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate data without writing to database |
| `--reset` | Delete existing tagged records before import |
| `--clear-cache` | Clear download cache before import |
| `--unit=N` | Import only specific unit (Storyblok only) |

**Removed Flags**:
- ~~`--resume`~~ - No longer supported

---

## Code Patterns

### Error Handling (Resilient)
```typescript
// ✅ DO THIS:
async importItems(items: any[]) {
  for (const item of items) {
    try {
      await this.createItem(item)
      this.summary.itemsCreated++
    } catch (error) {
      this.addError(`Failed to import ${item.id}`, error)
      continue  // Keep going!
    }
  }
}

// ❌ DON'T DO THIS:
async importItems(items: any[]) {
  for (const item of items) {
    await this.createItem(item)  // Throws and stops
  }
}
```

### Logging
```typescript
// ✅ DO THIS:
await this.logger.success('✓ Created record')
await this.logger.error('Failed to create')
await this.logger.warn('Missing optional field')
await this.logger.info('Processing...')

// ❌ DON'T DO THIS:
console.log('\x1b[32m%s\x1b[0m', 'Created record')
console.error('Failed to create')
```

### Dry Run Checks
```typescript
// ✅ DO THIS:
async createItem(data: any) {
  // Validate data structure
  if (!data.required) {
    throw new Error('Missing required field')
  }

  if (this.options.dryRun) {
    await this.logger.info('[DRY RUN] Would create item')
    return 'temp-id'
  }

  const item = await this.payload.create({...})
  return item.id
}

// ❌ DON'T DO THIS:
async createItem(data: any) {
  if (!this.options.dryRun) {
    const item = await this.payload.create({...})
    return item.id
  }
}
```

### Cleanup
```typescript
// ✅ DO THIS:
async run() {
  try {
    this.payload = await getPayload({ config })
    await this.import()
    this.printSummary()
  } finally {
    await this.cleanup()
    if (this.payload?.db?.destroy) {
      await this.payload.db.destroy()
    }
  }
}

// ❌ DON'T DO THIS:
async run() {
  this.payload = await getPayload({ config })
  await this.import()
  await this.cleanup()
}
```

---

## Shared Utilities

### Logger
```typescript
import { Logger } from '../lib'

const logger = new Logger(CACHE_DIR)

await logger.success('✓ Success message')  // Green
await logger.error('✗ Error message')      // Red
await logger.warn('⚠ Warning message')     // Yellow
await logger.info('ℹ Info message')        // Cyan
```

### FileUtils
```typescript
import { FileUtils } from '../lib'

const fileUtils = new FileUtils(logger)

// Download file
await fileUtils.downloadFileFetch(url, destPath)

// Check if file exists
const exists = await fileUtils.fileExists(filePath)

// Get MIME type
const mimeType = fileUtils.getMimeType('audio.mp3')  // 'audio/mpeg'

// Ensure directory
await fileUtils.ensureDir(dirPath)

// Clear directory
await fileUtils.clearDir(dirPath)
```

### TagManager
```typescript
import { TagManager } from '../lib'

const tagManager = new TagManager(payload, logger)

// Ensure tag exists
const tagId = await tagManager.ensureTag(
  'media-tags',
  'import-tag-name'
)

// Add tags to media
await tagManager.addTagsToMedia(mediaId, [tagId])
```

### MediaDownloader
```typescript
import { MediaDownloader } from '../lib'

const downloader = new MediaDownloader(cacheDir, logger)
await downloader.initialize()

// Download and convert to WebP
const result = await downloader.downloadAndConvertImage(url)
// Returns: { localPath, hash, width, height }

// Create media document in Payload
const mediaId = await downloader.createMediaDocument(
  payload,
  result,
  { alt: 'Description', credit: 'Photographer' },
  'en'  // locale
)
```

### LexicalConverter
```typescript
import { convertEditorJSToLexical, type ConversionContext } from '../lib'

const context: ConversionContext = {
  payload,
  logger,
  pageId: 123,
  locale: 'en',
  mediaMap: new Map(),
  formMap: new Map(),
  externalVideoMap: new Map(),
  treatmentMap: new Map(),
  meditationTitleMap: new Map(),
}

const lexicalContent = await convertEditorJSToLexical(
  editorJsContent,
  context
)
```

---

## Summary Output Format

```
============================================================
IMPORT SUMMARY
============================================================

📊 Records Created:
  Lessons:             18
  Media Files:         45
  External Videos:     3
  File Attachments:    24

  Total Records:       90

⚠️  Warnings (2):
  1. Meditation "Step 3" not found for Step 3...
  2. Missing Step_Image for lesson: Step 6...

❌ Errors (1):
  1. Failed to create lesson step-7: Invalid data

============================================================
```

---

## Troubleshooting

### Script won't run
```bash
# Check environment variables
echo $STORYBLOK_ACCESS_TOKEN
echo $DATABASE_URI

# Check Payload types are generated
pnpm generate:types
```

### Errors during import
1. Check summary output for specific error messages
2. Look at `migration/cache/{script-name}/import.log` for full details
3. Run with `--dry-run` to validate data first
4. Use `--reset` to clear existing data if needed

### Database connection issues
```bash
# For PostgreSQL imports (WeMediate, Meditations)
# Check PostgreSQL is running
pg_isready

# Drop temp database manually if needed
dropdb temp_wemeditate_import
```

### Cache issues
```bash
# Clear cache and try again
npx tsx migration/storyblok/import.ts --clear-cache --reset
```

---

## Environment Variables

### Required for All Scripts
```env
DATABASE_URI=mongodb://localhost:27017/sy_devs_cms
PAYLOAD_SECRET=your-secret-key
```

### Script-Specific

#### Storyblok
```env
STORYBLOK_ACCESS_TOKEN=your-token-here
```

#### WeMediate
```env
# PostgreSQL credentials (uses default if not set)
PGHOST=localhost
PGPORT=5432
PGUSER=your-username
```

#### Meditations
```env
STORAGE_BASE_URL=https://your-cdn.com/uploads/
# PostgreSQL credentials (same as WeMediate)
```

---

## Best Practices

1. **Always run dry-run first**
   ```bash
   npx tsx migration/script/import.ts --dry-run
   ```

2. **Use --reset for clean imports**
   ```bash
   npx tsx migration/script/import.ts --reset
   ```

3. **Check the summary output**
   - Look for errors and warnings
   - Verify record counts match expectations

4. **Review the log file**
   ```bash
   tail -f migration/cache/{script-name}/import.log
   ```

5. **Test with small datasets first**
   ```bash
   # Storyblok: Import just one unit
   npx tsx migration/storyblok/import.ts --unit=1
   ```

---

## Adding a New Import Script

Use this template:

```typescript
import { Logger, FileUtils, TagManager, PayloadHelpers } from '../lib'

const IMPORT_TAG = 'import-new-source'
const CACHE_DIR = path.resolve(process.cwd(), 'migration/cache/new-source')

interface ScriptOptions {
  dryRun: boolean
  reset: boolean
}

interface ImportSummary {
  recordsCreated: number
  errors: string[]
  warnings: string[]
}

class NewSourceImporter {
  private payload!: Payload
  private logger!: Logger
  private summary: ImportSummary = {
    recordsCreated: 0,
    errors: [],
    warnings: [],
  }

  private addError(context: string, error: Error | string) {
    const message = error instanceof Error ? error.message : error
    this.summary.errors.push(`${context}: ${message}`)
    this.logger.error(message)
  }

  private addWarning(message: string) {
    this.summary.warnings.push(message)
    this.logger.warn(message)
  }

  async run() {
    try {
      // Validate environment
      if (!process.env.REQUIRED_VAR) {
        throw new Error('REQUIRED_VAR is required')
      }

      // Initialize Payload (always, even for dry run)
      this.payload = await getPayload({ config })
      this.logger = new Logger(CACHE_DIR)

      // Import logic
      await this.importItems()

      // Show summary
      this.printSummary()
    } finally {
      // Cleanup
      if (this.payload?.db?.destroy) {
        await this.payload.db.destroy()
      }
    }
  }

  printSummary() {
    // Use Storyblok's printSummary as template
  }
}
```

---

## Quick Links

- **Refactoring Guide**: `migration/REFACTORING_GUIDE.md` - Detailed instructions for WeMediate and Meditations scripts
- **Summary**: `migration/REFACTORING_SUMMARY.md` - Overview of completed and pending work
- **CLAUDE.md**: Main project documentation with migration patterns
