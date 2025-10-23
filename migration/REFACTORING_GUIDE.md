# Migration Scripts Refactoring Guide

This guide documents the refactoring work completed and provides detailed instructions for completing the remaining improvements to the WeMediate and Meditations import scripts.

## ✅ COMPLETED WORK

### Phase 1: Foundation (Shared Utilities)

1. **Logger Extended with Color Support** ✅
   - Added ANSI color codes
   - New methods: `success()` for green messages
   - Added `LogOptions` interface with `color` field
   - Colors: red, green, yellow, blue, cyan, gray

2. **FileUtils Enhanced** ✅
   - Added `getMimeType(filename)` method
   - Removed unused `downloadFile()` method (http/https based)
   - Kept only `downloadFileFetch()` for consistency

3. **Library Exports Updated** ✅
   - Added `mediaDownloader` export
   - Added `lexicalConverter` export
   - Removed `stateManager` export

4. **StateManager Removed** ✅
   - Deleted `migration/lib/stateManager.ts`
   - No longer needed - focus on clean reset instead of resumability

### Phase 2: Storyblok Script Refactoring

**File**: `migration/storyblok/import.ts` ✅ COMPLETE

Changes made:
- ✅ Removed `StateManager` usage
- ✅ Removed `--resume` flag from options
- ✅ Added `ImportSummary` interface for tracking
- ✅ Added `addError()` and `addWarning()` methods
- ✅ Changed error handling to be resilient (continue on errors)
- ✅ Added `finally` block for cleanup
- ✅ Added comprehensive `printSummary()` method
- ✅ Added environment variable validation
- ✅ Removed ID mappings persistence (in-memory only)
- ✅ Used Logger's color methods (`success()`, `error()`, `warn()`, `info()`)

## 🔨 REMAINING WORK

### Phase 3: WeMeditate Script Refactoring ✅ COMPLETE

**File**: `migration/wemeditate/import.ts`

**Status**: Refactoring completed and tested successfully on 2025-01-16

#### Current Issues:
1. Custom state management code (lines 123-163) duplicates StateManager
2. Uses `--resume` flag
3. Saves/loads ID mappings to `id-mappings.json`
4. Throws errors on failures instead of collecting them
5. Dry run skips Payload initialization
6. No comprehensive summary reporting

#### Required Changes:

**Step 1: Remove Custom State Management**

Replace lines 51-75 (ImportState interface and state methods):
```typescript
// REMOVE THIS:
interface ImportState {
  lastUpdated: string
  phase: string
  itemsCreated: Record<string, string>
  failed: string[]
}

// And remove these methods:
async saveState()
async loadState()
setPhase()
```

Add instead:
```typescript
interface ImportSummary {
  authorsCreated: number
  categoriesCreated: number
  pagesCreated: number
  mediaCreated: number
  externalVideosCreated: number
  formsCreated: number
  errors: string[]
  warnings: string[]
}

private summary: ImportSummary = {
  authorsCreated: 0,
  categoriesCreated: 0,
  pagesCreated: 0,
  mediaCreated: 0,
  externalVideosCreated: 0,
  formsCreated: 0,
  errors: [],
  warnings: [],
}
```

**Step 2: Remove ID Mappings Persistence**

Remove these methods:
```typescript
async saveIdMappings()  // line ~147
async loadIdMappings()  // line ~157
```

Remove these constants:
```typescript
const STATE_FILE = path.join(CACHE_DIR, 'import-state.json')  // line 24
const ID_MAPS_FILE = path.join(CACHE_DIR, 'id-mappings.json')  // line 25
```

**Step 3: Add Error Collection Methods**

Add these methods to the class:
```typescript
private addError(context: string, error: Error | string) {
  const message = error instanceof Error ? error.message : error
  const fullMessage = `${context}: ${message}`
  this.summary.errors.push(fullMessage)
  this.logger.error(fullMessage)
}

private addWarning(message: string) {
  this.summary.warnings.push(message)
  this.logger.warn(message)
}
```

**Step 4: Update Error Handling**

Find all `throw new Error()` calls in import methods and replace with:
```typescript
// OLD:
throw new Error(`Failed to...`)

// NEW:
this.addError('Context description', new Error('Failed to...'))
return null // or continue, depending on context
```

Key locations to update:
- `importAuthors()` - line ~830: wrap in try/catch, use `addError`, continue
- `importPages()` - multiple locations: wrap in try/catch, use `addError`, continue
- `convertEditorJSToLexical()` calls - wrap in try/catch

**Step 5: Remove --resume Flag**

Update `ScriptOptions` interface (line ~63):
```typescript
interface ScriptOptions {
  dryRun: boolean
  reset: boolean
  // REMOVE: resume: boolean
  clearCache?: boolean
}
```

Update `parseArgs()` function (line ~1439):
```typescript
const options: ScriptOptions = {
  dryRun: args.includes('--dry-run'),
  reset: args.includes('--reset'),
  // REMOVE: resume: args.includes('--resume'),
  clearCache: args.includes('--clear-cache'),
}
```

**Step 6: Update Dry Run to Initialize Payload**

In the `run()` method, change from:
```typescript
if (!this.options.dryRun) {
  this.payload = await getPayload({ config: await configPromise })
  // ... other initialization
}
```

To:
```typescript
// Always initialize Payload (for validation and dry-run checking)
this.payload = await getPayload({ config: await configPromise })
await this.initialize()

// Then check dryRun before writes:
if (this.options.dryRun) {
  await this.logger.info('[DRY RUN] Would create...')
  return
}
```

**Step 7: Add Comprehensive Summary**

Add this method to the class:
```typescript
printSummary() {
  console.log('\n' + '='.repeat(60))
  console.log('IMPORT SUMMARY')
  console.log('='.repeat(60))

  console.log(`\n📊 Records Created:`)
  console.log(`  Authors:            ${this.summary.authorsCreated}`)
  console.log(`  Categories:         ${this.summary.categoriesCreated}`)
  console.log(`  Pages:              ${this.summary.pagesCreated}`)
  console.log(`  Media Files:        ${this.summary.mediaCreated}`)
  console.log(`  External Videos:    ${this.summary.externalVideosCreated}`)
  console.log(`  Forms:              ${this.summary.formsCreated}`)

  const totalRecords = Object.values(this.summary)
    .filter(v => typeof v === 'number')
    .reduce((sum, n) => sum + n, 0)

  console.log(`\n  Total Records:      ${totalRecords}`)

  if (this.summary.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${this.summary.warnings.length}):`)
    this.summary.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`)
    })
  }

  if (this.summary.errors.length > 0) {
    console.log(`\n❌ Errors (${this.summary.errors.length}):`)
    this.summary.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`)
    })
  }

  if (this.summary.errors.length === 0 && this.summary.warnings.length === 0) {
    console.log(`\n✨ No errors or warnings - import completed successfully!`)
  }

  console.log('\n' + '='.repeat(60))
}
```

Call it at the end of `run()` method:
```typescript
async run() {
  try {
    // ... existing code
    await this.importAll()

    this.printSummary()  // ADD THIS
  } catch (error) {
    console.error('Fatal error:', error)
    throw error
  } finally {
    await this.cleanupDatabase()
    if (this.payload?.db?.destroy) {
      await this.payload.db.destroy()
    }
  }
}
```

**Step 8: Update Counter Increments**

Find all document creation calls and increment the appropriate counter:
```typescript
// Example in importAuthors():
const author = await this.payload.create({...})
this.summary.authorsCreated++  // ADD THIS
```

Do this for all collection creation methods.

---

### Phase 4: Meditations Script Refactoring ✅ COMPLETE

**File**: `migration/meditations/import.ts`

**Status**: Refactoring completed and tested successfully on 2025-01-16

#### Current Issues:
1. Uses `console.log` directly with ANSI colors
2. Has `UPDATE_EXISTING_RECORDS` constant and update logic
3. Duplicate tag management code
4. Unused `resetPayloadDatabase()` method
5. Custom `getMimeType()` method (now in FileUtils)
6. Custom `downloadFile()` wrapper

#### Required Changes:

**Step 1: Replace console.log with Logger**

Find all instances of:
```typescript
console.log('\x1b[32m%s\x1b[0m', message)  // green
console.log('\x1b[33m%s\x1b[0m', message)  // yellow
console.log('\x1b[31m%s\x1b[0m', message)  // red
console.log(message)  // normal
```

Replace with:
```typescript
await this.logger.success(message)  // green
await this.logger.warn(message)     // yellow
await this.logger.error(message)    // red
await this.logger.info(message)     // cyan/normal
```

**Step 2: Remove Update Mode**

Remove these lines:
```typescript
const UPDATE_EXISTING_RECORDS = false  // line 72
```

Remove all conditional logic checking `UPDATE_EXISTING_RECORDS`:
- In `importMediation()` method (lines ~1440-1490)
- Remove the entire `else if (UPDATE_EXISTING_RECORDS)` block

Keep only the create path.

**Step 3: Remove Duplicate Tag Management**

Remove the `setupMeditationThumbnailTag()` method (lines ~845-875).

Replace it with:
```typescript
async ensureMeditationTag(): Promise<void> {
  if (this.meditationTagId) return
  this.meditationTagId = await this.tagManager.ensureTag(
    'meditation-tags',
    IMPORT_TAG,
    { title: IMPORT_TAG }  // Add title field for meditation-tags
  )
}
```

Update calls from:
```typescript
await this.setupMeditationThumbnailTag()
```

To:
```typescript
await this.ensureMeditationTag()
```

**Step 4: Remove Unused resetPayloadDatabase() Method**

Delete the `resetPayloadDatabase()` method entirely (lines ~351-378).

Keep only `resetMeditationsCollection()`.

**Step 5: Remove Custom getMimeType()**

Delete the `getMimeType()` method (lines ~788-804).

Replace all calls with:
```typescript
// OLD:
const mimeType = this.getMimeType(filename)

// NEW:
const mimeType = this.fileUtils.getMimeType(filename)
```

**Step 6: Remove downloadFile() Wrapper**

Delete the `downloadFile()` method (lines ~554-583).

Replace all calls with:
```typescript
// OLD:
await this.downloadFile(url, destPath)

// NEW:
await this.fileUtils.downloadFileFetch(url, destPath)
```

**Step 7: Update Summary to Use Logger Colors**

The summary reporting is already comprehensive. Just update it to use Logger methods instead of console.log:

In `printImportSummary()` method (lines ~1853-1981), replace:
```typescript
console.log('\x1b[32m%s\x1b[0m', `✓ ${message}`)
```

With:
```typescript
await this.logger.success(`✓ ${message}`)
```

And similar for other color codes.

---

## TESTING CHECKLIST

After completing all refactoring:

### Test Storyblok Script
```bash
# 1. Dry run (should initialize Payload, validate data)
NODE_ENV=development npx tsx migration/storyblok/import.ts --dry-run --unit=1

# 2. Reset and import single unit
NODE_ENV=development npx tsx migration/storyblok/import.ts --reset --unit=1

# 3. Check summary output for errors/warnings
```

### Test WeMediate Script
```bash
# 1. Dry run
NODE_ENV=development npx tsx migration/wemeditate/import.ts --dry-run

# 2. Reset and full import
NODE_ENV=development npx tsx migration/wemeditate/import.ts --reset

# 3. Check summary output
```

### Test Meditations Script
```bash
# 1. Dry run
NODE_ENV=development npx tsx migration/meditations/import.ts --dry-run

# 2. Reset and import
NODE_ENV=development npx tsx migration/meditations/import.ts --reset

# 3. Check summary output
```

### Verify:
- ✅ No --resume flag accepted
- ✅ No state files created (import-state.json, id-mappings.json)
- ✅ Errors are collected and reported, not thrown
- ✅ Summary shows counts and errors/warnings
- ✅ Database connections cleaned up properly
- ✅ Logger outputs colored text
- ✅ Dry run initializes Payload for validation

---

## SUMMARY OF IMPROVEMENTS

### Consistency Achieved:
1. **Error Handling**: All scripts use resilient error handling
2. **State Management**: Removed - all scripts now stateless
3. **Dry Run**: All scripts initialize Payload for validation
4. **Logging**: All scripts use Logger class with colors
5. **Cleanup**: All scripts have finally blocks
6. **Summary**: All scripts have comprehensive summary reporting
7. **No Resumability**: All scripts focus on clean reset
8. **Shared Utilities**: All scripts use lib/* utilities consistently

### Files Modified:
- ✅ `migration/lib/logger.ts` - Added colors
- ✅ `migration/lib/fileUtils.ts` - Added getMimeType, removed unused method
- ✅ `migration/lib/index.ts` - Updated exports
- ✅ `migration/lib/stateManager.ts` - **DELETED**
- ✅ `migration/storyblok/import.ts` - Complete refactor
- ⏳ `migration/wemeditate/import.ts` - Needs refactor
- ⏳ `migration/meditations/import.ts` - Needs refactor

### Benefits:
- Simpler codebase (no state management complexity)
- Better error visibility (summary reports)
- Consistent patterns across all scripts
- Easier debugging (colored logs)
- Reliable cleanup (finally blocks)
- Focus on clean imports (reset-based workflow)
