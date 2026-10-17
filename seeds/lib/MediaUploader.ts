/** Deduplicates, so a repeated import run does not re-upload the same file. */

import type { Logger } from './logger'
import type { Payload } from 'payload'

import { promises as fs } from 'fs'
import * as path from 'path'

import type { ImageTag } from '@/types/tags'

// --- Errors ---

export class MediaUploadError extends Error {
  constructor(
    message: string,
    public readonly filename: string,
    public readonly sourceUrl?: string,
  ) {
    super(message)
    this.name = 'MediaUploadError'
  }
}

// --- Types ---

export interface MediaUploadOptions {
  alt?: string
  credit?: string
  /** Image tags (inline enum string values) */
  tags?: string[]
  locale?: string | undefined
  /** Buffer for Workers mode (no filesystem) */
  buffer?: Buffer
  /** Source URL for error reporting */
  sourceUrl?: string
  /** Original filename for cache lookup (used when localPath has hash-based filename) */
  originalFilename?: string
}

export interface MediaUploadResult {
  id: number | string
  filename: string
  wasReused: boolean
}

// --- Media uploader ---

export class MediaUploader {
  private payload: Payload
  private logger: Logger
  private mediaCache: Map<string, number | string> = new Map() // filename -> mediaId
  private stats = {
    uploaded: 0,
    reused: 0,
  }

  private isPreloaded = false

  constructor(payload: Payload, logger: Logger) {
    this.payload = payload
    this.logger = logger
  }

  /**
   * Answers before a download, so media that exists costs no HTTP request.
   *
   * Call `preloadExistingMedia()` first, or the cache is empty.
   */
  existsInCache(filename: string): number | string | null {
    if (this.mediaCache.has(filename)) {
      return this.mediaCache.get(filename)!
    }
    // Try base name match (handles Payload suffixes like "-abc123")
    const baseName = this.extractBaseName(filename)
    if (this.mediaCache.has(baseName)) {
      return this.mediaCache.get(baseName)!
    }
    return null
  }

  /**
   * Call before uploading, to avoid an N+1 of database queries.
   *
   * For Cloudflare Images the stored filename is the Image ID, so matching
   * goes through `fileMetadata.originalFilename`.
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
        depth: 0,
        select: {
          filename: true,
          fileMetadata: true, // Fetch for originalFilename (Cloudflare Images)
        },
      })

      for (const doc of result.docs) {
        // Stored before Cloudflare Images replaces the filename with its ID.
        const originalFilename =
          typeof doc.fileMetadata === 'object' &&
          doc.fileMetadata !== null &&
          'originalFilename' in doc.fileMetadata
            ? (doc.fileMetadata as { originalFilename?: string }).originalFilename
            : undefined

        if (originalFilename) {
          const baseName = this.extractBaseName(originalFilename)
          this.mediaCache.set(baseName, doc.id)
          this.mediaCache.set(originalFilename, doc.id)
        }

        // Also cache by current filename for backward compatibility (local dev, old images)
        if (doc.filename) {
          const baseName = this.extractBaseName(doc.filename)
          this.mediaCache.set(baseName, doc.id)
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

  /** Removes Payload's auto-generated suffix, for example "-abc123". */
  private extractBaseName(filename: string): string {
    const ext = filename.substring(filename.lastIndexOf('.'))
    const withoutExt = filename.substring(0, filename.lastIndexOf('.'))
    const baseName = withoutExt.replace(/-[a-z0-9]+$/i, '')
    return baseName + ext
  }

  /**
   * Reuses existing media rather than uploading a duplicate, allowing for
   * Payload's automatic filename suffix (`image-abc123.jpg`).
   */
  async uploadWithDeduplication(
    localPath: string,
    options: MediaUploadOptions = {},
  ): Promise<MediaUploadResult> {
    try {
      const filename = path.basename(localPath)

      let existingMediaId = this.mediaCache.get(filename)

      // Payload's "-abc123" suffix means matching on the base filename.
      if (!existingMediaId) {
        const foundId = await this.findMediaByFilename(filename)
        if (foundId) {
          existingMediaId = foundId
          this.mediaCache.set(filename, foundId)
        }
      }

      if (existingMediaId) {
        const isValid = await this.validateExistingMedia(existingMediaId)
        if (isValid) {
          if (options.tags && options.tags.length > 0) {
            await this.updateMediaTags(existingMediaId, options.tags)
          }

          // Also cache by original filename if provided (for hash-based localPath lookups)
          if (options.originalFilename && options.originalFilename !== filename) {
            this.mediaCache.set(options.originalFilename, existingMediaId)
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
          this.mediaCache.delete(filename)
        }
      }

      const result = await this.uploadNewMedia(localPath, options)
      this.mediaCache.set(filename, result.id)
      // Also cache by original filename if provided (for hash-based localPath lookups)
      if (options.originalFilename && options.originalFilename !== filename) {
        this.mediaCache.set(options.originalFilename, result.id)
      }
      this.stats.uploaded++
      await this.logger.log(`    ✓ Uploaded new media: ${result.filename}`)

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const sourceInfo = options.sourceUrl ? ` from ${options.sourceUrl}` : ''
      await this.logger.error(
        `Failed to upload ${path.basename(localPath)}${sourceInfo}: ${message}`,
      )
      throw new MediaUploadError(message, path.basename(localPath), options.sourceUrl)
    }
  }

  /** Uses the preloaded cache when it is populated, else queries the database. */
  async findMediaByFilename(filename: string): Promise<number | string | null> {
    if (this.isPreloaded) {
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

    // Fallback: query database (used when preload was not called)
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
      return null
    }
  }

  /** Validate that existing media still exists and is accessible */
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

  /** Tags are inline enum string values, not collection IDs. */
  private async updateMediaTags(mediaId: number | string, newTags: string[]): Promise<void> {
    try {
      const media = await this.payload.findByID({
        collection: 'images',
        id: mediaId,
      })

      const existingTags = Array.isArray(media.tags) ? (media.tags as string[]) : []

      const mergedTags = Array.from(new Set([...existingTags, ...newTags]))

      if (mergedTags.length > existingTags.length) {
        await this.payload.update({
          collection: 'images',
          id: mediaId,
          data: {
            // Cast to ImageTag[] - seed scripts use valid enum values
            tags: mergedTags as ImageTag[],
          },
        })
      }
    } catch (_error) {
      // Tag update failed, but do not fail the whole operation
      await this.logger.warn(`Failed to update tags for media ${mediaId}`)
    }
  }

  private async uploadNewMedia(
    localPath: string,
    options: MediaUploadOptions,
  ): Promise<MediaUploadResult> {
    try {
      const fileBuffer: Buffer = options.buffer || (await fs.readFile(localPath))
      const filename = path.basename(localPath)
      const ext = path.extname(filename).toLowerCase()

      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
      }
      const mimeType = mimeTypes[ext] || 'application/octet-stream'

      // Store originalFilename in fileMetadata for lookup after Cloudflare Images
      // replaces the filename with its ID
      const media = await this.payload.create({
        collection: 'images',
        data: {
          alt: options.alt || '',
          credit: options.credit || '',
          // Cast to ImageTag[] - seed scripts use valid enum values
          tags: (options.tags || []) as ImageTag[],
          fileMetadata: {
            originalFilename: filename,
          },
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

  getStats(): { uploaded: number; reused: number } {
    return { ...this.stats }
  }

  /** For tests and reset operations. */
  clearCache(): void {
    this.mediaCache.clear()
  }
}
