/**
 * Media Uploader with Deduplication
 *
 * Handles uploading media files to Payload CMS with intelligent deduplication
 * to prevent duplicate media uploads across multiple import runs.
 */

import type { Payload } from 'payload'
import type { Logger } from './logger'
import { promises as fs } from 'fs'
import * as path from 'path'

// ============================================================================
// TYPES
// ============================================================================

export interface MediaUploadOptions {
  alt?: string
  credit?: string
  tags?: string[]
  locale?: string | undefined
}

export interface MediaUploadResult {
  id: string
  filename: string
  wasReused: boolean
}

// ============================================================================
// MEDIA UPLOADER
// ============================================================================

export class MediaUploader {
  private payload: Payload
  private logger: Logger
  private mediaCache: Map<string, string> = new Map() // filename -> mediaId
  private stats = {
    uploaded: 0,
    reused: 0,
  }

  constructor(payload: Payload, logger: Logger) {
    this.payload = payload
    this.logger = logger
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
            collection: 'media',
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
    } catch (error: any) {
      await this.logger.error(`Failed to upload ${path.basename(localPath)}: ${error.message}`)
      return null
    }
  }

  /**
   * Find existing media in database by filename pattern
   * Handles Payload's automatic filename suffixes
   */
  private async findExistingMedia(filename: string): Promise<string | null> {
    try {
      const baseNameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename
      const extension = filename.substring(filename.lastIndexOf('.'))

      const existingMedia = await this.payload.find({
        collection: 'media',
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
          return String(doc.id)
        }
      }

      return null
    } catch (error) {
      // No existing media found
      return null
    }
  }

  /**
   * Validate that existing media still exists and is accessible
   */
  private async validateExistingMedia(mediaId: string): Promise<boolean> {
    try {
      const media = await this.payload.findByID({
        collection: 'media',
        id: mediaId,
      })
      return !!media && !!media.filename
    } catch (error) {
      return false
    }
  }

  /**
   * Update tags on existing media
   */
  private async updateMediaTags(mediaId: string, newTags: string[]): Promise<void> {
    try {
      const media = await this.payload.findByID({
        collection: 'media',
        id: mediaId,
      })

      // Merge existing tags with new tags
      const existingTags = Array.isArray(media.tags)
        ? media.tags.map((tag: any) => (typeof tag === 'string' ? tag : tag.id))
        : []

      const mergedTags = Array.from(new Set([...existingTags, ...newTags]))

      if (mergedTags.length > existingTags.length) {
        await this.payload.update({
          collection: 'media',
          id: mediaId,
          data: {
            tags: mergedTags,
          },
        })
      }
    } catch (error) {
      // Tag update failed, but don't fail the whole operation
      await this.logger.warn(`Failed to update tags for media ${mediaId}`)
    }
  }

  /**
   * Upload new media file to Payload
   */
  private async uploadNewMedia(
    localPath: string,
    options: MediaUploadOptions,
  ): Promise<MediaUploadResult | null> {
    try {
      const fileBuffer = await fs.readFile(localPath)
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
        collection: 'media',
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
        id: String(media.id),
        filename: media.filename || filename,
        wasReused: false,
      }
    } catch (error: any) {
      throw new Error(`Upload failed: ${error.message}`)
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
