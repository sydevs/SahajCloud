/**
 * Image conversion and processing are off: sharp needs a native binary the
 * Cloudflare Workers runtime could not run, so images download as-is, with no
 * WebP conversion and no dimension extraction. Node, this script's runtime
 * now, can run sharp, so this could be re-enabled.
 */

import type { Logger } from './logger'
import type { Payload, TypedLocale } from 'payload'

import * as crypto from 'crypto'
import { promises as fs } from 'fs'
import * as path from 'path'

import { safeBufferFrom } from './runtime'

// --- Constants ---

/** Cloudflare Images file size limit (10 MB) */
const FILE_SIZE_LIMIT = 10 * 1024 * 1024

/**
 * CarrierWave size variants in descending order (largest to smallest).
 * Used for fallback when original image exceeds size limit.
 */
const CARRIERWAVE_SIZES = ['huge', 'large', 'medium', 'small', 'tiny'] as const

// --- Url transformation ---

/**
 * Strip a CarrierWave size prefix, to get the original.
 *
 * Legacy WeMeditate Rails used CarrierWave, which generates size variants:
 * - small_ (360px), medium_ (720px), large_ (1440px), huge_ (2880px), tiny_ (180px)
 * - Original images have no prefix
 *
 * @example
 * getOriginalImageUrl('https://.../media_file/file/205/small_background.jpg')
 * // Returns: 'https://.../media_file/file/205/background.jpg'
 */
export function getOriginalImageUrl(url: string): string {
  return url.replace(/\/(small|medium|large|huge|tiny)_([^/]+)$/, '/$2')
}

/**
 * Falls back to a smaller variant when the original is too large.
 *
 * @example
 * getVariantUrl('https://.../media_file/file/205/background.jpg', 'huge')
 * // Returns: 'https://.../media_file/file/205/huge_background.jpg'
 */
function getVariantUrl(url: string, size: (typeof CARRIERWAVE_SIZES)[number]): string {
  return url.replace(/\/([^/]+)$/, `/${size}_$1`)
}

// --- Types ---

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
  /** Original filename after URL transformation (for example, without CarrierWave size prefix) */
  originalFilename: string
}

// --- Media downloader ---

export class MediaDownloader {
  private cacheDir: string
  private logger: Logger
  private downloadedFiles: Map<string, DownloadResult> = new Map()

  constructor(cacheDir: string, logger: Logger) {
    this.cacheDir = path.join(cacheDir, 'assets', 'images')
    this.logger = logger
  }

  /** Initialize cache directory */
  async initialize(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true })
  }

  /**
   * The cache filename for a URL, without downloading it.
   *
   * Lets a caller check for existing media before spending an HTTP request.
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

  /** Download image with disk caching */
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

      const urlPath = new URL(normalizedUrl).pathname
      const ext = path.extname(urlPath) || '.jpg'
      const filename = `${hash}${ext}`
      const localPath = path.join(this.cacheDir, filename)

      // Extract original filename from normalized URL (after CarrierWave prefix stripped)
      const originalFilename = path.basename(urlPath)

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
        // File does not exist, download it
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

  async createMediaDocument(
    payload: Payload,
    downloadResult: DownloadResult,
    metadata: MediaMetadata,
    locale: string = 'all',
  ): Promise<string> {
    try {
      const fileBuffer = await fs.readFile(downloadResult.localPath)
      const filename = path.basename(downloadResult.localPath)

      const ext = path.extname(filename).toLowerCase()
      const mimetypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
      }
      const mimetype = mimetypes[ext] || 'image/jpeg'

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

  getStats(): { downloaded: number } {
    return {
      downloaded: this.downloadedFiles.size,
    }
  }

  private async downloadBuffer(url: string): Promise<Buffer> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      return safeBufferFrom(arrayBuffer)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /** Falls back to a smaller CarrierWave variant when the original is too large. */
  private async downloadWithFallback(
    originalUrl: string,
  ): Promise<{ buffer: Buffer; usedVariant?: string }> {
    // Try original first
    const buffer = await this.downloadBuffer(originalUrl)

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
        // Variant does not exist or failed, try next
        continue
      }
    }

    // No suitable variant found
    throw new Error(
      `No suitable size variant found under ${FILE_SIZE_LIMIT / 1024 / 1024} MB limit (original: ${sizeMB} MB)`,
    )
  }
}

// --- Media url extractor ---

/** Every media URL in EditorJS content. */
export function extractMediaUrls(content: any, baseUrl: string): Set<string> {
  const urls = new Set<string>()

  if (!content || !content.blocks) {
    return urls
  }

  for (const block of content.blocks) {
    if (!block.data) continue

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

    if (block.type === 'layout' && block.data.items) {
      for (const item of block.data.items) {
        if (item.image?.preview) {
          urls.add(item.image.preview)
        }
      }
    }

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

function buildMediaUrl(file: any, baseUrl: string): string | null {
  if (!file || !file.url) return null

  if (file.url.startsWith('http://') || file.url.startsWith('https://')) {
    return file.url
  }

  return baseUrl + file.url
}

export function extractAuthorImageUrl(imageData: any, baseUrl: string): string | null {
  if (!imageData) return null

  // Check if it is a JSONB object with file data
  if (imageData.file) {
    return buildMediaUrl(imageData.file, baseUrl)
  }

  if (typeof imageData === 'string' && imageData.startsWith('http')) {
    return imageData
  }

  return null
}
