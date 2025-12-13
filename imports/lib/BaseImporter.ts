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
import { ValidationReport } from './validationReport'
import configPromise from '../../src/payload.config'

// ============================================================================
// TYPES
// ============================================================================

export interface BaseImportOptions {
  dryRun: boolean
  clearCache: boolean
  payload?: Payload // Optional external Payload instance (for migrations)
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

  // Track if Payload was injected externally (for migrations)
  private externalPayload: boolean = false

  constructor(options: TOptions) {
    this.options = options
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
      // 1. Setup cache directory (before Logger needs it)
      await this.setupCacheDirectory()

      // 2. Initialize core utilities
      this.logger = new Logger(this.cacheDir)
      this.fileUtils = new FileUtils(this.logger)
      this.report = new ValidationReport()

      // 3. Handle cache clearing (before Payload init, requires fileUtils)
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

      // 6. Execute import (subclass implementation)
      await this.import()

      // 7. Generate report and print summary
      await this.finalize()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger?.error(`Fatal error: ${message}`)
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
  // IDEMPOTENT UPSERT OPERATIONS
  // ============================================================================

  /**
   * Find or upsert a document by natural key(s)
   * This is the core idempotency method all scripts should use
   *
   * @param collection - Payload collection slug
   * @param naturalKey - Where clause to find existing document
   * @param data - Document data to create or update with
   * @param options - Optional locale and file data
   * @returns UpsertResult with the document and action taken
   */
  protected async upsert<T extends { id: number | string }>(
    collection: CollectionSlug,
    naturalKey: Where,
    data: Record<string, any>,
    options?: {
      locale?: TypedLocale
      file?: FileData
    },
  ): Promise<UpsertResult<T>> {
    if (this.options.dryRun) {
      await this.logger.info(`[DRY RUN] Would upsert ${collection}: ${JSON.stringify(naturalKey)}`)
      this.report.incrementSkipped()
      return { doc: data as T, action: 'skipped' }
    }

    try {
      // Find existing by natural key (with retry for SQLITE_BUSY)
      const existing = await this.executeWithRetry(() =>
        this.payload.find({
          collection,
          where: naturalKey,
          limit: 1,
          locale: options?.locale,
        }),
      )

      if (existing.docs.length > 0) {
        // Update existing (with retry for SQLITE_BUSY)
        const updated = await this.executeWithRetry(() =>
          this.payload.update({
            collection,
            id: existing.docs[0].id,
            data,
            locale: options?.locale,
            file: options?.file,
          }),
        )

        this.report.incrementUpdated()
        await this.logger.info(`  ↻ Updated ${collection}: ${this.summarizeKey(naturalKey)}`)
        return { doc: updated as unknown as T, action: 'updated' }
      }

      // Create new (with retry for SQLITE_BUSY)
      const created = await this.executeWithRetry(() =>
        this.payload.create({
          collection,
          data,
          locale: options?.locale,
          file: options?.file,
        }),
      )

      this.report.incrementCreated()
      await this.logger.success(`  ✓ Created ${collection}: ${this.summarizeKey(naturalKey)}`)
      return { doc: created as unknown as T, action: 'created' }
    } catch (error) {
      // Handle slug collision - log for manual review and skip
      if (this.isSlugCollisionError(error)) {
        const slug = (data.slug as string) || 'unknown'
        this.collisions.push({
          collection,
          slug,
          data: data as Record<string, unknown>,
          error: error instanceof Error ? error.message : String(error),
        })
        this.addError(`Slug collision in ${collection}`, error as Error)
        this.report.incrementSkipped()
        return { doc: data as T, action: 'skipped' }
      }

      const message = error instanceof Error ? error.message : String(error)
      this.addError(`Upsert ${collection}`, error instanceof Error ? error : new Error(message))
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

  // ============================================================================
  // RETRY & COLLISION HANDLING
  // ============================================================================

  /**
   * Execute an operation with exponential backoff retry for SQLITE_BUSY errors
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 5,
    baseDelay: number = 100,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        const isBusy = error instanceof Error && error.message.includes('SQLITE_BUSY')

        if (!isBusy || attempt === maxRetries) {
          throw error
        }

        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100
        await this.logger.warn(
          `Database busy, retrying in ${Math.round(delay)}ms (attempt ${attempt}/${maxRetries})`,
        )
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
