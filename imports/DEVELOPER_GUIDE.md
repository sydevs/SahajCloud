# Import Scripts Developer Guide

This guide explains how to create new import scripts and use the shared utilities.

## Quick Start

1. Create a new folder in `imports/` for your script
2. Create `import.ts` based on the template
3. Add to `imports/run.ts` SCRIPTS map
4. Add npm script to `package.json`

## Project Structure

```
imports/
├── lib/                     # Shared utilities
│   ├── index.ts            # Barrel exports
│   ├── logger.ts           # Colored logging with file output
│   ├── fileUtils.ts        # File operations and MIME types
│   ├── tagManager.ts       # Tag creation and management
│   ├── payloadHelpers.ts   # Common Payload operations
│   ├── mediaDownloader.ts  # Download and cache media files
│   ├── MediaUploader.ts    # Upload media with deduplication
│   ├── lexicalConverter.ts # Convert content to Lexical format
│   └── validationReport.ts # Generate validation reports
├── [your-script]/
│   ├── import.ts           # Main import script
│   ├── data.bin            # Source data (if applicable)
│   └── README.md           # Script-specific documentation
├── cache/                   # Downloaded files (git-ignored)
├── run.ts                   # Unified CLI runner
└── README.md               # Main documentation
```

## Using Shared Utilities

### Logger

```typescript
import { Logger } from '../lib'

const logger = new Logger(CACHE_DIR, onWarning, onSkip)

await logger.info('Starting import...')
await logger.success('Item created')
await logger.warn('Skipping duplicate')
await logger.error('Failed to process')
await logger.skip('Already exists')
await logger.progress(50, 100, 'Processing items')
```

### ValidationReport

```typescript
import { ValidationReport } from '../lib'

const report = new ValidationReport()

// Track field mappings
report.addFieldMapping('legacy_field', 'payload_field', 'Renamed')

// Track issues
report.addWarning('Missing optional field')
report.addError('Failed to create record')

// Track statistics
report.incrementCreated()
report.incrementSkipped()

// Generate report
await report.generate(
  path.join(CACHE_DIR, 'validation-report.md'),
  'My Import'
)
```

### TagManager

```typescript
import { TagManager } from '../lib'

const tagManager = new TagManager(payload)

// Ensure tag exists (creates if not)
const tagId = await tagManager.ensureTag('meditation-tags', 'My Tag')

// Ensure import tag for tracking
const importTagId = await tagManager.ensureImageTag('import-my-script')

// Add tags to image
await tagManager.addTagsToImage(imageId, [tagId, importTagId])
```

### MediaUploader

```typescript
import { MediaUploader } from '../lib'

const uploader = new MediaUploader(payload, CACHE_DIR, logger)

// Upload image
const imageId = await uploader.uploadImage(
  imageUrl,
  'alt text',
  'credit',
  ['tag-id-1']
)

// Upload with deduplication
const existingOrNew = await uploader.uploadImageIfNotExists(imageUrl, alt)
```

### MediaDownloader

```typescript
import { MediaDownloader } from '../lib'

const downloader = new MediaDownloader(logger, CACHE_DIR)

// Download and cache file
const result = await downloader.downloadFile(url, 'subdir')
// Returns: { buffer, mimetype, filename }
```

### FileUtils

```typescript
import { getMimeType, ensureDirectoryExists, downloadFile } from '../lib'

// Get MIME type from filename
const mime = getMimeType('audio.mp3') // 'audio/mpeg'

// Ensure directory exists
await ensureDirectoryExists(CACHE_DIR)

// Download file to buffer
const buffer = await downloadFile(url)
```

### LexicalConverter

```typescript
import { convertEditorJSToLexical } from '../lib'

// Convert EditorJS content to Lexical
const lexicalContent = await convertEditorJSToLexical(
  editorJsBlocks,
  async (imageUrl) => {
    // Upload image and return ID
    return await uploader.uploadImage(imageUrl, 'alt')
  }
)
```

## Script Template

```typescript
#!/usr/bin/env tsx

import { getPayload, Payload } from 'payload'
import * as path from 'path'
import config from '../../src/payload.config'
import {
  Logger,
  ValidationReport,
  TagManager,
  ensureDirectoryExists,
} from '../lib'

// Constants
const CACHE_DIR = path.join(__dirname, '..', 'cache', 'my-script')
const IMPORT_TAG = 'import-my-script'

// Parse arguments
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const RESET = args.includes('--reset')

class MyImporter {
  private payload: Payload
  private logger: Logger
  private report: ValidationReport
  private tagManager: TagManager

  constructor(payload: Payload) {
    this.payload = payload
    this.logger = new Logger(CACHE_DIR)
    this.report = new ValidationReport()
    this.tagManager = new TagManager(payload)
  }

  async run(): Promise<void> {
    await this.logger.info(`Starting import (dry-run: ${DRY_RUN})`)

    if (RESET) {
      await this.reset()
    }

    // Document field mappings
    this.report.addFieldMapping('source_field', 'target_field', 'Notes')

    // Import data
    const items = await this.fetchSourceData()

    for (let i = 0; i < items.length; i++) {
      await this.logger.progress(i + 1, items.length, 'Importing items')

      try {
        await this.importItem(items[i])
        this.report.incrementCreated()
      } catch (error) {
        this.report.addError(`Failed: ${error.message}`)
        this.report.incrementErrors()
      }
    }

    // Generate report
    await this.report.generate(
      path.join(CACHE_DIR, 'validation-report.md'),
      'My Import'
    )

    await this.logger.success('Import complete!')
  }

  private async reset(): Promise<void> {
    await this.logger.info('Resetting previous import...')
    // Delete records with import tag
  }

  private async fetchSourceData(): Promise<any[]> {
    // Fetch from API or database
    return []
  }

  private async importItem(item: any): Promise<void> {
    if (DRY_RUN) {
      await this.logger.info(`Would create: ${item.name}`)
      return
    }

    await this.payload.create({
      collection: 'my-collection',
      data: { /* ... */ },
      overrideAccess: true,
    })
  }
}

async function main(): Promise<void> {
  await ensureDirectoryExists(CACHE_DIR)

  const payload = await getPayload({ config: await config })
  const importer = new MyImporter(payload)

  try {
    await importer.run()
  } finally {
    if (payload.db?.destroy) {
      await payload.db.destroy()
    }
  }
}

main().catch(console.error)
```

## Adding to CLI Runner

1. Edit `imports/run.ts`:

```typescript
const SCRIPTS: Record<string, string> = {
  // ... existing scripts
  'my-script': 'my-script/import.ts',
}
```

2. Add npm script to `package.json`:

```json
{
  "scripts": {
    "import:my-script": "cross-env NODE_OPTIONS=--no-deprecation tsx imports/my-script/import.ts"
  }
}
```

## Testing Import Scripts

### Dry Run Testing

Always test with `--dry-run` first:

```bash
pnpm import my-script --dry-run
```

### Creating Tests

Create tests in `imports/[script]/[script].test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ValidationReport } from '../lib'

describe('My Import', () => {
  describe('ValidationReport', () => {
    it('tracks warnings correctly', () => {
      const report = new ValidationReport()
      report.addWarning('Test warning')
      expect(report.getWarningCount()).toBe(1)
    })
  })
})
```

Run tests:

```bash
pnpm test:int
```

## Best Practices

### 1. Use Import Tags

Always tag imported records for easy reset:

```typescript
const importTagId = await tagManager.ensureImageTag(IMPORT_TAG)
// Add to all created records
```

### 2. Implement Dry Run

Support `--dry-run` to validate without writing:

```typescript
if (DRY_RUN) {
  logger.info(`Would create: ${item.name}`)
  return
}
```

### 3. Use Caching

Cache downloaded files to avoid re-downloading:

```typescript
const cached = path.join(CACHE_DIR, 'assets', filename)
if (fs.existsSync(cached)) {
  return fs.readFileSync(cached)
}
```

### 4. Handle Errors Gracefully

Collect errors instead of throwing:

```typescript
try {
  await importItem(item)
  report.incrementCreated()
} catch (error) {
  report.addError(`${item.id}: ${error.message}`)
  report.incrementErrors()
}
```

### 5. Track Progress

Use the logger's progress method for long imports:

```typescript
for (let i = 0; i < items.length; i++) {
  await logger.progress(i + 1, items.length, 'Processing')
  // ...
}
```

### 6. Generate Validation Reports

Always generate a validation report:

```typescript
await report.generate(
  path.join(CACHE_DIR, 'validation-report.md'),
  'Import Name'
)
```

### 7. Document Field Mappings

Track how legacy fields map to Payload:

```typescript
report.addFieldMapping('old_name', 'new_name', 'Renamed field')
```

### 8. Use overrideAccess

Bypass access control for imports:

```typescript
await payload.create({
  collection: 'items',
  data: { /* ... */ },
  overrideAccess: true, // Bypass all access control
})
```

## Troubleshooting

### "Collection not found"

Check collection slug matches `src/collections/*/` slug.

### "Field validation failed"

Ensure required fields have values. Check field types match.

### "Duplicate slug"

Implement slug conflict handling:

```typescript
let slug = generateSlug(title)
const existing = await payload.find({
  collection: 'items',
  where: { slug: { equals: slug } },
})
if (existing.docs.length > 0) {
  slug = `${slug}-${Date.now()}`
}
```

### "Memory issues"

Process items in batches:

```typescript
const BATCH_SIZE = 100
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE)
  await Promise.all(batch.map(importItem))
}
```

## Related Documentation

- [README.md](README.md) - Usage and commands
- [SCHEMA_COMPATIBILITY.md](SCHEMA_COMPATIBILITY.md) - Legacy to Payload mappings
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Quick command reference
- [IMPORT_SCRIPT_TEMPLATE.md](IMPORT_SCRIPT_TEMPLATE.md) - Full template
