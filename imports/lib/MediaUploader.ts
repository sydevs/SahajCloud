/**
 * Media Uploader with Deduplication
 *
 * Handles uploading media files to Payload CMS with intelligent deduplication
 * to prevent duplicate media uploads across multiple import runs.
 */

import type { Logger } from './logger'
import type { Payload } from 'payload'

import { promises as fs } from 'fs'
import * as path from 'path'

import type { ImageTag } from '@/payload-types'

// ============================================================================
// TYPES
// ============================================================================

export interface MediaUploadOptions {
  alt?: string
  credit?: string
  tags?: number[]
  locale?: string | undefined
  /** Buffer for Workers mode (no filesystem) */
  buffer?: Buffer
}

export interface MediaUploadResult {
  id: number | string
  filename: string
  wasReused: boolean
}

// ============================================================================
// MEDIA UPLOADER
// ============================================================================

export class MediaUploader {
  private payload: Payload
  private logger: Logger
  private mediaCache: Map<string, number | string> = new Map() // filename -> mediaId
  private stats = {
    uploaded: 0,
    reused: 0,
  }

  // Track if media has been pre-loaded
  private isPreloaded = false

  constructor(payload: Payload, logger: Logger) {
    this.payload = payload
    this.logger = logger
  }

  /**
   * Pre-load all existing media filenames into memory cache.
   * Call this before uploading to avoid N+1 database queries.
   */
  async preloadExistingMedia(): Promise<void> {
    await this.logger.info('Pre-loading existing media index...')

    let page = 1
    const limit = 500
    let hasMore = true
    let totalLoaded = 0

    while (hasMore) {
      const result = await this.payload.find({
        collection: 'images',
        limit,
        page,
        // Only fetch filename field for efficiency
        depth: 0,
      })

      for (const doc of result.docs) {
        if (doc.filename) {
          // Extract base name for matching (handles Payload's suffixes)
          const baseName = this.extractBaseName(doc.filename)
          this.mediaCache.set(baseName, doc.id)
          // Also cache the full filename for exact matches
          this.mediaCache.set(doc.filename, doc.id)
        }
      }

      totalLoaded += result.docs.length
      hasMore = result.hasNextPage
      page++
    }

    this.isPreloaded = true
    await this.logger.info(`✓ Pre-loaded ${totalLoaded} media files into cache`)
  }

  /**
   * Extract base filename for deduplication matching
   * Removes Payload's auto-generated suffixes (e.g., "-abc123")
   */
  private extractBaseName(filename: string): string {
    const ext = filename.substring(filename.lastIndexOf('.'))
    const withoutExt = filename.substring(0, filename.lastIndexOf('.'))
    // Remove Payload's suffix pattern: -[a-z0-9]+ at the end
    const baseName = withoutExt.replace(/-[a-z0-9]+$/i, '')
    return baseName + ext
  }

  /**
   * Upload media file with deduplication
   *
   * This method checks if media with the same filename already exists in the database,
   * accounting for Payload's automatic filename suffixes (e.g., image-abc123.jpg).
   * If found, it reuses the existing media instead of uploading a duplicate.
   *
   * @param localPath - Path to the local file to upload
   * @param options - Upload options (alt text, credit, tags, locale)
   * @returns MediaUploadResult with ID, filename, and reuse status
   */
  async uploadWithDeduplication(
    localPath: string,
    options: MediaUploadOptions = {},
  ): Promise<MediaUploadResult | null> {
    try {
      const filename = path.basename(localPath)

      // Check memory cache first
      let existingMediaId = this.mediaCache.get(filename)

      // If not in memory, check database for existing media with similar filename
      // Payload adds unique suffixes like "-abc123" to filenames, so we need to check
      // if the filename starts with our base filename (without extension)
      if (!existingMediaId) {
        const foundId = await this.findExistingMedia(filename)
        if (foundId) {
          existingMediaId = foundId
          // Add to cache for future lookups
          this.mediaCache.set(filename, existingMediaId)
        }
      }

      // If existing media found, validate and reuse it
      if (existingMediaId) {
        const isValid = await this.validateExistingMedia(existingMediaId)
        if (isValid) {
          // Update tags if provided
          if (options.tags && options.tags.length > 0) {
            await this.updateMediaTags(existingMediaId, options.tags)
          }

          this.stats.reused++
          const media = await this.payload.findByID({
            collection: 'images',
            id: existingMediaId,
          })
          await this.logger.log(`    ✓ Reusing existing media: ${media.filename}`)

          return {
            id: existingMediaId,
            filename: media.filename || filename,
            wasReused: true,
          }
        } else {
          // Media no longer valid, remove from cache
          this.mediaCache.delete(filename)
        }
      }

      // Upload new media file
      const result = await this.uploadNewMedia(localPath, options)
      if (result) {
        this.mediaCache.set(filename, result.id)
        this.stats.uploaded++
        await this.logger.log(`    ✓ Uploaded new media: ${result.filename}`)
      }

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger.error(`Failed to upload ${path.basename(localPath)}: ${message}`)
      return null
    }
  }

  /**
   * Find existing media by filename pattern.
   * Uses pre-loaded cache if available, falls back to database query.
   */
  private async findExistingMedia(filename: string): Promise<number | string | null> {
    // If pre-loaded, check cache first (synchronous lookup)
    if (this.isPreloaded) {
      // Try exact filename match
      const exactMatch = this.mediaCache.get(filename)
      if (exactMatch) {
        await this.logger.log(`    ✓ Found in cache (exact): ${filename}`)
        return exactMatch
      }

      // Try base name match (handles Payload suffixes)
      const baseName = this.extractBaseName(filename)
      const baseMatch = this.mediaCache.get(baseName)
      if (baseMatch) {
        await this.logger.log(`    ✓ Found in cache (base): ${baseName}`)
        return baseMatch
      }

      // Not in cache, and cache is complete - no need to query DB
      return null
    }

    // Fallback: query database (used when preload wasn't called)
    try {
      const baseNameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename
      const extension = filename.substring(filename.lastIndexOf('.'))

      const existingMedia = await this.payload.find({
        collection: 'images',
        where: {
          filename: {
            contains: baseNameWithoutExt,
          },
        },
        limit: 100, // Get multiple to check for exact matches
      })

      // Find exact match by checking if filename matches the pattern:
      // baseNameWithoutExt + (optional Payload suffix) + extension
      for (const doc of existingMedia.docs) {
        const docFilename = doc.filename || ''
        // Check if this is our file (exact match or with Payload's suffix)
        // Pattern: originalname.ext or originalname-suffix.ext
        const escapedExt = extension.replace('.', '\\.')
        const regex = new RegExp(`^${baseNameWithoutExt}(-[a-z0-9]+)?${escapedExt}$`, 'i')
        if (regex.test(docFilename)) {
          await this.logger.log(
            `    ✓ Found existing media in database: ${docFilename} (matches ${filename})`,
          )
          return doc.id
        }
      }

      return null
    } catch (_error) {
      // No existing media found
      return null
    }
  }

  /**
   * Validate that existing media still exists and is accessible
   */
  private async validateExistingMedia(mediaId: number | string): Promise<boolean> {
    try {
      const media = await this.payload.findByID({
        collection: 'images',
        id: mediaId,
      })
      return !!media && !!media.filename
    } catch (_error) {
      return false
    }
  }

  /**
   * Update tags on existing media
   */
  private async updateMediaTags(mediaId: number | string, newTags: number[]): Promise<void> {
    try {
      const media = await this.payload.findByID({
        collection: 'images',
        id: mediaId,
      })

      // Merge existing tags with new tags
      const existingTags = Array.isArray(media.tags)
        ? media.tags.map((tag: number | ImageTag) => (typeof tag === 'number' ? tag : tag.id))
        : []

      const mergedTags = Array.from(new Set([...existingTags, ...newTags]))

      if (mergedTags.length > existingTags.length) {
        await this.payload.update({
          collection: 'images',
          id: mediaId,
          data: {
            tags: mergedTags,
          },
        })
      }
    } catch (_error) {
      // Tag update failed, but don't fail the whole operation
      await this.logger.warn(`Failed to update tags for media ${mediaId}`)
    }
  }

  /**
   * Upload new media file to Payload
   * Supports dual-mode: filesystem (local dev) or buffer (Workers)
   */
  private async uploadNewMedia(
    localPath: string,
    options: MediaUploadOptions,
  ): Promise<MediaUploadResult | null> {
    try {
      // Use buffer if provided (Workers mode), otherwise read from filesystem
      const fileBuffer = options.buffer || (await fs.readFile(localPath))
      const filename = path.basename(localPath)
      const ext = path.extname(filename).toLowerCase()

      // Determine MIME type
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
      }
      const mimeType = mimeTypes[ext] || 'application/octet-stream'

      // Create media document
      const media = await this.payload.create({
        collection: 'images',
        data: {
          alt: options.alt || '',
          credit: options.credit || '',
          tags: options.tags || [],
        },
        file: {
          data: fileBuffer,
          mimetype: mimeType,
          name: filename,
          size: fileBuffer.length,
        },
      })

      return {
        id: media.id,
        filename: media.filename || filename,
        wasReused: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Upload failed: ${message}`)
    }
  }

  /**
   * Get upload statistics
   */
  getStats(): { uploaded: number; reused: number } {
    return { ...this.stats }
  }

  /**
   * Clear the internal cache (useful for testing or reset operations)
   */
  clearCache(): void {
    this.mediaCache.clear()
  }
}
