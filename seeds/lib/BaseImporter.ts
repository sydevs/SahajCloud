/**
 * Base Importer
 *
 * Abstract base class for all import scripts. Provides common functionality:
 * - Payload CMS initialization
 * - Logger, FileUtils, ValidationReport setup
 * - Idempotent upsert operations
 * - Summary printing and cleanup lifecycle
 */

import { promises as fs } from 'fs'
import * as path from 'path'

import dotenv from 'dotenv'
import { getPayload, Payload, CollectionSlug, Where, TypedLocale } from 'payload'

// Load env files in order (later files override earlier)
// Following Next.js convention: .env.local takes precedence over .env
dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local', override: true })

import { parseArgs, CLIArgs } from './cliParser'
import { isRetryableError } from './delays'
import { FileUtils } from './fileUtils'
import { Logger } from './logger'
import {
  PaginationOptions,
  PaginationState,
  createInitialPaginationState,
  calculatePaginationState,
} from './pagination'
import { ValidationReport } from './validationReport'
import configPromise from '../../src/payload.config'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of importing a single document
 */
export interface DocumentResult {
  collection: string
  identifier: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  error?: string
  warnings?: string[]
}

/**
 * Import event sent via SSE
 */
export interface ImportEvent {
  type: 'start' | 'document' | 'complete' | 'error' | 'info'
  // For 'start':
  script?: string
  dryRun?: boolean
  // For 'document':
  document?: DocumentResult
  current?: number
  total?: number
  // For 'complete':
  summary?: Record<string, unknown>
  // For 'error' and 'info':
  message?: string
  timestamp: string
}

/**
 * Callback function for import events (used by API routes for SSE)
 */
export type OnProgressCallback = (data: Record<string, unknown>) => Promise<void>

export interface BaseImportOptions {
  dryRun: boolean
  clearCache: boolean
  updateMode?: boolean // If true, update existing docs; if false/undefined, skip them
  payload?: Payload // Optional external Payload instance (for API routes)
  onProgress?: OnProgressCallback // Optional progress callback for SSE streaming
  pagination?: PaginationOptions // Optional pagination for multi-step execution
  // Raw seed-file contents keyed by their canonical DataSource.localPath,
  // uploaded by the CLI when the Worker can't fetch them itself (private repo).
  // Consumed via loadJsonData({ inlineContent }).
  inlineData?: Record<string, string>
}

export interface UpsertResult<T = any> {
  doc: T
  action: 'created' | 'updated' | 'skipped' | 'error'
}

export interface FileData {
  data: Buffer
  name: string
  size: number
  mimetype: string
}

export interface SlugCollision {
  collection: string
  slug: string
  data: Record<string, unknown>
  error: string
}

// Type for preloaded document cache (id + natural key + any additional fields)
export type PreloadedDoc = { id: string | number; [key: string]: unknown }
export type PreloadCache = Map<string, PreloadedDoc>

// ============================================================================
// BASE IMPORTER CLASS
// ============================================================================

export abstract class BaseImporter<TOptions extends BaseImportOptions = BaseImportOptions> {
  // Core dependencies (initialized in run())
  protected payload!: Payload
  protected logger!: Logger
  protected fileUtils!: FileUtils
  protected report!: ValidationReport

  // Configuration - subclasses must define these
  protected abstract readonly importName: string
  protected abstract readonly cacheDir: string

  // Options
  protected options: TOptions

  // Track slug collisions for manual review
  private collisions: SlugCollision[] = []

  // Track if Payload was injected externally (for API routes)
  private externalPayload: boolean = false

  // Cache of preloaded collections for skip/update decisions
  protected preloadCache: Map<CollectionSlug, PreloadCache> = new Map()

  // Track current operation for heartbeat progress (SSE keep-alive)
  private currentOperation: string = ''

  // Pagination state for multi-step execution
  protected paginationState: PaginationState = createInitialPaginationState()

  constructor(options: TOptions) {
    this.options = options
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Get the validation report for access to summary data
   * Used by API routes to get final counts
   */
  getReport(): ValidationReport {
    return this.report
  }

  /**
   * Set the current operation for heartbeat progress tracking
   * Called during long-running operations to provide context in SSE heartbeats
   */
  setCurrentOperation(operation: string): void {
    this.currentOperation = operation
  }

  /**
   * Get the current operation for heartbeat progress tracking
   * Used by API route to include operation context in heartbeat events
   */
  getCurrentOperation(): string {
    return this.currentOperation
  }

  // ============================================================================
  // PAGINATION METHODS
  // ============================================================================

  /**
   * Get paginated slice of items
   * Updates internal pagination state for reporting
   *
   * @param items - Full array of items to paginate
   * @returns Slice of items based on offset and limit
   */
  protected paginateItems<T>(items: T[]): T[] {
    const pagination = this.options.pagination
    if (!pagination || pagination.limit <= 0) {
      // No pagination - return all items
      this.paginationState = {
        processedCount: items.length,
        hasMore: false,
        nextOffset: items.length,
      }
      return items
    }

    const { offset, limit } = pagination
    const slice = items.slice(offset, offset + limit)

    this.paginationState = calculatePaginationState(items.length, offset, limit, slice.length)

    return slice
  }

  /**
   * Check if pagination is active for this run
   * Pagination is active when targeting a specific collection OR when explicit limit is set
   */
  protected isPaginated(): boolean {
    const pagination = this.options.pagination
    if (!pagination) return false
    // Pagination is active if collection filter is set OR explicit limit > 0
    return pagination.collection !== undefined || pagination.limit > 0
  }

  /**
   * Check if a specific collection is targeted by pagination filter
   * Returns true if no collection filter is set (all collections targeted)
   *
   * @param collection - Collection slug to check
   * @returns Whether this collection should be processed
   */
  protected isCollectionTargeted(collection: string): boolean {
    const pagination = this.options.pagination
    if (!pagination?.collection) {
      // No filter = all collections targeted
      return true
    }
    return pagination.collection === collection
  }

  /**
   * Get number of items processed in current batch
   */
  getProcessedCount(): number {
    return this.paginationState.processedCount
  }

  /**
   * Check if more items remain after current batch
   */
  hasMoreItems(): boolean {
    return this.paginationState.hasMore
  }

  /**
   * Get starting index for next batch
   */
  getNextOffset(): number {
    return this.paginationState.nextOffset
  }

  /**
   * Get current pagination options (if set)
   */
  getPaginationOptions(): PaginationOptions | undefined {
    return this.options.pagination
  }

  /**
   * Reconstruct ID map from existing database records
   * Used to restore relationships between paginated requests
   *
   * @param collection - Collection slug to query
   * @param naturalKeyField - Field to use as map key
   * @returns Map of natural key values to document IDs
   */
  protected async reconstructIdMap(
    collection: CollectionSlug,
    naturalKeyField: string,
  ): Promise<Map<string, string | number>> {
    const idMap = new Map<string, string | number>()

    if (this.options.dryRun || !this.payload) {
      return idMap
    }

    this.setCurrentOperation(`Rebuilding ${collection} ID map...`)

    // Query all existing records (paginated for large collections)
    const BATCH_SIZE = 500
    let page = 1
    let hasMore = true

    while (hasMore) {
      const result = await this.payload.find({
        collection,
        limit: BATCH_SIZE,
        page,
        depth: 0,
      })

      for (const doc of result.docs) {
        const key = (doc as unknown as Record<string, unknown>)[naturalKeyField]
        if (key !== null && key !== undefined) {
          idMap.set(String(key), doc.id)
        }
      }

      hasMore = result.hasNextPage
      page++
    }

    await this.logger.info(`Rebuilt ${collection} ID map: ${idMap.size} entries`)
    return idMap
  }

  /**
   * Hook for subclasses to reconstruct ID maps before import
   * Override this method to specify which maps to rebuild for paginated runs
   * Called automatically when pagination is active
   */
  protected async reconstructIdMaps(): Promise<void> {
    // Default: no-op. Subclasses override to reconstruct their specific maps.
  }

  // ============================================================================
  // PRELOAD METHODS (for skip/update mode optimization)
  // ============================================================================

  /**
   * Bulk fetch a collection for skip/update decision-making.
   * Uses Payload's `select` parameter for minimal data transfer.
   *
   * For upload collections using Cloudflare Images/Stream, also caches by
   * `fileMetadata.originalFilename` to enable deduplication when the stored
   * filename is replaced with a Cloudflare-generated ID.
   *
   * @param collection - Collection to preload
   * @param naturalKeyField - Field to use as cache key (e.g., 'slug', 'filename')
   * @param additionalFields - Additional fields to select beyond id and naturalKeyField
   * @returns PreloadCache map of natural key values to document data
   */
  protected async preloadCollection(
    collection: CollectionSlug,
    naturalKeyField: string,
    additionalFields?: string[],
  ): Promise<PreloadCache> {
    // Return cached version if already preloaded
    if (this.preloadCache.has(collection)) {
      return this.preloadCache.get(collection)!
    }

    // Skip preloading in dry-run mode (no Payload instance)
    if (this.options.dryRun || !this.payload) {
      const emptyCache: PreloadCache = new Map()
      this.preloadCache.set(collection, emptyCache)
      return emptyCache
    }

    const cache: PreloadCache = new Map()
    const BATCH_SIZE = 500
    let page = 1
    let hasMore = true

    // For upload collections using 'filename' as key, also fetch fileMetadata
    // to enable deduplication by originalFilename (Cloudflare Images/Stream)
    const isUploadCollection = naturalKeyField === 'filename'

    // Build select object - only fetch id and natural key (+ any additional fields)
    const select: Record<string, true> = {
      id: true,
      [naturalKeyField]: true,
    }
    if (isUploadCollection) {
      select.fileMetadata = true
    }
    if (additionalFields) {
      for (const field of additionalFields) {
        select[field] = true
      }
    }

    this.setCurrentOperation(`Preloading ${collection}...`)
    await this.logger.info(`Preloading ${collection}...`)

    while (hasMore) {
      const result = await this.executeWithRetry(() =>
        this.payload.find({
          collection,
          limit: BATCH_SIZE,
          page,
          depth: 0,
          select,
        }),
      )

      for (const doc of result.docs) {
        const docRecord = doc as unknown as Record<string, unknown>

        // For upload collections: also cache by originalFilename from fileMetadata
        // This enables deduplication when Cloudflare Images/Stream replaces filename with ID
        if (isUploadCollection) {
          const fileMetadata = docRecord.fileMetadata
          const originalFilename =
            typeof fileMetadata === 'object' &&
            fileMetadata !== null &&
            'originalFilename' in fileMetadata
              ? (fileMetadata as { originalFilename?: string }).originalFilename
              : undefined

          if (originalFilename) {
            cache.set(originalFilename, doc as unknown as PreloadedDoc)
          }
        }

        // Always cache by the natural key field
        const key = String(docRecord[naturalKeyField])
        if (key) {
          cache.set(key, doc as unknown as PreloadedDoc)
        }
      }

      hasMore = result.hasNextPage
      page++
    }

    await this.logger.info(`✓ Preloaded ${cache.size} ${collection}`)
    this.preloadCache.set(collection, cache)
    return cache
  }

  /**
   * Get a preloaded document by natural key value.
   *
   * @param collection - Collection slug
   * @param naturalKeyValue - The natural key value to look up
   * @returns PreloadedDoc if exists in cache, undefined otherwise
   */
  protected getPreloaded(
    collection: CollectionSlug,
    naturalKeyValue: string,
  ): PreloadedDoc | undefined {
    return this.preloadCache.get(collection)?.get(naturalKeyValue)
  }

  /**
   * Check if a document exists in preload cache.
   *
   * @param collection - Collection slug
   * @param naturalKeyValue - The natural key value to check
   * @returns true if document exists in cache
   */
  protected hasPreloaded(collection: CollectionSlug, naturalKeyValue: string): boolean {
    return this.preloadCache.get(collection)?.has(naturalKeyValue) ?? false
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  /**
   * Main entry point - handles initialization, execution, and cleanup
   */
  async run(): Promise<void> {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`${this.importName} Import`)
    console.log('='.repeat(60))

    if (this.options.dryRun) {
      console.log('\nMode: DRY RUN - No data will be written\n')
    }

    try {
      // 1. Setup cache directory
      await this.setupCacheDirectory()

      // 2. Initialize core utilities
      this.logger = new Logger()
      this.fileUtils = new FileUtils(this.logger)
      this.report = new ValidationReport()

      // 3. Handle cache clearing
      if (this.options.clearCache) {
        await this.clearCache()
      }

      // 4. Initialize Payload CMS (skip in dry-run for speed, use external if provided)
      if (this.options.payload) {
        this.payload = this.options.payload
        this.externalPayload = true
        await this.logger.info('Using externally provided Payload instance')
      } else if (!this.options.dryRun) {
        await this.initializePayload()
      } else {
        await this.logger.info('Skipping Payload initialization (dry run)')
      }

      // 5. Hook for subclass-specific setup
      await this.setup()

      // 6. Reconstruct ID maps for paginated runs (after setup, before import)
      if (this.isPaginated()) {
        await this.reconstructIdMaps()
      }

      // 7. Execute import (subclass implementation)
      await this.import()

      // 7. Generate report and print summary (file output only for CLI)
      await this.finalize()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger?.error(`Fatal error: ${message}`)
      // Send error event
      await this.sendEvent({
        type: 'error',
        message,
      })
      throw error
    } finally {
      await this.cleanup()
    }
  }

  /**
   * Override to add custom setup logic (called after Payload initialized)
   */
  protected async setup(): Promise<void> {
    // Default: no-op
  }

  /**
   * Override to implement the import logic
   */
  protected abstract import(): Promise<void>

  /**
   * Override to add custom cleanup logic
   */
  protected async cleanup(): Promise<void> {
    // Only close Payload database connection if we created it (not external)
    if (!this.externalPayload && this.payload?.db?.destroy) {
      await this.payload.db.destroy()
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private async setupCacheDirectory(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true })
    await fs.mkdir(path.join(this.cacheDir, 'assets'), { recursive: true })
  }

  /**
   * Load data file from the filesystem.
   *
   * @param localPath - Path to local file
   * @returns File contents as string
   */
  protected async loadDataFile(localPath: string): Promise<string> {
    return fs.readFile(localPath, 'utf-8')
  }

  private async initializePayload(): Promise<void> {
    await this.logger.info('Initializing Payload CMS...')
    const payloadConfig = await configPromise
    this.payload = await getPayload({ config: payloadConfig })
    await this.logger.success('Payload CMS initialized')
  }

  private async clearCache(): Promise<void> {
    await this.logger.info('Clearing cache directory...')
    await this.fileUtils.clearDir(this.cacheDir)
    // Recreate assets directory
    await fs.mkdir(path.join(this.cacheDir, 'assets'), { recursive: true })
    await this.logger.success('Cache cleared')
  }

  private async finalize(): Promise<void> {
    // Write slug collisions file if any
    await this.writeCollisionsFile()

    // Generate markdown report
    const reportPath = path.join(this.cacheDir, 'import-report.md')
    await this.report.generate(reportPath, this.importName)

    // Print console summary
    this.printSummary()

    await this.logger.success(`\nReport saved to: ${reportPath}`)
  }

  // ============================================================================
  // PROGRESS REPORTING
  // ============================================================================

  /**
   * Send import event to callback (if provided)
   * Used by API routes for SSE streaming
   */
  protected async sendEvent(event: Omit<ImportEvent, 'timestamp'>): Promise<void> {
    if (!this.options.onProgress) return

    const DEBUG = process.env.DEBUG_IMPORT === 'true'
    if (DEBUG) console.log(`[SSE] Sending event: ${event.type}`)
    await this.options.onProgress({
      ...event,
      timestamp: new Date().toISOString(),
    })
    if (DEBUG) console.log(`[SSE] Sent event: ${event.type}`)
  }

  /**
   * Report a document result (called automatically by upsert)
   * Sends SSE event and logs to console
   */
  protected async reportDocument(
    collection: string,
    identifier: string,
    action: DocumentResult['action'],
    options?: { error?: string; warnings?: string[]; current?: number; total?: number },
  ): Promise<void> {
    const document: DocumentResult = {
      collection,
      identifier,
      action,
      error: options?.error,
      warnings: options?.warnings,
    }

    // Send SSE event
    await this.sendEvent({
      type: 'document',
      document,
      current: options?.current,
      total: options?.total,
    })

    // Console output
    const icon =
      action === 'created' ? '✓' : action === 'updated' ? '↻' : action === 'skipped' ? '○' : '✗'
    const status = action === 'error' ? `error: ${options?.error}` : action
    console.log(`  ${identifier} ${icon} ${status}`)

    if (options?.warnings?.length) {
      for (const w of options.warnings) {
        console.log(`    ⚠ ${w}`)
      }
    }
  }

  /**
   * Send an informational message via SSE
   * Used for progress summaries and status updates
   */
  protected async sendInfo(message: string): Promise<void> {
    await this.sendEvent({
      type: 'info',
      message,
    })

    // Also log to console
    console.log(`  ${message}`)
  }

  // ============================================================================
  // IDEMPOTENT UPSERT OPERATIONS
  // ============================================================================

  /**
   * Find or upsert a document by natural key(s)
   * This is the core idempotency method all scripts should use
   *
   * @param collection - Payload collection slug
   * @param naturalKey - Where clause to find existing document
   * @param data - Document data to create or update with
   * @param options - Optional locale, file data, identifier override, and progress tracking
   * @returns UpsertResult with the document and action taken
   */
  protected async upsert<T extends { id: number | string }>(
    collection: CollectionSlug,
    naturalKey: Where,
    data: Record<string, any>,
    options?: {
      locale?: TypedLocale
      file?: FileData
      /** Override the identifier shown in progress (defaults to naturalKey summary) */
      identifier?: string
      /** Current progress index for SSE streaming */
      current?: number
      /** Total items for SSE streaming */
      total?: number
      /** Publish this specific locale (uses PayloadCMS native per-locale publishing) */
      publishSpecificLocale?: TypedLocale
      /** Force file upload even on update (default: false - skips file on update, assumes existing file is correct) */
      forceFileUpload?: boolean
    },
  ): Promise<UpsertResult<T>> {
    const identifier = options?.identifier || this.summarizeKey(naturalKey)
    const DEBUG = process.env.DEBUG_IMPORT === 'true'
    const startTime = DEBUG ? Date.now() : 0

    // Track current operation for heartbeat context
    this.setCurrentOperation(`Processing ${collection}:${identifier}`)

    if (DEBUG) console.log(`[UPSERT] Starting ${collection}:${identifier}`)

    if (this.options.dryRun) {
      this.report.incrementSkipped()
      await this.reportDocument(collection, identifier, 'skipped', {
        current: options?.current,
        total: options?.total,
      })
      return { doc: data as T, action: 'skipped' }
    }

    try {
      // Check preload cache first (if collection was preloaded)
      const keyValue = this.extractNaturalKeyValue(naturalKey)
      const preloadedDoc = keyValue ? this.getPreloaded(collection, keyValue) : undefined
      const isPreloaded = this.preloadCache.has(collection)

      if (DEBUG)
        console.log(
          `[UPSERT] ${collection}:${identifier} - preloaded: ${isPreloaded}, exists: ${!!preloadedDoc}`,
        )

      // SKIP MODE (default): If doc exists in preload cache, skip entirely (no DB ops)
      if (!this.options.updateMode && preloadedDoc) {
        this.report.incrementSkipped()
        await this.reportDocument(collection, identifier, 'skipped', {
          current: options?.current,
          total: options?.total,
        })
        if (DEBUG) console.log(`[UPSERT] Skipped ${collection}:${identifier} (exists in cache)`)
        return { doc: preloadedDoc as T, action: 'skipped' }
      }

      // UPDATE MODE with preloaded doc: Use cached ID to update directly (no find query!)
      if (this.options.updateMode && preloadedDoc) {
        const updateStart = DEBUG ? Date.now() : 0
        if (DEBUG) console.log(`[UPSERT] Updating ${collection}:${identifier} (using cached ID)`)
        // Skip file upload on update unless forceFileUpload is true
        const fileForUpdate = options?.forceFileUpload ? options?.file : undefined
        if (fileForUpdate) {
          this.setCurrentOperation(`Uploading ${collection}:${identifier}`)
        }
        const updated = await this.executeWithRetry(() =>
          this.payload.update({
            collection,
            id: preloadedDoc.id,
            data,
            locale: options?.locale,
            file: fileForUpdate,
            publishSpecificLocale: options?.publishSpecificLocale,
          }),
        )
        if (DEBUG)
          console.log(
            `[UPSERT] Updated ${collection}:${identifier} (${Date.now() - updateStart}ms)`,
          )

        this.report.incrementUpdated()
        await this.reportDocument(collection, identifier, 'updated', {
          current: options?.current,
          total: options?.total,
        })
        if (DEBUG)
          console.log(
            `[UPSERT] Complete ${collection}:${identifier} - total: ${Date.now() - startTime}ms`,
          )
        return { doc: updated as unknown as T, action: 'updated' }
      }

      // Doc doesn't exist in preload cache (or collection wasn't preloaded)
      // If collection was preloaded and doc not found, create new directly
      if (isPreloaded && !preloadedDoc) {
        const createStart = DEBUG ? Date.now() : 0
        if (DEBUG) console.log(`[UPSERT] Creating ${collection}:${identifier} (not in cache)`)
        if (options?.file) {
          this.setCurrentOperation(`Uploading ${collection}:${identifier}`)
        }
        const created = await this.executeWithRetry(() =>
          this.payload.create({
            collection,
            data,
            locale: options?.locale,
            file: options?.file,
          }),
        )
        if (DEBUG)
          console.log(
            `[UPSERT] Created ${collection}:${identifier} (${Date.now() - createStart}ms)`,
          )

        this.report.incrementCreated()
        await this.reportDocument(collection, identifier, 'created', {
          current: options?.current,
          total: options?.total,
        })
        if (DEBUG)
          console.log(
            `[UPSERT] Complete ${collection}:${identifier} - total: ${Date.now() - startTime}ms`,
          )
        return { doc: created as unknown as T, action: 'created' }
      }

      // FALLBACK: Collection wasn't preloaded - use original find-then-update/create pattern
      const findStart = DEBUG ? Date.now() : 0
      if (DEBUG) console.log(`[UPSERT] Finding existing ${collection}:${identifier} (fallback)`)
      const existing = await this.executeWithRetry(() =>
        this.payload.find({
          collection,
          where: naturalKey,
          limit: 1,
          locale: options?.locale,
        }),
      )
      if (DEBUG)
        console.log(
          `[UPSERT] Found ${existing.docs.length} existing for ${collection}:${identifier} (${Date.now() - findStart}ms)`,
        )

      if (existing.docs.length > 0) {
        // SKIP MODE: Skip existing documents (same as preloaded cache behavior)
        if (!this.options.updateMode) {
          this.report.incrementSkipped()
          await this.reportDocument(collection, identifier, 'skipped', {
            current: options?.current,
            total: options?.total,
          })
          if (DEBUG)
            console.log(`[UPSERT] Skipped ${collection}:${identifier} (exists in fallback find)`)
          return { doc: existing.docs[0] as unknown as T, action: 'skipped' }
        }

        // UPDATE MODE: Update existing (with retry for SQLITE_BUSY)
        const updateStart = DEBUG ? Date.now() : 0
        if (DEBUG) console.log(`[UPSERT] Updating ${collection}:${identifier}`)
        // Skip file upload on update unless forceFileUpload is true
        // Assumes existing file is correct - only data fields are updated
        const fileForUpdate = options?.forceFileUpload ? options?.file : undefined
        // Track file upload operation for heartbeat
        if (fileForUpdate) {
          this.setCurrentOperation(`Uploading ${collection}:${identifier}`)
        }
        const updated = await this.executeWithRetry(() =>
          this.payload.update({
            collection,
            id: existing.docs[0].id,
            data,
            locale: options?.locale,
            file: fileForUpdate,
            publishSpecificLocale: options?.publishSpecificLocale,
          }),
        )
        if (DEBUG)
          console.log(
            `[UPSERT] Updated ${collection}:${identifier} (${Date.now() - updateStart}ms)`,
          )

        this.report.incrementUpdated()
        const reportStart = DEBUG ? Date.now() : 0
        await this.reportDocument(collection, identifier, 'updated', {
          current: options?.current,
          total: options?.total,
        })
        if (DEBUG)
          console.log(
            `[UPSERT] Complete ${collection}:${identifier} - total: ${Date.now() - startTime}ms (report: ${Date.now() - reportStart}ms)`,
          )
        return { doc: updated as unknown as T, action: 'updated' }
      }

      // Create new (with retry for SQLITE_BUSY)
      const createStart = DEBUG ? Date.now() : 0
      if (DEBUG) console.log(`[UPSERT] Creating ${collection}:${identifier}`)
      // Track file upload operation for heartbeat
      if (options?.file) {
        this.setCurrentOperation(`Uploading ${collection}:${identifier}`)
      }
      // Note: publishSpecificLocale is only available on update operations, not create
      // For new documents, the initial _status field determines publication state
      const created = await this.executeWithRetry(() =>
        this.payload.create({
          collection,
          data,
          locale: options?.locale,
          file: options?.file,
        }),
      )
      if (DEBUG)
        console.log(`[UPSERT] Created ${collection}:${identifier} (${Date.now() - createStart}ms)`)

      this.report.incrementCreated()
      const reportStart = DEBUG ? Date.now() : 0
      await this.reportDocument(collection, identifier, 'created', {
        current: options?.current,
        total: options?.total,
      })
      if (DEBUG)
        console.log(
          `[UPSERT] Complete ${collection}:${identifier} - total: ${Date.now() - startTime}ms (report: ${Date.now() - reportStart}ms)`,
        )
      return { doc: created as unknown as T, action: 'created' }
    } catch (error) {
      // Handle slug collision - fetch existing document and return as updated
      if (this.isSlugCollisionError(error)) {
        // Extract slug from data or naturalKey (for auto-generated slugs)
        const slug = (data.slug as string) || this.extractSlugFromKey(naturalKey) || 'unknown'
        this.collisions.push({
          collection,
          slug,
          data: data as Record<string, unknown>,
          error: error instanceof Error ? error.message : String(error),
        })

        // Try to find the existing document with this slug
        // Use case-insensitive 'like' query to handle variations (trailing dashes, case differences)
        const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
        // Also create a version without hyphens for fuzzy matching (e.g., parimala-sab-u vs parimala-sabu)
        const slugWithoutHyphens = normalizedSlug.replace(/-/g, '')

        try {
          // Try exact-ish match first
          let existingBySlug = await this.executeWithRetry(() =>
            this.payload.find({
              collection,
              where: { slug: { like: normalizedSlug } },
              limit: 5,
              locale: options?.locale,
            }),
          )

          // If not found, try matching without hyphens (more fuzzy)
          if (existingBySlug.docs.length === 0 && slugWithoutHyphens.length > 3) {
            // Get all docs with similar starting characters and filter by removing hyphens
            const searchPrefix = slugWithoutHyphens.substring(
              0,
              Math.min(8, slugWithoutHyphens.length),
            )
            existingBySlug = await this.executeWithRetry(() =>
              this.payload.find({
                collection,
                where: { slug: { like: `%${searchPrefix}%` } },
                limit: 20,
                locale: options?.locale,
              }),
            )
            // Filter to find one where slug without hyphens matches
            existingBySlug.docs = existingBySlug.docs.filter((doc) => {
              const docSlug = ((doc as unknown as Record<string, unknown>).slug as string) || ''
              return docSlug.replace(/-/g, '').toLowerCase() === slugWithoutHyphens
            })
          }

          if (existingBySlug.docs.length > 0) {
            // Found existing document - treat as update
            const foundDoc = existingBySlug.docs[0]
            this.report.incrementUpdated()
            await this.reportDocument(collection, identifier, 'updated', {
              warnings: [
                `Slug collision resolved: found existing document with slug "${(foundDoc as unknown as Record<string, unknown>).slug || slug}"`,
              ],
              current: options?.current,
              total: options?.total,
            })
            return { doc: foundDoc as unknown as T, action: 'updated' }
          }
        } catch (lookupError) {
          // Failed to look up existing - fall through to skip
          const lookupMsg = lookupError instanceof Error ? lookupError.message : String(lookupError)
          this.report.addWarning(
            `Failed to lookup existing document for slug collision: ${lookupMsg}`,
          )
        }

        // Fallback: skip if we couldn't find existing
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.report.addError(`Slug collision in ${collection} (slug="${slug}"): ${errorMsg}`)
        this.report.incrementSkipped()
        await this.reportDocument(collection, identifier, 'skipped', {
          error: `Slug collision: ${slug}`,
          current: options?.current,
          total: options?.total,
        })
        return { doc: data as T, action: 'skipped' }
      }

      const errorMsg = error instanceof Error ? error.message : String(error)
      this.report.addError(`Upsert ${collection}: ${errorMsg}`)
      this.report.incrementErrors()
      await this.reportDocument(collection, identifier, 'error', {
        error: errorMsg,
        current: options?.current,
        total: options?.total,
      })
      // Return error result instead of throwing - allows import to continue
      return { doc: data as T, action: 'error' as const }
    }
  }

  /**
   * Find existing document by natural key (read-only lookup)
   *
   * @param collection - Payload collection slug
   * @param naturalKey - Where clause to find document
   * @param locale - Optional locale
   * @returns Document or null if not found
   */
  protected async findByNaturalKey<T>(
    collection: CollectionSlug,
    naturalKey: Where,
    locale?: TypedLocale | 'all',
  ): Promise<T | null> {
    if (this.options.dryRun) {
      return null
    }

    const result = await this.payload.find({
      collection,
      where: naturalKey,
      limit: 1,
      locale,
    })

    return result.docs.length > 0 ? (result.docs[0] as T) : null
  }

  /**
   * Update document with localized content for all available translations.
   * Only updates locales that have actual translation content.
   *
   * @param collection - Collection slug
   * @param id - Document ID
   * @param translations - Array of translation objects with locale field
   * @param dataExtractor - Function to extract data from each translation (return null to skip)
   * @param options - Optional settings
   * @returns Number of locales updated
   */
  protected async updateLocales<T extends { locale?: string }>(
    collection: CollectionSlug,
    id: number | string,
    translations: T[],
    dataExtractor: (translation: T) => Record<string, unknown> | null,
    options?: {
      /** Skip this locale (e.g., 'en' if already created with upsert) */
      excludeLocale?: string
      /** Only process translations where these fields have non-empty values */
      requiredFields?: (keyof T)[]
      /** List of valid locales (defaults to checking against Payload's TypedLocale) */
      validLocales?: string[]
      /** Callback to determine if this locale should be published (uses PayloadCMS native per-locale publishing) */
      shouldPublish?: (translation: T) => boolean
    },
  ): Promise<number> {
    if (this.options.dryRun) {
      return 0
    }

    const DEBUG = process.env.DEBUG_IMPORT === 'true'
    const startTime = DEBUG ? Date.now() : 0
    let updatedCount = 0

    for (const translation of translations) {
      // Skip if no locale
      if (!translation.locale) continue

      // Skip excluded locale (usually 'en' which was handled in initial upsert)
      if (options?.excludeLocale && translation.locale === options.excludeLocale) continue

      // Validate against allowed locales if provided
      if (options?.validLocales && !options.validLocales.includes(translation.locale)) continue

      // Check required fields have non-empty values
      if (options?.requiredFields) {
        const hasRequiredContent = options.requiredFields.some((field) => {
          const value = translation[field]
          return value !== null && value !== undefined && value !== ''
        })
        if (!hasRequiredContent) continue
      }

      // Extract data for this translation
      const data = dataExtractor(translation)
      if (!data) continue

      // Check if extracted data has any non-empty values
      const hasContent = Object.values(data).some((v) => v !== null && v !== undefined && v !== '')
      if (!hasContent) continue

      // Update the document with locale-specific data
      const localeStart = DEBUG ? Date.now() : 0
      // Track current operation for heartbeat context
      this.setCurrentOperation(`Updating ${collection}:${id} locale=${translation.locale}`)
      // Determine if this locale should be published using native per-locale publishing
      const shouldPublishLocale = options?.shouldPublish?.(translation)
      await this.executeWithRetry(() =>
        this.payload.update({
          collection,
          id,
          data,
          locale: translation.locale as TypedLocale,
          publishSpecificLocale: shouldPublishLocale
            ? (translation.locale as TypedLocale)
            : undefined,
        }),
      )
      if (DEBUG)
        console.log(
          `[LOCALE] Updated ${collection}:${id} locale=${translation.locale} (${Date.now() - localeStart}ms)`,
        )
      updatedCount++
    }

    if (DEBUG && updatedCount > 0) {
      console.log(
        `[LOCALE] Complete ${collection}:${id} - ${updatedCount} locales in ${Date.now() - startTime}ms (avg: ${Math.round((Date.now() - startTime) / updatedCount)}ms/locale)`,
      )
    }

    return updatedCount
  }

  /**
   * Create a summary string from a natural key Where clause
   */
  private summarizeKey(key: Where): string {
    if (typeof key === 'object' && key !== null) {
      // Handle simple { field: { equals: value } } pattern
      const entries = Object.entries(key)
      if (entries.length === 1) {
        const [field, condition] = entries[0]
        if (typeof condition === 'object' && condition !== null && 'equals' in condition) {
          return `${field}=${condition.equals}`
        }
      }
      // Handle 'and' array pattern
      if ('and' in key && Array.isArray(key.and)) {
        return key.and
          .map((k) => this.summarizeKey(k))
          .filter(Boolean)
          .join(', ')
      }
    }
    return JSON.stringify(key)
  }

  /**
   * Extract slug value from a natural key Where clause
   * Handles { slug: { equals: 'value' } } pattern
   */
  private extractSlugFromKey(key: Where): string | null {
    if (typeof key === 'object' && key !== null) {
      // Handle simple { slug: { equals: value } } pattern
      if ('slug' in key) {
        const slugCondition = (key as Record<string, unknown>).slug
        if (
          typeof slugCondition === 'object' &&
          slugCondition !== null &&
          'equals' in slugCondition
        ) {
          const value = (slugCondition as { equals: unknown }).equals
          if (typeof value === 'string') {
            return value
          }
        }
      }
      // Handle 'and' array pattern - look for slug condition in array
      if ('and' in key && Array.isArray(key.and)) {
        for (const condition of key.and) {
          const slug = this.extractSlugFromKey(condition)
          if (slug) return slug
        }
      }
    }
    return null
  }

  /**
   * Extract the value from a natural key Where clause.
   * Supports:
   * - Simple: { field: { equals: 'value' } }
   * - Compound: { and: [{ field1: { equals: 'value1' } }, { field2: { equals: 'value2' } }] }
   *
   * For compound keys, values are joined with '-' (e.g., "Unit 1-3")
   *
   * @param naturalKey - Where clause to extract value from
   * @returns The string value, or undefined if pattern doesn't match
   */
  private extractNaturalKeyValue(naturalKey: Where): string | undefined {
    if (typeof naturalKey !== 'object' || naturalKey === null) return undefined

    const entries = Object.entries(naturalKey)
    if (entries.length !== 1) return undefined

    const [key, condition] = entries[0]

    // Handle compound AND conditions: { and: [{ unit: { equals: 'Unit 1' } }, { step: { equals: 3 } }] }
    // Builds composite key by joining values with '-' (e.g., "Unit 1-3")
    if (key === 'and' && Array.isArray(condition)) {
      const values: string[] = []
      for (const subCondition of condition as Where[]) {
        const value = this.extractNaturalKeyValue(subCondition)
        if (value) values.push(value)
      }
      // Only return composite key if all conditions extracted successfully
      return values.length === condition.length ? values.join('-') : undefined
    }

    // Handle simple conditions: { field: { equals: 'value' } }
    if (typeof condition === 'object' && condition !== null && 'equals' in condition) {
      const value = (condition as { equals: unknown }).equals
      return value !== null && value !== undefined ? String(value) : undefined
    }
    return undefined
  }

  // ============================================================================
  // RETRY & THROTTLING
  // ============================================================================

  /**
   * Small delay between database operations to reduce contention
   * Only applies when not in dry-run mode
   */
  private async throttle(ms: number = 10): Promise<void> {
    if (!this.options.dryRun && ms > 0) {
      await new Promise((r) => setTimeout(r, ms))
    }
  }

  /**
   * Execute an operation with exponential backoff retry for SQLITE_BUSY errors
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 8,
    baseDelay: number = 150,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation()
        // Small delay after successful operation to reduce contention
        await this.throttle(5)
        return result
      } catch (error) {
        if (!isRetryableError(error) || attempt === maxRetries) {
          throw error
        }

        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100
        const DEBUG = process.env.DEBUG_IMPORT === 'true'
        if (DEBUG) {
          const errorMsg = error instanceof Error ? error.message.slice(0, 50) : 'Unknown'
          console.log(
            `[RETRY] Retryable error (${errorMsg}...), retrying in ${Math.round(delay)}ms (attempt ${attempt}/${maxRetries})`,
          )
        }
        await new Promise((r) => setTimeout(r, delay))
      }
    }
    throw new Error('Retry failed') // Should never reach here
  }

  /**
   * Check if an error is a slug collision (UNIQUE constraint on slug)
   */
  private isSlugCollisionError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    return error.message.includes('UNIQUE constraint failed') && error.message.includes('slug')
  }

  /**
   * Write slug collisions to file for manual review
   */
  private async writeCollisionsFile(): Promise<void> {
    if (this.collisions.length === 0) return

    const collisionsPath = path.join(this.cacheDir, 'collisions.json')
    await fs.writeFile(collisionsPath, JSON.stringify(this.collisions, null, 2), 'utf-8')
    await this.logger.warn(
      `${this.collisions.length} slug collisions written to: ${collisionsPath}`,
    )
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  /**
   * Add an error to the report and log it
   */
  protected addError(context: string, error: Error | string): void {
    const message = error instanceof Error ? error.message : error
    const fullMessage = `${context}: ${message}`
    this.report.addError(fullMessage)
    this.report.incrementErrors()
    this.logger.error(fullMessage)
  }

  /**
   * Add a warning to the report and log it
   */
  protected addWarning(message: string): void {
    this.report.addWarning(message)
    this.logger.warn(message)
  }

  /**
   * Log a skipped item, increment skip counter, and optionally send SSE event
   *
   * @param message - Skip reason message
   * @param options - Optional context for SSE reporting
   */
  protected async skip(
    message: string,
    options?: {
      collection?: string
      identifier?: string
      current?: number
      total?: number
    },
  ): Promise<void> {
    this.report.incrementSkipped()
    await this.logger.skip(message)

    // Send SSE event if context is provided
    if (options?.collection && options?.identifier) {
      await this.reportDocument(options.collection, options.identifier, 'skipped', {
        error: message,
        current: options.current,
        total: options.total,
      })
    }
  }

  // ============================================================================
  // SUMMARY PRINTING
  // ============================================================================

  /**
   * Print summary using ValidationReport data
   */
  protected printSummary(): void {
    const summary = this.report.getSummary()

    console.log('\n' + '='.repeat(60))
    console.log(`${this.importName.toUpperCase()} IMPORT SUMMARY`)
    console.log('='.repeat(60))

    console.log('\n📊 Records:')
    console.log(`  Created:  ${summary.created}`)
    if (summary.updated) {
      console.log(`  Updated:  ${summary.updated}`)
    }
    console.log(`  Skipped:  ${summary.skipped}`)
    console.log(`  Errors:   ${summary.errors}`)

    const warnings = this.report.getWarningCount()
    if (warnings > 0) {
      console.log(`\n⚠️  Warnings: ${warnings}`)
    }

    const errorCount = this.report.getErrorCount()
    if (errorCount === 0) {
      console.log('\n✅ Import completed successfully')
    } else {
      console.log(`\n❌ Import completed with ${errorCount} error(s)`)
    }

    console.log('='.repeat(60))
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Helper to parse CLI args and create options object
 * Subclasses can use this in their main() function
 */
export function createImportOptions(): CLIArgs & BaseImportOptions {
  return parseArgs() as CLIArgs & BaseImportOptions
}
