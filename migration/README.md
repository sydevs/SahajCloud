# Data Import & Migration Scripts

This directory contains import scripts for migrating content from external sources into Payload CMS. All scripts follow a consistent, standardized pattern for reliability and maintainability.

**Note**: These scripts are for **data migration only**. For deployment documentation, see [DEPLOYMENT.md](../DEPLOYMENT.md).

---

## Available Import Scripts

### 1. Storyblok Path Steps Import
**Location**: [migration/storyblok/import.ts](storyblok/import.ts)

Migrates "Path Step" data from Storyblok CMS into Payload's Lessons collection.

**Quick Start**:
```bash
# Dry run validation
npx tsx migration/storyblok/import.ts --dry-run --unit=1

# Import specific unit
npx tsx migration/storyblok/import.ts --unit=1

# Full import with reset
npx tsx migration/storyblok/import.ts --reset
```

**Features**:
- Downloads and caches Storyblok data and assets
- Automatic image conversion to WebP
- Lexical content conversion from Storyblok blocks
- FileAttachment management with ownership
- Tag-based cleanup support

**Environment Variables**:
- `STORYBLOK_ACCESS_TOKEN` (required)
- `PAYLOAD_SECRET` (required)

### 2. WeMeditate Rails Database Import
**Location**: [migration/wemeditate/import.ts](wemeditate/import.ts)

Imports authors, categories, and pages (~160+ pages) from Rails-based WeMeditate PostgreSQL database across 9 locales.

**Quick Start**:
```bash
# Dry run
npx tsx migration/wemeditate/import.ts --dry-run

# Full import
npx tsx migration/wemeditate/import.ts --reset
```

**Features**:
- Dual-database architecture (PostgreSQL for reading, SQLite/D1 for writing)
- Multi-locale support (en, es, de, it, fr, ru, ro, cs, uk)
- Automatic database setup and cleanup
- Tag-based tracking with `import-wemeditate`

**Documentation**: See [wemeditate/README.md](wemeditate/README.md) for detailed information.

**Environment Variables**:
- `PAYLOAD_SECRET` (required)
- PostgreSQL: Uses system defaults or `PGHOST`, `PGPORT`, `PGUSER`

### 3. Meditations Import
**Location**: [migration/meditations/import.ts](meditations/import.ts)

Imports meditation content from legacy database.

**Quick Start**:
```bash
# Dry run
npx tsx migration/meditations/import.ts --dry-run

# Full import
npx tsx migration/meditations/import.ts --reset
```

**Documentation**: See [meditations/IMPORT.md](meditations/IMPORT.md) for details.

---

## Common Command Flags

All import scripts support these flags:

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate data without writing to database |
| `--reset` | Delete existing tagged records before import |
| `--clear-cache` | Clear download cache before import |
| `--unit=N` | Import only specific unit (Storyblok only) |

**Examples**:
```bash
# Validate setup without importing
npx tsx migration/{script}/import.ts --dry-run

# Clean import (deletes existing data)
npx tsx migration/{script}/import.ts --reset

# Fresh start with cleared cache
npx tsx migration/{script}/import.ts --clear-cache --reset
```

---

## Design Principles

All migration scripts adhere to these core principles:

### 1. Resilient Error Handling
Scripts continue on errors, collecting them for end-of-run reporting rather than failing fast.

```typescript
// ✅ Correct approach
for (const item of items) {
  try {
    await this.createItem(item)
    this.summary.itemsCreated++
  } catch (error) {
    this.addError(`Failed to import ${item.id}`, error)
    continue  // Keep going!
  }
}
```

### 2. No Resumability
Scripts are stateless - focus on clean reset and re-import rather than resuming partial imports.

### 3. Comprehensive Dry Run
Initialize Payload and validate data structure without writing to database.

### 4. Shared Utilities
Use common library code from `migration/lib/` for consistency:
- **Logger** (`logger.ts`) - Colored console output + file logging
- **FileUtils** (`fileUtils.ts`) - File downloads, directory management
- **TagManager** (`tagManager.ts`) - Tag creation and management
- **PayloadHelpers** (`payloadHelpers.ts`) - Common Payload operations
- **MediaDownloader** (`mediaDownloader.ts`) - Image download and WebP conversion
- **LexicalConverter** (`lexicalConverter.ts`) - EditorJS to Lexical conversion

### 5. Detailed Reporting
Comprehensive summary with counts, errors, and warnings at end of run:

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
  1. Meditation "Step 3" not found...
  2. Missing Step_Image for lesson...

✨ No errors - import completed successfully!
============================================================
```

### 6. Clean Shutdown
Proper cleanup of database connections and resources in finally blocks.

---

## File Organization

```
migration/
├── storyblok/
│   ├── import.ts              # Storyblok import script
│   └── README.md              # Storyblok documentation
├── wemeditate/
│   ├── import.ts              # WeMeditate import script
│   ├── data.bin               # PostgreSQL dump (2.4MB)
│   └── README.md              # WeMeditate documentation
├── meditations/
│   ├── import.ts              # Meditations import script
│   └── IMPORT.md              # Meditations documentation
├── lib/                       # Shared utilities
│   ├── logger.ts
│   ├── fileUtils.ts
│   ├── tagManager.ts
│   ├── payloadHelpers.ts
│   ├── mediaDownloader.ts
│   └── lexicalConverter.ts
├── cache/                     # Downloaded files (git-ignored)
│   ├── storyblok/
│   ├── wemeditate/
│   └── meditations/
└── README.md                  # This file
```

---

## Shared Utilities Usage

### Logger
```typescript
import { Logger } from '../lib/logger'

const logger = new Logger(CACHE_DIR)

await logger.success('✓ Success message')  // Green
await logger.error('✗ Error message')      // Red
await logger.warn('⚠ Warning message')     // Yellow
await logger.info('ℹ Info message')        // Cyan
```

### FileUtils
```typescript
import { FileUtils } from '../lib/fileUtils'

const fileUtils = new FileUtils(logger)

// Download file
await fileUtils.downloadFileFetch(url, destPath)

// Check if file exists
const exists = await fileUtils.fileExists(filePath)

// Get MIME type
const mimeType = fileUtils.getMimeType('audio.mp3')  // 'audio/mpeg'
```

### TagManager
```typescript
import { TagManager } from '../lib/tagManager'

const tagManager = new TagManager(payload, logger)

// Ensure tag exists
const tagId = await tagManager.ensureTag('media-tags', 'import-tag-name')

// Add tags to media
await tagManager.addTagsToMedia(mediaId, [tagId])
```

### MediaDownloader
```typescript
import { MediaDownloader } from '../lib/mediaDownloader'

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

---

## Troubleshooting

### Script Won't Run

**Check environment variables**:
```bash
echo $STORYBLOK_ACCESS_TOKEN
echo $PAYLOAD_SECRET
```

**Regenerate Payload types**:
```bash
pnpm generate:types
```

### Errors During Import

1. Check summary output for specific error messages
2. Look at `migration/cache/{script-name}/import.log` for full details
3. Run with `--dry-run` to validate data first
4. Use `--reset` to clear existing data if needed

### Database Connection Issues

**For PostgreSQL imports** (WeMeditate, Meditations):
```bash
# Check PostgreSQL is running
pg_isready

# Drop temp database manually if needed
dropdb temp_wemeditate_import
```

### Cache Issues

```bash
# Clear cache and try again
npx tsx migration/{script}/import.ts --clear-cache --reset
```

---

## Best Practices

1. **Always run dry-run first**:
   ```bash
   npx tsx migration/script/import.ts --dry-run
   ```

2. **Use --reset for clean imports**:
   ```bash
   npx tsx migration/script/import.ts --reset
   ```

3. **Check the summary output**:
   - Look for errors and warnings
   - Verify record counts match expectations

4. **Review the log file**:
   ```bash
   tail -f migration/cache/{script-name}/import.log
   ```

5. **Test with small datasets first**:
   ```bash
   # Storyblok: Import just one unit
   npx tsx migration/storyblok/import.ts --unit=1
   ```

---

## Creating New Import Scripts

Use the [IMPORT_SCRIPT_TEMPLATE.md](IMPORT_SCRIPT_TEMPLATE.md) as a starting point for new import scripts.

**Key requirements**:
- Single file architecture
- Resilient error handling
- Comprehensive dry run mode
- Shared utilities from `migration/lib/`
- Detailed reporting
- Clean shutdown

**Reference implementations**:
- [Storyblok Import](storyblok/import.ts) - External API import with asset processing
- [WeMeditate Import](wemeditate/import.ts) - Database dump import with multi-locale support
- [Meditations Import](meditations/import.ts) - File migration from cloud storage

---

## Related Documentation

- **Storyblok Import**: [migration/storyblok/README.md](storyblok/README.md)
- **WeMeditate Import**: [migration/wemeditate/README.md](wemeditate/README.md)
- **Meditations Import**: [migration/meditations/IMPORT.md](meditations/IMPORT.md)
- **Quick Reference**: [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
- **Import Template**: [IMPORT_SCRIPT_TEMPLATE.md](IMPORT_SCRIPT_TEMPLATE.md)
- **Main Project Docs**: [CLAUDE.md](../CLAUDE.md)
- **Deployment**: [DEPLOYMENT.md](../DEPLOYMENT.md)
