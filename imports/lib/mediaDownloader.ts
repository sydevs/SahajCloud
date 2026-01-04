/**
 * Media Downloader
 *
 * Downloads media files for import
 *
 * NOTE: Image conversion and processing disabled for Cloudflare Workers compatibility
 * Images are downloaded as-is without WebP conversion or dimension extraction
 */

import type { Logger } from './logger'
import type { Payload, TypedLocale } from 'payload'

import * as crypto from 'crypto'
import { promises as fs } from 'fs'
import * as path from 'path'

import { isCloudflareWorker } from './runtime'
// import * as sharp from 'sharp' // DISABLED: Removed for Cloudflare Workers compatibility

// ============================================================================
// CONSTANTS
// ============================================================================

/** Cloudflare Images file size limit (10 MB) */
const FILE_SIZE_LIMIT = 10 * 1024 * 1024

/**
 * CarrierWave size variants in descending order (largest to smallest).
 * Used for fallback when original image exceeds size limit.
 */
const CARRIERWAVE_SIZES = ['huge', 'large', 'medium', 'small', 'tiny'] as const

// ============================================================================
// URL TRANSFORMATION
// ============================================================================

/**
 * Transform CarrierWave preview URL to original quality URL.
 * Strips size prefixes (small_, medium_, large_, huge_, tiny_) from filename.
 *
 * Legacy WeMeditate Rails used CarrierWave which generates size variants:
 * - small_ (360px), medium_ (720px), large_ (1440px), huge_ (2880px), tiny_ (180px)
 * - Original images have no prefix
 *
 * @example
 * getOriginalImageUrl('https://.../media_file/file/205/small_background.jpg')
 * // Returns: 'https://.../media_file/file/205/background.jpg'
 */
export function getOriginalImageUrl(url: string): string {
  // Match CarrierWave size prefixes at start of filename
  // Pattern: /path/small_filename.jpg -> /path/filename.jpg
  return url.replace(/\/(small|medium|large|huge|tiny)_([^/]+)$/, '/$2')
}

/**
 * Add CarrierWave size prefix to a URL.
 * Used for fallback to smaller variants when original is too large.
 *
 * @example
 * getVariantUrl('https://.../media_file/file/205/background.jpg', 'huge')
 * // Returns: 'https://.../media_file/file/205/huge_background.jpg'
 */
function getVariantUrl(url: string, size: (typeof CARRIERWAVE_SIZES)[number]): string {
  return url.replace(/\/([^/]+)$/, `/${size}_$1`)
}

// ============================================================================
// TYPES
// ============================================================================

export interface MediaMetadata {
  alt?: string
  credit?: string
  caption?: string
}

export interface DownloadResult {
  localPath: string
  hash: string
  width: number
  height: number
  /** Buffer for Workers mode (no filesystem) */
  buffer?: Buffer
  /** Original filename after URL transformation (e.g., without CarrierWave size prefix) */
  originalFilename: string
}

// ============================================================================
// MEDIA DOWNLOADER
// ============================================================================

export class MediaDownloader {
  private cacheDir: string
  private logger: Logger
  private downloadedFiles: Map<string, DownloadResult> = new Map()

  constructor(cacheDir: string, logger: Logger) {
    this.cacheDir = path.join(cacheDir, 'assets', 'images')
    this.logger = logger
  }

  /**
   * Initialize cache directory
   * Skips filesystem operations in Cloudflare Workers mode (no filesystem access)
   */
  async initialize(): Promise<void> {
    // Skip filesystem operations in Workers mode (no filesystem access)
    if (isCloudflareWorker()) {
      return
    }
    await fs.mkdir(this.cacheDir, { recursive: true })
  }

  /**
   * Extract the filename that would be used for caching from a URL.
   * Does NOT download the file - just normalizes URL and extracts filename.
   *
   * This allows checking if media exists BEFORE downloading,
   * avoiding unnecessary HTTP requests for media that already exists.
   *
   * @param url - The media URL to extract filename from
   * @returns The normalized filename (e.g., "background.jpg")
   */
  getFilenameFromUrl(url: string): string {
    // Normalize URL: Fix legacy domains and Google Storage URLs, then get original quality
    let normalizedUrl = url
      .replace('assets.wemeditate.co/', 'assets.wemeditate.com/')
      .replace('https://storage.googleapis.com/wemeditate/', 'https://assets.wemeditate.com/')
    normalizedUrl = getOriginalImageUrl(normalizedUrl)
    const urlPath = new URL(normalizedUrl).pathname
    return path.basename(urlPath)
  }

  /**
   * Download image with dual-mode support:
   * - Local development: Cache to disk
   * - Cloudflare Workers: Keep in memory (no filesystem)
   */
  async downloadAndConvertImage(url: string): Promise<DownloadResult> {
    // Normalize URL: Fix legacy domains and Google Storage URLs, then get original quality
    let normalizedUrl = url
      .replace('assets.wemeditate.co/', 'assets.wemeditate.com/')
      .replace('https://storage.googleapis.com/wemeditate/', 'https://assets.wemeditate.com/')
    normalizedUrl = getOriginalImageUrl(normalizedUrl)

    // Check cache (using normalized URL)
    if (this.downloadedFiles.has(normalizedUrl)) {
      return this.downloadedFiles.get(normalizedUrl)!
    }

    try {
      // Generate hash for filename (using normalized URL)
      const hash = crypto.createHash('md5').update(normalizedUrl).digest('hex')

      // Detect file extension from URL
      const urlPath = new URL(normalizedUrl).pathname
      const ext = path.extname(urlPath) || '.jpg'
      const filename = `${hash}${ext}`
      const localPath = path.join(this.cacheDir, filename)

      // Extract original filename from normalized URL (after CarrierWave prefix stripped)
      const originalFilename = path.basename(urlPath)

      // Workers mode: stream directly without filesystem
      if (isCloudflareWorker()) {
        await this.logger.log(`Downloading image (streaming): ${normalizedUrl}`)

        // Download with automatic fallback for oversized files
        const { buffer, usedVariant } = await this.downloadWithFallback(normalizedUrl)

        const result: DownloadResult = {
          localPath: filename, // Virtual path for reference
          hash,
          width: 0,
          height: 0,
          buffer, // Keep in memory for Workers
          originalFilename,
        }

        this.downloadedFiles.set(normalizedUrl, result)
        const variantInfo = usedVariant ? ` (using ${usedVariant}_ variant)` : ''
        await this.logger.log(`✓ Downloaded (streaming): ${filename}${variantInfo}`)
        return result
      }

      // Local dev mode: use filesystem cache
      // Check if file already exists
      try {
        await fs.access(localPath)
        await this.logger.log(`Using cached image: ${filename}`)

        const result: DownloadResult = {
          localPath,
          hash,
          width: 0, // Dimension extraction disabled
          height: 0, // Dimension extraction disabled
          originalFilename,
        }

        this.downloadedFiles.set(normalizedUrl, result)
        return result
      } catch {
        // File doesn't exist, download it
      }

      // Download image with automatic fallback for oversized files
      await this.logger.log(`Downloading image: ${normalizedUrl}`)
      const { buffer, usedVariant } = await this.downloadWithFallback(normalizedUrl)

      // Save file as-is (no WebP conversion)
      await fs.writeFile(localPath, buffer)
      const variantInfo = usedVariant ? ` (using ${usedVariant}_ variant)` : ''

      const result: DownloadResult = {
        localPath,
        hash,
        width: 0, // Dimension extraction disabled
        height: 0, // Dimension extraction disabled
        originalFilename,
      }

      this.downloadedFiles.set(normalizedUrl, result)
      await this.logger.log(`✓ Downloaded: ${filename}${variantInfo}`)

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to download image from ${normalizedUrl}: ${message}`)
    }
  }

  /**
   * Create Media document in Payload
   */
  async createMediaDocument(
    payload: Payload,
    downloadResult: DownloadResult,
    metadata: MediaMetadata,
    locale: string = 'all'
  ): Promise<string> {
    try {
      // Read file
      const fileBuffer = await fs.readFile(downloadResult.localPath)
      const filename = path.basename(downloadResult.localPath)

      // Detect mimetype from file extension
      const ext = path.extname(filename).toLowerCase()
      const mimetypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
      }
      const mimetype = mimetypes[ext] || 'image/jpeg'

      // Create media document
      const media = await payload.create({
        collection: 'images',
        data: {
          alt: metadata.alt || '',
          credit: metadata.credit || '',
        },
        file: {
          data: fileBuffer,
          mimetype,
          name: filename,
          size: fileBuffer.length,
        },
        locale: locale as TypedLocale,
      })

      await this.logger.log(`✓ Created Media document: ${media.id}`)
      return String(media.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to create Media document: ${message}`)
    }
  }

  /**
   * Get download statistics
   */
  getStats(): { downloaded: number } {
    return {
      downloaded: this.downloadedFiles.size,
    }
  }

  /**
   * Download a buffer from URL with timeout
   * @private
   */
  private async downloadBuffer(url: string): Promise<Buffer> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      return Buffer.from(await response.arrayBuffer())
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Try to download a smaller CarrierWave variant if original is too large
   * @private
   */
  private async downloadWithFallback(originalUrl: string): Promise<{ buffer: Buffer; usedVariant?: string }> {
    // Try original first
    const buffer = await this.downloadBuffer(originalUrl)

    // Check if within size limit
    if (buffer.length <= FILE_SIZE_LIMIT) {
      return { buffer }
    }

    // Original too large - try fallback sizes
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2)
    await this.logger.log(`Original image too large (${sizeMB} MB), trying fallback sizes...`)

    for (const size of CARRIERWAVE_SIZES) {
      const variantUrl = getVariantUrl(originalUrl, size)
      try {
        const variantBuffer = await this.downloadBuffer(variantUrl)
        if (variantBuffer.length <= FILE_SIZE_LIMIT) {
          const variantSizeMB = (variantBuffer.length / 1024 / 1024).toFixed(2)
          await this.logger.log(`Using ${size}_ variant (${variantSizeMB} MB)`)
          return { buffer: variantBuffer, usedVariant: size }
        }
      } catch {
        // Variant doesn't exist or failed, try next
        continue
      }
    }

    // No suitable variant found
    throw new Error(
      `No suitable size variant found under ${FILE_SIZE_LIMIT / 1024 / 1024} MB limit (original: ${sizeMB} MB)`,
    )
  }
}

// ============================================================================
// MEDIA URL EXTRACTOR
// ============================================================================

/**
 * Extract all media URLs from EditorJS content
 */
export function extractMediaUrls(content: any, baseUrl: string): Set<string> {
  const urls = new Set<string>()

  if (!content || !content.blocks) {
    return urls
  }

  for (const block of content.blocks) {
    if (!block.data) continue

    // TextBox blocks
    if (block.type === 'textbox') {
      // Check for image.preview (modern format with full URL)
      if (block.data.image?.preview) {
        urls.add(block.data.image.preview)
      }
      // Also check mediaFiles array for legacy formats
      if (block.data.mediaFiles) {
        for (const mediaFile of block.data.mediaFiles) {
          if (typeof mediaFile === 'string') {
            urls.add(mediaFile)
          } else if (mediaFile.file) {
            const url = buildMediaUrl(mediaFile.file, baseUrl)
            if (url) urls.add(url)
          }
        }
      }
    }

    // Layout blocks
    if (block.type === 'layout' && block.data.items) {
      for (const item of block.data.items) {
        if (item.image?.preview) {
          urls.add(item.image.preview)
        }
      }
    }

    // Media blocks
    if (block.type === 'media' && block.data.items) {
      for (const item of block.data.items) {
        if (item.image?.preview) {
          urls.add(item.image.preview)
        }
      }
    }
  }

  return urls
}

/**
 * Build full media URL from file object
 */
function buildMediaUrl(file: any, baseUrl: string): string | null {
  if (!file || !file.url) return null

  // If URL is already absolute, return it
  if (file.url.startsWith('http://') || file.url.startsWith('https://')) {
    return file.url
  }

  // Otherwise, prepend base URL
  return baseUrl + file.url
}

/**
 * Extract media URLs from author image
 */
export function extractAuthorImageUrl(imageData: any, baseUrl: string): string | null {
  if (!imageData) return null

  // Check if it's a JSONB object with file data
  if (imageData.file) {
    return buildMediaUrl(imageData.file, baseUrl)
  }

  // Check if it's a direct URL
  if (typeof imageData === 'string' && imageData.startsWith('http')) {
    return imageData
  }

  return null
}
