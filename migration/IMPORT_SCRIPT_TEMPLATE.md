# Import Script Template

This document serves as a template for creating import scripts for the sy-devs-cms project. All import scripts should follow the patterns and requirements outlined here to ensure consistency, reliability, and maintainability.

## Core Requirements

All import scripts MUST meet these requirements:

### 1. Single File Architecture
- **Single executable file** - All import logic must be contained in one `.ts` file
- **No new dependencies** - Use only existing project dependencies
- **Self-contained** - No external configuration files beyond `.env`

### 2. Resumability
- **State tracking** - Maintain import state in a JSON file
- **ID mapping** - Cache all source-to-target ID mappings
- **Progress tracking** - Track which items have been processed
- **Graceful interruption** - Allow safe stopping and resuming

### 3. Local Caching
- **File caching** - Download and cache all external files locally
- **Deduplication** - Check cache before re-downloading files
- **Persistent storage** - Use git-ignored cache directory

### 4. Reset Capability
- **Clean slate** - `--reset` flag to delete all previously imported data
- **Collection cleanup** - Remove all records created by the import
- **State reset** - Clear all cached state and ID mappings
- **Idempotent** - Can be run multiple times safely

### 5. Import Tagging
- **Tagged documents** - All created documents tagged with `import-<source-name>`
- **Tagged media** - Media files tagged with `import-<source-name>` for tracking
- **Easy cleanup** - Reset can delete all documents with the import tag
- **Isolated imports** - Different import scripts don't interfere with each other

## File Structure

### Required Files
```
migration/                          # Root-level migration directory
├── <source-name>/
│   ├── import.ts                   # Main import script
│   └── IMPORT.md                   # Documentation specific to this import
├── cache/                          # Cached files (git-ignored)
│   └── <source-name>/
│       ├── import-state.json       # Import progress and state
│       ├── id-mappings.json        # Source ID to Payload ID mappings
│       ├── import.log              # Detailed import log (optional)
│       └── assets/
│           ├── images/             # Cached image files
│           ├── audio/              # Cached audio files
│           ├── videos/             # Cached video files
│           └── ...                 # Other asset types
└── IMPORT_SCRIPT_TEMPLATE.md       # This template
```

**Note:** The `migration/cache/` directory is git-ignored and contains all downloaded files and import state.

## Script Structure Template

```typescript
#!/usr/bin/env tsx

import 'dotenv/config'
import { getPayload, Payload } from 'payload'
import configPromise from '../payload.config'
import { promises as fs } from 'fs'
import * as path from 'path'

// ============================================================================
// CONFIGURATION
// ============================================================================

const IMPORT_TAG = 'import-<source-name>' // Tag for all imported documents and media
const CACHE_DIR = path.resolve(process.cwd(), 'migration/cache/<source-name>')
const STATE_FILE = path.join(CACHE_DIR, 'import-state.json')
const ID_MAPS_FILE = path.join(CACHE_DIR, 'id-mappings.json')
const LOG_FILE = path.join(CACHE_DIR, 'import.log')

// ============================================================================
// TYPES
// ============================================================================

interface ImportState {
  lastUpdated: string
  phase: string
  itemsCreated: Record<string, string>
  failed: string[]
}

interface ScriptOptions {
  dryRun: boolean
  reset: boolean
  resume: boolean
  clearCache?: boolean
}

interface IdMaps {
  // Define mappings for each collection type
  collectionName: Map<number | string, string>
}

// ============================================================================
// MAIN IMPORTER CLASS
// ============================================================================

class YourImporter {
  private payload!: Payload
  private state: ImportState
  private options: ScriptOptions
  private idMaps: IdMaps = {
    collectionName: new Map<number | string, string>(),
  }

  constructor(options: ScriptOptions) {
    this.options = options
    this.state = {
      lastUpdated: new Date().toISOString(),
      phase: 'initializing',
      itemsCreated: {},
      failed: [],
    }
  }

  // ============================================================================
  // LOGGING & STATE MANAGEMENT
  // ============================================================================

  async log(message: string, isError = false) {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}\n`
    console.log(message)
    await fs.appendFile(LOG_FILE, logMessage)
    if (isError) {
      this.state.failed.push(message)
    }
  }

  async saveState() {
    this.state.lastUpdated = new Date().toISOString()
    await fs.writeFile(STATE_FILE, JSON.stringify(this.state, null, 2))
  }

  async loadState() {
    try {
      const data = await fs.readFile(STATE_FILE, 'utf-8')
      this.state = JSON.parse(data)
      await this.log(`Loaded state from ${STATE_FILE}`)
    } catch {
      await this.log('No previous state found, starting fresh')
    }
  }

  async saveIdMappings() {
    const cache: Record<string, Record<string, string>> = {}
    for (const [key, map] of Object.entries(this.idMaps)) {
      cache[key] = Object.fromEntries(map)
    }
    await fs.writeFile(ID_MAPS_FILE, JSON.stringify(cache, null, 2))
  }

  async loadIdMappings() {
    try {
      const data = await fs.readFile(ID_MAPS_FILE, 'utf-8')
      const cached = JSON.parse(data)
      for (const [key, value] of Object.entries(cached)) {
        this.idMaps[key as keyof IdMaps] = new Map(
          Object.entries(value).map(([k, v]) => [k, v as string]),
        )
      }
      await this.log('Loaded ID mappings from cache')
    } catch {
      await this.log('No existing ID mappings found, starting fresh')
    }
  }

  // ============================================================================
  // FILE HANDLING
  // ============================================================================

  async downloadFile(url: string, destPath: string): Promise<void> {
    // Check if file already exists
    const fileExists = await fs
      .access(destPath)
      .then(() => true)
      .catch(() => false)

    if (fileExists) {
      const stats = await fs.stat(destPath)
      if (stats.size > 0) {
        return // File already cached
      }
    }

    // Download with retry logic
    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 3

      const attemptDownload = async () => {
        attempts++
        try {
          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`Failed to download: ${response.status}`)
          }
          const buffer = await response.arrayBuffer()
          await fs.writeFile(destPath, Buffer.from(buffer))
          resolve()
        } catch (err) {
          if (attempts < maxAttempts) {
            setTimeout(attemptDownload, 1000 * Math.pow(2, attempts))
          } else {
            reject(err)
          }
        }
      }

      attemptDownload()
    })
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  async ensureImportTag(collection: string): Promise<string | null> {
    // Ensure import tag exists in the appropriate tag collection
    const tagCollections: Record<string, string> = {
      media: 'media-tags',
      meditations: 'meditation-tags',
      music: 'music-tags',
      pages: 'page-tags',
    }

    const tagCollection = tagCollections[collection]
    if (!tagCollection) return null

    // Check if tag exists
    const existing = await this.payload.find({
      collection: tagCollection as any,
      where: { name: { equals: IMPORT_TAG } },
      limit: 1,
    })

    if (existing.docs.length > 0) {
      return existing.docs[0].id as string
    }

    // Create tag
    const tag = await this.payload.create({
      collection: tagCollection as any,
      data: { name: IMPORT_TAG, title: IMPORT_TAG },
    })

    await this.log(`✓ Created import tag: ${IMPORT_TAG}`)
    return tag.id as string
  }

  // ============================================================================
  // RESET FUNCTIONALITY
  // ============================================================================

  async resetCollections() {
    await this.log('\n=== Resetting Collections ===')

    const collections = ['collection1', 'collection2'] // List collections to reset

    for (const collection of collections) {
      await this.log(`Deleting documents with tag ${IMPORT_TAG} from ${collection}...`)

      // Try to find documents with import tag
      let result
      try {
        result = await this.payload.find({
          collection: collection as any,
          where: {
            tags: { contains: IMPORT_TAG },
          },
          limit: 1000,
        })
      } catch {
        // Collection may not have tags field, delete all
        result = await this.payload.find({
          collection: collection as any,
          limit: 1000,
        })
      }

      for (const doc of result.docs) {
        await this.payload.delete({
          collection: collection as any,
          id: doc.id,
        })
      }

      await this.log(`✓ Deleted ${result.docs.length} documents from ${collection}`)
    }

    // Reset state
    this.state = {
      lastUpdated: new Date().toISOString(),
      phase: 'initializing',
      itemsCreated: {},
      failed: [],
    }
    await this.saveState()
    await this.log('✓ Reset complete')
  }

  // ============================================================================
  // DATA IMPORT METHODS
  // ============================================================================

  async importItems() {
    await this.log('\n=== Importing Items ===')
    this.state.phase = 'importing-items'
    await this.saveState()

    // Implementation specific to your data source
    // Remember to:
    // - Check state to skip already processed items
    // - Save state after each item or batch
    // - Handle errors gracefully
    // - Update ID mappings
  }

  // ============================================================================
  // MAIN RUN METHOD
  // ============================================================================

  async run() {
    console.log('\n🚀 Starting Import\n')

    try {
      // 1. Setup cache directory
      await fs.mkdir(CACHE_DIR, { recursive: true })
      await fs.mkdir(path.join(CACHE_DIR, 'assets'), { recursive: true })

      // 2. Initialize Payload (skip in dry run)
      if (!this.options.dryRun) {
        const payloadConfig = await configPromise
        this.payload = await getPayload({ config: payloadConfig })
        await this.log('✓ Payload CMS initialized')
      }

      // 3. Handle options
      if (this.options.clearCache) {
        await this.log('Clearing cache...')
        await fs.rm(CACHE_DIR, { recursive: true, force: true })
        await fs.mkdir(CACHE_DIR, { recursive: true })
      }

      if (this.options.reset) {
        await this.resetCollections()
      }

      if (this.options.resume) {
        await this.loadState()
        await this.loadIdMappings()
      }

      // 4. Run import steps
      await this.importItems()
      await this.saveIdMappings()

      await this.log('\n=== Import Complete ===')
      await this.log(`Created ${Object.keys(this.state.itemsCreated).length} items`)
      if (this.state.failed.length > 0) {
        await this.log(`\nFailed operations: ${this.state.failed.length}`)
        this.state.failed.forEach((msg) => this.log(`  - ${msg}`))
      }
    } catch (error) {
      console.error('Fatal error:', error)
      throw error
    }
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2)
  const options: ScriptOptions = {
    dryRun: args.includes('--dry-run'),
    reset: args.includes('--reset'),
    resume: args.includes('--resume'),
    clearCache: args.includes('--clear-cache'),
  }

  // Validate required environment variables
  const requiredEnvVars = ['DATABASE_URI', 'PAYLOAD_SECRET']
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`Error: ${envVar} environment variable is required`)
      process.exit(1)
    }
  }

  const importer = new YourImporter(options)
  await importer.run()
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
```

## Command Line Interface

### Required Flags

```bash
# Dry run - show what would be imported without making changes
--dry-run

# Reset - delete all previously imported data before starting
--reset

# Resume - continue from last saved state
--resume

# Clear cache - delete cached files and start fresh
--clear-cache
```

### Example Usage

```bash
# Dry run to preview
pnpm tsx migration/<source>/import.ts --dry-run

# Full import
pnpm tsx migration/<source>/import.ts

# Reset and re-import everything
pnpm tsx migration/<source>/import.ts --reset

# Resume interrupted import
pnpm tsx migration/<source>/import.ts --resume

# Clear cache and start fresh
pnpm tsx migration/<source>/import.ts --clear-cache --reset
```

## Best Practices

### 1. Import Tagging
```typescript
// Always tag imported documents for easy cleanup
const importTagId = await this.ensureImportTag('media')

const media = await this.payload.create({
  collection: 'media',
  data: {
    alt: 'Image',
    tags: importTagId ? [importTagId] : [],
  },
  file: fileData,
})

// For collections without tag fields, track in state
this.state.itemsCreated[`item-${sourceId}`] = media.id
```

### 2. Error Handling
```typescript
try {
  // Import operation
} catch (error) {
  await this.log(`Error: ${error}`, true)
  // Continue with next item instead of failing entire import
}
```

### 3. Progress Tracking
```typescript
// Save state after each significant operation
await this.saveState()
await this.saveIdMappings()
```

### 4. Deduplication
```typescript
// Check if item already exists before creating
if (this.state.itemsCreated[uniqueKey]) {
  await this.log(`Item ${uniqueKey} already created, skipping`)
  continue
}
```

### 5. File Caching
```typescript
// Always check cache before downloading
const cachedPath = path.join(CACHE_DIR, 'assets', filename)
const exists = await fs.access(cachedPath).then(() => true).catch(() => false)
if (exists) {
  return cachedPath // Use cached file
}
// Otherwise download
```

### 6. Relationship Mapping
```typescript
// Use ID maps to convert source IDs to Payload IDs
const payloadId = this.idMaps.collectionName.get(sourceId)
if (!payloadId) {
  await this.log(`Warning: Could not find mapping for ${sourceId}`, true)
  continue
}
```

## Testing Checklist

Before running a full import:

- [ ] Test with `--dry-run` flag
- [ ] Verify cache directory structure
- [ ] Test `--reset` flag on small dataset
- [ ] Test `--resume` by interrupting and restarting
- [ ] Check ID mappings are saved correctly
- [ ] Verify all relationships are mapped
- [ ] Test error handling with invalid data
- [ ] Confirm file deduplication works
- [ ] Validate imported data in Payload admin

## Common Patterns

### Pattern 1: Batch Processing with State
```typescript
for (const item of items) {
  const itemKey = `item-${item.id}`

  if (this.state.itemsCreated[itemKey]) {
    await this.log(`Skipping ${itemKey}, already created`)
    continue
  }

  // Process item
  const created = await this.payload.create({
    collection: 'items',
    data: itemData,
  })

  this.state.itemsCreated[itemKey] = created.id as string
  await this.saveState()
}
```

### Pattern 2: File Processing with Cache
```typescript
async processFile(url: string): Promise<string | null> {
  const filename = path.basename(url)
  const cachedPath = path.join(CACHE_DIR, 'assets', filename)

  // Check cache
  if (await this.fileExists(cachedPath)) {
    await this.log(`Using cached: ${filename}`)
  } else {
    await this.downloadFile(url, cachedPath)
  }

  // Upload to Payload
  const fileBuffer = await fs.readFile(cachedPath)
  const media = await this.payload.create({
    collection: 'media',
    data: { alt: filename },
    file: {
      data: fileBuffer,
      name: filename,
      size: fileBuffer.length,
      mimetype: this.getMimeType(filename),
    },
  })

  return media.id as string
}
```

### Pattern 3: Relationship Handling
```typescript
// Convert source relationships to Payload relationships
const sourceTagIds = [1, 2, 3]
const payloadTagIds = sourceTagIds
  .map(id => this.idMaps.tags.get(id))
  .filter(Boolean) // Remove nulls

const itemData = {
  title: 'Item',
  tags: payloadTagIds, // Array of Payload IDs
}
```

## Documentation Requirements

Each import script must have a corresponding `IMPORT.md` file documenting:

1. **Source Description** - Where the data comes from
2. **Data Structure** - What collections/tables are imported
3. **Transformations** - How data is transformed
4. **Setup Instructions** - Required environment variables and setup steps
5. **Usage Examples** - Command examples with different flags
6. **Troubleshooting** - Common issues and solutions

## Examples

Refer to existing import scripts:

1. **Storyblok Import** ([migration/storyblok/import.ts](migration/storyblok/import.ts))
   - External API import
   - Complex data transformation
   - Lexical content conversion
   - Asset processing with Sharp

2. **Meditation Import** ([migration/meditations/import.ts](migration/meditations/import.ts))
   - Database dump import
   - File migration from cloud storage
   - Relationship mapping
   - Deduplication strategy

## Summary

Following this template ensures:
- ✅ Consistent import script structure
- ✅ Reliable resumability
- ✅ Efficient file caching
- ✅ Safe reset capability
- ✅ No new dependencies
- ✅ Single file implementation
- ✅ Clear documentation
- ✅ Easy maintenance

Always test thoroughly with `--dry-run` before running a full import!
