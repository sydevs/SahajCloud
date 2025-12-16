/**
 * Base Importer
 *
 * Abstract base class for all import scripts. Provides common functionality:
 * - Payload CMS initialization
 * - Logger, FileUtils, ValidationReport setup
 * - Idempotent upsert operations
 * - Summary printing and cleanup lifecycle
 */

/* eslint-disable no-console */

import 'dotenv/config'

import { promises as fs } from 'fs'
import * as path from 'path'

import { getPayload, Payload, CollectionSlug, Where, TypedLocale } from 'payload'

import { parseArgs, CLIArgs } from './cliParser'
import { FileUtils } from './fileUtils'
import { Logger } from './logger'
import { isCloudflareWorker } from './runtime'
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
  type: 'start' | 'document' | 'complete' | 'error'
  // For 'start':
  script?: string
  dryRun?: boolean
  // For 'document':
  document?: DocumentResult
  current?: number
  total?: number
  // For 'complete':
  summary?: Record<string, unknown>
  // For 'error':
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
  payload?: Payload // Optional external Payload instance (for API routes)
  onProgress?: OnProgressCallback // Optional progress callback for SSE streaming
}

export interface UpsertResult<T = any> {
  doc: T
  action: 'created' | 'updated' | 'skipped'
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

  // Track if running in Cloudflare Workers (no filesystem)
  private readonly isWorker: boolean

  // Track current operation for heartbeat progress (SSE keep-alive)
  private currentOperation: string = ''

  constructor(options: TOptions) {
    this.options = options
    this.isWorker = isCloudflareWorker()
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
  // LIFECYCLE METHODS
  // ============================================================================

  /**
   * Main entry point - handles initialization, execution, and cleanup
   */
  async run(): Promise<void> {
    // Console output only for CLI mode (not Workers)
    if (!this.isWorker) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`${this.importName} Import`)
      console.log('='.repeat(60))

      if (this.options.dryRun) {
        console.log('\nMode: DRY RUN - No data will be written\n')
      }
    }

    try {
      // 1. Setup cache directory (skip in Workers - no filesystem)
      if (!this.isWorker) {
        await this.setupCacheDirectory()
      }

      // 2. Initialize core utilities
      this.logger = new Logger()
      this.fileUtils = new FileUtils(this.logger)
      this.report = new ValidationReport()

      // 3. Handle cache clearing (skip in Workers - no filesystem)
      if (this.options.clearCache && !this.isWorker) {
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

      // 6. Execute import (subclass implementation)
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
   * Load data file with dual-mode support:
   * - Local development: Read from filesystem
   * - Cloudflare Workers: Fetch from URL
   *
   * @param localPath - Path to local file (used in local dev)
   * @param workerUrl - URL to fetch from (required in Workers mode)
   * @returns File contents as string
   */
  protected async loadDataFile(localPath: string, workerUrl?: string): Promise<string> {
    if (this.isWorker) {
      if (!workerUrl) {
        throw new Error(`Worker mode requires URL for data file: ${localPath}`)
      }
      const response = await fetch(workerUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch ${workerUrl}: ${response.status}`)
      }
      return response.text()
    }

    // Local development: read from filesystem
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
    // File operations only for CLI mode (not Workers)
    if (!this.isWorker) {
      // Write slug collisions file if any
      await this.writeCollisionsFile()

      // Generate markdown report
      const reportPath = path.join(this.cacheDir, 'import-report.md')
      await this.report.generate(reportPath, this.importName)

      // Print console summary
      this.printSummary()

      await this.logger.success(`\nReport saved to: ${reportPath}`)
    }
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

    // Console output (CLI mode)
    if (!this.isWorker) {
      const icon =
        action === 'created'
          ? '✓'
          : action === 'updated'
            ? '↻'
            : action === 'skipped'
              ? '○'
              : '✗'
      const status = action === 'error' ? `error: ${options?.error}` : action
      console.log(`  ${identifier} ${icon} ${status}`)

      if (options?.warnings?.length) {
        for (const w of options.warnings) {
          console.log(`    ⚠ ${w}`)
        }
      }
    }
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
      // Find existing by natural key (with retry for SQLITE_BUSY)
      const findStart = DEBUG ? Date.now() : 0
      if (DEBUG) console.log(`[UPSERT] Finding existing ${collection}:${identifier}`)
      const existing = await this.executeWithRetry(() =>
        this.payload.find({
          collection,
          where: naturalKey,
          limit: 1,
          locale: options?.locale,
        }),
      )
      if (DEBUG) console.log(`[UPSERT] Found ${existing.docs.length} existing for ${collection}:${identifier} (${Date.now() - findStart}ms)`)

      if (existing.docs.length > 0) {
        // Update existing (with retry for SQLITE_BUSY)
        const updateStart = DEBUG ? Date.now() : 0
        if (DEBUG) console.log(`[UPSERT] Updating ${collection}:${identifier}`)
        // Track file upload operation for heartbeat
        if (options?.file) {
          this.setCurrentOperation(`Uploading ${collection}:${identifier}`)
        }
        const updated = await this.executeWithRetry(() =>
          this.payload.update({
            collection,
            id: existing.docs[0].id,
            data,
            locale: options?.locale,
            file: options?.file,
          }),
        )
        if (DEBUG) console.log(`[UPSERT] Updated ${collection}:${identifier} (${Date.now() - updateStart}ms)`)

        this.report.incrementUpdated()
        const reportStart = DEBUG ? Date.now() : 0
        await this.reportDocument(collection, identifier, 'updated', {
          current: options?.current,
          total: options?.total,
        })
        if (DEBUG) console.log(`[UPSERT] Complete ${collection}:${identifier} - total: ${Date.now() - startTime}ms (report: ${Date.now() - reportStart}ms)`)
        return { doc: updated as unknown as T, action: 'updated' }
      }

      // Create new (with retry for SQLITE_BUSY)
      const createStart = DEBUG ? Date.now() : 0
      if (DEBUG) console.log(`[UPSERT] Creating ${collection}:${identifier}`)
      // Track file upload operation for heartbeat
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
      if (DEBUG) console.log(`[UPSERT] Created ${collection}:${identifier} (${Date.now() - createStart}ms)`)

      this.report.incrementCreated()
      const reportStart = DEBUG ? Date.now() : 0
      await this.reportDocument(collection, identifier, 'created', {
        current: options?.current,
        total: options?.total,
      })
      if (DEBUG) console.log(`[UPSERT] Complete ${collection}:${identifier} - total: ${Date.now() - startTime}ms (report: ${Date.now() - reportStart}ms)`)
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
        try {
          const existingBySlug = await this.executeWithRetry(() =>
            this.payload.find({
              collection,
              where: { slug: { equals: slug } },
              limit: 1,
              locale: options?.locale,
            }),
          )

          if (existingBySlug.docs.length > 0) {
            // Found existing document - treat as update
            this.report.incrementUpdated()
            await this.reportDocument(collection, identifier, 'updated', {
              warnings: [`Slug collision resolved: found existing document with slug "${slug}"`],
              current: options?.current,
              total: options?.total,
            })
            return { doc: existingBySlug.docs[0] as unknown as T, action: 'updated' }
          }
        } catch (lookupError) {
          // Failed to look up existing - fall through to skip
          const lookupMsg = lookupError instanceof Error ? lookupError.message : String(lookupError)
          this.report.addWarning(`Failed to lookup existing document for slug collision: ${lookupMsg}`)
        }

        // Fallback: skip if we couldn't find existing
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.report.addError(`Slug collision in ${collection}: ${errorMsg}`)
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
      throw error
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
      const hasContent = Object.values(data).some(
        (v) => v !== null && v !== undefined && v !== '',
      )
      if (!hasContent) continue

      // Update the document with locale-specific data
      const localeStart = DEBUG ? Date.now() : 0
      // Track current operation for heartbeat context
      this.setCurrentOperation(`Updating ${collection}:${id} locale=${translation.locale}`)
      await this.executeWithRetry(() =>
        this.payload.update({
          collection,
          id,
          data,
          locale: translation.locale as TypedLocale,
        }),
      )
      if (DEBUG) console.log(`[LOCALE] Updated ${collection}:${id} locale=${translation.locale} (${Date.now() - localeStart}ms)`)
      updatedCount++
    }

    if (DEBUG && updatedCount > 0) {
      console.log(`[LOCALE] Complete ${collection}:${id} - ${updatedCount} locales in ${Date.now() - startTime}ms (avg: ${Math.round((Date.now() - startTime) / updatedCount)}ms/locale)`)
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
        if (typeof slugCondition === 'object' && slugCondition !== null && 'equals' in slugCondition) {
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

  // ============================================================================
  // RETRY & THROTTLING
  // ============================================================================

  /**
   * Check if an error is a retryable error (database busy or network issues)
   * Handles both SQLite/D1 database errors and miniflare proxy connection errors
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    const msg = error.message.toLowerCase()
    return (
      // Database busy/lock errors
      msg.includes('sqlite_busy') ||
      msg.includes('database is locked') ||
      msg.includes('d1_error') ||
      // Network/connection errors from miniflare proxy (undici fetch)
      msg.includes('fetch failed') ||
      msg.includes('other side closed') ||
      msg.includes('socket closed') ||
      msg.includes('network connection lost') ||
      msg.includes('und_err_socket')
    )
  }

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
        if (!this.isRetryableError(error) || attempt === maxRetries) {
          throw error
        }

        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100
        const DEBUG = process.env.DEBUG_IMPORT === 'true'
        if (DEBUG) {
          const errorMsg = error instanceof Error ? error.message.slice(0, 50) : 'Unknown'
          console.log(`[RETRY] Retryable error (${errorMsg}...), retrying in ${Math.round(delay)}ms (attempt ${attempt}/${maxRetries})`)
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
    await this.logger.warn(`${this.collisions.length} slug collisions written to: ${collisionsPath}`)
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
   * Log a skipped item and increment skip counter
   */
  protected skip(message: string): void {
    this.report.incrementSkipped()
    this.logger.skip(message)
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
