import { promises as fs } from 'fs'
import * as path from 'path'

import dotenv from 'dotenv'
import { getPayload, Payload, CollectionSlug, Where, TypedLocale } from 'payload'

// Next.js precedence: the real shell environment wins, then .env.local, then
// .env. dotenv walks the array in order and never overwrites an already-set key.
dotenv.config({ path: ['.env.local', '.env'] })

import { DEFAULT_LOCALE } from '@/lib/locales'
import { isRecord } from '@/lib/utilities/isRecord'

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

// --- Types ---

export interface DocumentResult {
  collection: string
  identifier: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  error?: string
  warnings?: string[]
}

/** Import event sent via SSE */
export interface ImportEvent {
  type: 'start' | 'document' | 'complete' | 'error' | 'info'
  // For 'start':
  script?: string
  dryRun?: boolean
  document?: DocumentResult
  current?: number
  total?: number
  // For 'complete':
  summary?: Record<string, unknown>
  // For 'error' and 'info':
  message?: string
  timestamp: string
}

/** Used by API routes for SSE streaming. */
export type OnProgressCallback = (data: Record<string, unknown>) => Promise<void>

export interface BaseImportOptions {
  dryRun: boolean
  clearCache: boolean
  updateMode?: boolean // If true, update existing docs; if false/undefined, skip them
  payload?: Payload // Optional external Payload instance (for API routes)
  onProgress?: OnProgressCallback // Optional progress callback for SSE streaming
  pagination?: PaginationOptions // Optional pagination for multi-step execution
  // Raw seed-file contents keyed by their canonical DataSource.localPath,
  // uploaded by the CLI when the Worker cannot fetch them itself (private repo).
  // Consumed via loadJsonData({ inlineContent }).
  inlineData?: Record<string, string>
}

/**
 * What `verifyRun` answers: why a run's own invariants failed, if they did.
 *
 * No `passed` beside it. A verdict field and the list it summarizes can
 * disagree, and the disagreement reads as a pass that said nothing — the
 * silent verification this hook exists to abolish. Empty means passed.
 */
export type RunVerification = { failures: string[] }

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

// --- Base importer class ---

export abstract class BaseImporter<TOptions extends BaseImportOptions = BaseImportOptions> {
  // Core dependencies (initialized in run())
  protected payload!: Payload
  protected logger!: Logger
  protected fileUtils!: FileUtils
  protected report!: ValidationReport
  private runVerification: RunVerification = { failures: [] }

  protected abstract readonly importName: string
  protected abstract readonly cacheDir: string

  protected options: TOptions

  // Track slug collisions for manual review
  private collisions: SlugCollision[] = []

  // Track if Payload was injected externally (for API routes)
  private externalPayload: boolean = false

  // Cache of preloaded collections for skip/update decisions
  protected preloadCache: Map<CollectionSlug, PreloadCache> = new Map()
  /** The locale each cached collection was read under, for the conflict warning below. */
  private preloadLocales: Map<CollectionSlug, TypedLocale | 'all'> = new Map()

  // Track current operation for heartbeat progress (SSE keep-alive)
  private currentOperation: string = ''

  // Pagination state for multi-step execution
  protected paginationState: PaginationState = createInitialPaginationState()

  constructor(options: TOptions) {
    this.options = options
  }

  // --- Public api ---

  /** Used by API routes to read final counts. */
  getReport(): ValidationReport {
    return this.report
  }

  /** What `verifyRun` answered for this run. A skipped check reports a pass. */
  getRunVerification(): RunVerification {
    return this.runVerification
  }

  /** Gives SSE heartbeats context during a long operation. */
  setCurrentOperation(operation: string): void {
    this.currentOperation = operation
  }

  /** Read by the API route for heartbeat context. */
  getCurrentOperation(): string {
    return this.currentOperation
  }

  // --- Pagination methods ---

  /** Slices the items, and updates the pagination state the report reads. */
  protected paginateItems<T>(items: T[]): T[] {
    const pagination = this.options.pagination
    if (!pagination || pagination.limit <= 0) {
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

  /** Active when a collection is targeted, or an explicit limit is set. */
  protected isPaginated(): boolean {
    const pagination = this.options.pagination
    if (!pagination) return false
    return pagination.collection !== undefined || pagination.limit > 0
  }

  /** True when no collection filter is set — every collection is targeted. */
  protected isCollectionTargeted(collection: string): boolean {
    const pagination = this.options.pagination
    if (!pagination?.collection) {
      return true
    }
    return pagination.collection === collection
  }

  getProcessedCount(): number {
    return this.paginationState.processedCount
  }

  hasMoreItems(): boolean {
    return this.paginationState.hasMore
  }

  getNextOffset(): number {
    return this.paginationState.nextOffset
  }

  getPaginationOptions(): PaginationOptions | undefined {
    return this.options.pagination
  }

  /** Restores relationships between paginated requests, which share no state. */
  protected async reconstructIdMap(
    collection: CollectionSlug,
    naturalKeyField: string,
  ): Promise<Map<string, string | number>> {
    const idMap = new Map<string, string | number>()

    if (this.options.dryRun || !this.payload) {
      return idMap
    }

    this.setCurrentOperation(`Rebuilding ${collection} ID map...`)

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
   * Override to rebuild the id maps a paginated run needs.
   *
   * Called when pagination is active, before `import()`.
   */
  protected async reconstructIdMaps(): Promise<void> {
  }

  // --- PRELOAD METHODS (for skip/update mode optimization) ---

  /**
   * Bulk fetch a collection for skip/update decisions. See the Preload
   * pattern in seeds/lib/AGENTS.md for the full rationale, including
   * why this includes soft-deleted docs and when the locale is required.
   *
   * @param collection - Collection to preload
   * @param naturalKeyField - Field to use as cache key, for example 'slug' or 'filename'
   * @param additionalFields - Additional fields to select beyond id and naturalKeyField
   * @param locale - Locale to read under. Omitted, Payload resolves the
   *   default (`en`), which a locale-filtering `beforeOperation` hook then
   *   narrows the cache to — pass `'all'` to see every locale's rows.
   * @returns PreloadCache map of natural key values to document data
   */
  protected async preloadCollection(
    collection: CollectionSlug,
    naturalKeyField: string,
    additionalFields?: string[],
    locale?: TypedLocale | 'all',
  ): Promise<PreloadCache> {
    if (this.preloadCache.has(collection)) {
      // One cache per collection, so the first locale wins. Asking again under
      // a different one would read the first answer and look like a locale miss.
      // Compared as resolved: omitting the argument and naming the default
      // locale read the same rows, so a mixed pair of call sites is not a
      // conflict while one states what the other inherits.
      const held = this.preloadLocales.get(collection)
      if (held !== (locale ?? DEFAULT_LOCALE)) {
        this.addWarning(
          `Preload of ${collection} requested locale ${locale ?? DEFAULT_LOCALE} but the ` +
            `cache already holds ${held}. Reusing it.`,
        )
      }
      return this.preloadCache.get(collection)!
    }

    this.preloadLocales.set(collection, locale ?? DEFAULT_LOCALE)

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

    let localizedKeyRefused = false

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
          locale,
          // Include soft-deleted docs. See the Preload pattern in
          // seeds/lib/AGENTS.md for why this cache must include trashed
          // rows, and the bug it fixes.
          trash: true,
        }),
      )

      for (const doc of result.docs) {
        const docRecord = doc as unknown as Record<string, unknown>

        // Cloudflare Images/Stream replaces filename with its own ID, so the
        // cache carries originalFilename too.
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

        const rawKey = docRecord[naturalKeyField]
        if (isRecord(rawKey)) {
          // A field-localized key under `locale: 'all'` arrives as a per-locale
          // object. `String()` would collapse every row onto `[object Object]`,
          // and merging the locales would answer a single-locale existence
          // question with another locale's row. Refuse it instead.
          localizedKeyRefused = true
          continue
        }
        const key = String(rawKey)
        if (key) {
          cache.set(key, doc as unknown as PreloadedDoc)
        }
      }

      hasMore = result.hasNextPage
      page++
    }

    if (localizedKeyRefused) {
      this.addWarning(
        `Preload of ${collection} by '${naturalKeyField}' read no key: the field is ` +
          `localized, so it cannot be cached under locale 'all'. Name one locale instead.`,
      )
    }

    await this.logger.info(`✓ Preloaded ${cache.size} ${collection}`)
    this.preloadCache.set(collection, cache)
    return cache
  }

  protected getPreloaded(
    collection: CollectionSlug,
    naturalKeyValue: string,
  ): PreloadedDoc | undefined {
    return this.preloadCache.get(collection)?.get(naturalKeyValue)
  }

  protected hasPreloaded(collection: CollectionSlug, naturalKeyValue: string): boolean {
    return this.preloadCache.get(collection)?.has(naturalKeyValue) ?? false
  }

  // --- Lifecycle methods ---

  /** Main entry point - handles initialization, execution, and cleanup */
  async run(): Promise<void> {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`${this.importName} Import`)
    console.log('='.repeat(60))

    if (this.options.dryRun) {
      console.log('\nMode: DRY RUN - No data will be written\n')
    }

    try {
      await this.setupCacheDirectory()

      this.logger = new Logger()
      this.fileUtils = new FileUtils(this.logger)
      this.report = new ValidationReport()

      if (this.options.clearCache) {
        await this.clearCache()
      }

      // A dry run skips Payload entirely, for speed.
      if (this.options.payload) {
        this.payload = this.options.payload
        this.externalPayload = true
        await this.logger.info('Using externally provided Payload instance')
      } else if (!this.options.dryRun) {
        await this.initializePayload()
      } else {
        await this.logger.info('Skipping Payload initialization (dry run)')
      }

      await this.setup()

      // Must run after setup and before import.
      if (this.isPaginated()) {
        await this.reconstructIdMaps()
      }

      await this.import()

      // Neither a paginated batch nor a dry run is a run to check: one holds
      // part of the data, the other wrote nothing.
      if (!this.isPaginated() && !this.options.dryRun) {
        this.runVerification = await this.verifyRun()
      }

      // File output is CLI-only.
      await this.finalize()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger?.error(`Fatal error: ${message}`)
      await this.sendEvent({
        type: 'error',
        message,
      })
      throw error
    } finally {
      await this.cleanup()
    }
  }

  /** Override to add custom setup logic (called after Payload initialized) */
  protected async setup(): Promise<void> {
  }

  protected abstract import(): Promise<void>

  /**
   * Assert what this run can check about itself, whatever the target holds.
   *
   * Count verification asks the database for a floor, which a script whose
   * floor varies by environment cannot state. An invariant over the run's own
   * totals can still hold everywhere — for a data-file-driven script,
   * `created + updated + skipped + warnings === entries in the data file`,
   * which a truncated upload breaks. Default: nothing to check.
   *
   * `run()` calls this once the import has finished, so an override may reason
   * about the complete data file. It is skipped for a paginated batch, which
   * holds only part of one, and for a dry run, which wrote nothing — both then
   * report a pass, which `getRunVerification` hands to the caller.
   */
  protected async verifyRun(): Promise<RunVerification> {
    return { failures: [] }
  }

  protected async cleanup(): Promise<void> {
    // Only close the Payload database connection if this instance created it (not external)
    if (!this.externalPayload && this.payload?.db?.destroy) {
      await this.payload.db.destroy()
    }
  }

  // --- Initialization ---

  private async setupCacheDirectory(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true })
    await fs.mkdir(path.join(this.cacheDir, 'assets'), { recursive: true })
  }

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
    await fs.mkdir(path.join(this.cacheDir, 'assets'), { recursive: true })
    await this.logger.success('Cache cleared')
  }

  private async finalize(): Promise<void> {
    await this.writeCollisionsFile()

    const reportPath = path.join(this.cacheDir, 'import-report.md')
    await this.report.generate(reportPath, this.importName)

    this.printSummary()

    await this.logger.success(`\nReport saved to: ${reportPath}`)
  }

  // --- Progress reporting ---

  /** Used by API routes for SSE streaming. */
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

  /** Called automatically by `upsert`. */
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

    await this.sendEvent({
      type: 'document',
      document,
      current: options?.current,
      total: options?.total,
    })

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

  /** Progress summaries and status updates, over SSE. */
  protected async sendInfo(message: string): Promise<void> {
    await this.sendEvent({
      type: 'info',
      message,
    })

    console.log(`  ${message}`)
  }

  // --- Idempotent upsert operations ---

  /** The core idempotency method every script should use. */
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
      /** Uses Payload's native per-locale publishing. */
      publishSpecificLocale?: TypedLocale
      /** Force file upload even on update (default: false - skips file on update, assumes existing file is correct) */
      forceFileUpload?: boolean
      /** Extra `req.context` forwarded to create/update, for example `{ skipVerifyHook: true }`. */
      context?: Record<string, unknown>
      /** Skip Payload's verification email on create (bulk auth imports avoid mail rate limits). */
      disableVerificationEmail?: boolean
    },
  ): Promise<UpsertResult<T>> {
    const identifier = options?.identifier || this.summarizeKey(naturalKey)
    const DEBUG = process.env.DEBUG_IMPORT === 'true'
    const startTime = DEBUG ? Date.now() : 0

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
            context: options?.context,
            // `preloadCollection` deliberately includes trashed rows, so this id
            // can be one — and an update without `trash: true` refuses it with
            // `Not Found`. A no-op where trash is disabled.
            trash: true,
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
            context: options?.context,
            disableVerificationEmail: options?.disableVerificationEmail,
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

      // Fallback: the collection was not preloaded.
      const findStart = DEBUG ? Date.now() : 0
      if (DEBUG) console.log(`[UPSERT] Finding existing ${collection}:${identifier} (fallback)`)
      const existing = await this.executeWithRetry(() =>
        this.payload.find({
          collection,
          where: naturalKey,
          limit: 1,
          locale: options?.locale,
          // Include trashed rows. Payload appends `deletedAt exists: false` to
          // every read on a trash-enabled collection unless asked otherwise, so
          // without this a trashed row reads as absent and the importer creates
          // a duplicate on its natural key. A no-op where trash is disabled.
          trash: true,
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

        // UPDATE MODE: Update existing (with retry for transient database errors)
        const updateStart = DEBUG ? Date.now() : 0
        if (DEBUG) console.log(`[UPSERT] Updating ${collection}:${identifier}`)
        // An existing file is assumed correct, so only data fields update.
        const fileForUpdate = options?.forceFileUpload ? options?.file : undefined
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
            context: options?.context,
            // Same reason as the find above — an update targeting a trashed row
            // throws `Not Found` without it. Two archived Atlas events failed
            // on every run until this was passed.
            trash: true,
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

      // Create new (with retry for transient database errors)
      const createStart = DEBUG ? Date.now() : 0
      if (DEBUG) console.log(`[UPSERT] Creating ${collection}:${identifier}`)
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
          context: options?.context,
          disableVerificationEmail: options?.disableVerificationEmail,
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
        // Also create a version without hyphens for fuzzy matching, for example parimala-sab-u versus parimala-sabu
        const slugWithoutHyphens = normalizedSlug.replace(/-/g, '')

        try {
          // Try exact-ish match first
          let existingBySlug = await this.executeWithRetry(() =>
            this.payload.find({
              collection,
              where: { slug: { like: normalizedSlug } },
              limit: 5,
              locale: options?.locale,
              // A trashed row still occupies its slug, so it has to be visible
              // here or the collision it caused looks like it came from nowhere.
              trash: true,
            }),
          )

          // If not found, try matching without hyphens (more fuzzy)
          if (existingBySlug.docs.length === 0 && slugWithoutHyphens.length > 3) {
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
                trash: true,
              }),
            )
            existingBySlug.docs = existingBySlug.docs.filter((doc) => {
              const docSlug = ((doc as unknown as Record<string, unknown>).slug as string) || ''
              return docSlug.replace(/-/g, '').toLowerCase() === slugWithoutHyphens
            })
          }

          if (existingBySlug.docs.length > 0) {
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
      // Name the row. Without the identifier a 291-error run says only that
      // "registrations" failed 291 times, which is undiagnosable — the whole
      // point of the report is telling an operator which rows to go and look at.
      this.report.addError(`Upsert ${collection} (${identifier}): ${errorMsg}`)
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

  /** Read-only lookup by natural key. */
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
      // An existence check blind to trashed rows reports "absent", and the
      // caller then creates a duplicate on the natural key the trashed row
      // still holds. Same trap as `preloadCollection`.
      trash: true,
    })

    return result.docs.length > 0 ? (result.docs[0] as T) : null
  }

  /**
   * Update localized content for every translation that carries any.
   *
   * @returns How many locales were updated.
   */
  protected async updateLocales<T extends { locale?: string }>(
    collection: CollectionSlug,
    id: number | string,
    translations: T[],
    dataExtractor: (translation: T) => Record<string, unknown> | null,
    options?: {
      /** Skip this locale, for example 'en' if already created with upsert */
      excludeLocale?: string
      /** Only process translations where these fields have non-empty values */
      requiredFields?: (keyof T)[]
      /** List of valid locales (defaults to checking against Payload's TypedLocale) */
      validLocales?: string[]
      /** Uses Payload's native per-locale publishing. */
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
      if (!translation.locale) continue

      // Skip excluded locale (usually 'en' which was handled in initial upsert)
      if (options?.excludeLocale && translation.locale === options.excludeLocale) continue

      if (options?.validLocales && !options.validLocales.includes(translation.locale)) continue

      // Check required fields have non-empty values
      if (options?.requiredFields) {
        const hasRequiredContent = options.requiredFields.some((field) => {
          const value = translation[field]
          return value !== null && value !== undefined && value !== ''
        })
        if (!hasRequiredContent) continue
      }

      const data = dataExtractor(translation)
      if (!data) continue

      const hasContent = Object.values(data).some((v) => v !== null && v !== undefined && v !== '')
      if (!hasContent) continue

      const localeStart = DEBUG ? Date.now() : 0
      this.setCurrentOperation(`Updating ${collection}:${id} locale=${translation.locale}`)
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
          trash: true,
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

  /** Handles the `{ slug: { equals: value } }` pattern. */
  private extractSlugFromKey(key: Where): string | null {
    if (typeof key === 'object' && key !== null) {
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
   * Supports:
   * - Simple: { field: { equals: 'value' } }
   * - Compound: { and: [{ field1: { equals: 'value1' } }, { field2: { equals: 'value2' } }] }
   *
   * A compound key joins its values with '-', for example "Unit 1-3".
   */
  private extractNaturalKeyValue(naturalKey: Where): string | undefined {
    if (typeof naturalKey !== 'object' || naturalKey === null) return undefined

    const entries = Object.entries(naturalKey)
    if (entries.length !== 1) return undefined

    const [key, condition] = entries[0]

    // Handle compound AND conditions: { and: [{ unit: { equals: 'Unit 1' } }, { step: { equals: 3 } }] }
    if (key === 'and' && Array.isArray(condition)) {
      const values: string[] = []
      for (const subCondition of condition as Where[]) {
        const value = this.extractNaturalKeyValue(subCondition)
        if (value) values.push(value)
      }
      return values.length === condition.length ? values.join('-') : undefined
    }

    // Handle simple conditions: { field: { equals: 'value' } }
    if (typeof condition === 'object' && condition !== null && 'equals' in condition) {
      const value = (condition as { equals: unknown }).equals
      return value !== null && value !== undefined ? String(value) : undefined
    }
    return undefined
  }

  // --- Retry & throttling ---

  /** Reduces database contention. Skipped in a dry run. */
  private async throttle(ms: number = 10): Promise<void> {
    if (!this.options.dryRun && ms > 0) {
      await new Promise((r) => setTimeout(r, ms))
    }
  }

  /** Retries transient database and connection errors, with exponential backoff. */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 8,
    baseDelay: number = 150,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation()
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

  /** Check if an error is a slug collision (UNIQUE constraint on slug) */
  private isSlugCollisionError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    return error.message.includes('UNIQUE constraint failed') && error.message.includes('slug')
  }

  /** Write slug collisions to file for manual review */
  private async writeCollisionsFile(): Promise<void> {
    if (this.collisions.length === 0) return

    const collisionsPath = path.join(this.cacheDir, 'collisions.json')
    await fs.writeFile(collisionsPath, JSON.stringify(this.collisions, null, 2), 'utf-8')
    await this.logger.warn(
      `${this.collisions.length} slug collisions written to: ${collisionsPath}`,
    )
  }

  // --- Error handling ---

  /** Add an error to the report and log it */
  protected addError(context: string, error: Error | string): void {
    const message = error instanceof Error ? error.message : error
    const fullMessage = `${context}: ${message}`
    this.report.addError(fullMessage)
    this.report.incrementErrors()
    this.logger.error(fullMessage)
  }

  /** Add a warning to the report and log it */
  protected addWarning(message: string): void {
    this.report.addWarning(message)
    this.logger.warn(message)
  }

  /** Logs the skip, counts it, and sends an SSE event given a context. */
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

    if (options?.collection && options?.identifier) {
      await this.reportDocument(options.collection, options.identifier, 'skipped', {
        error: message,
        current: options.current,
        total: options.total,
      })
    }
  }

  // --- Summary printing ---

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

// --- Factory function ---

/** For a subclass's own `main()`. */
export function createImportOptions(): CLIArgs & BaseImportOptions {
  return parseArgs() as CLIArgs & BaseImportOptions
}
