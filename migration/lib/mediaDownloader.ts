/**
 * Media Downloader
 *
 * Downloads and converts media files for import
 */

import type { Payload } from 'payload'
import type { Logger } from './logger'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as sharp from 'sharp'

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
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true })
  }

  /**
   * Download and convert image to WebP format
   */
  async downloadAndConvertImage(url: string): Promise<DownloadResult> {
    // Normalize URL: Fix legacy .co domain to .com
    const normalizedUrl = url.replace('assets.wemeditate.co/', 'assets.wemeditate.com/')

    // Check cache (using normalized URL)
    if (this.downloadedFiles.has(normalizedUrl)) {
      return this.downloadedFiles.get(normalizedUrl)!
    }

    try {
      // Generate hash for filename (using normalized URL)
      const hash = crypto.createHash('md5').update(normalizedUrl).digest('hex')
      const filename = `${hash}.webp`
      const localPath = path.join(this.cacheDir, filename)

      // Check if file already exists
      try {
        await fs.access(localPath)
        await this.logger.log(`Using cached image: ${filename}`)

        // Get dimensions
        const sharpInstance = sharp.default ? sharp.default(localPath) : (sharp as any)(localPath)
        const metadata = await sharpInstance.metadata()

        const result: DownloadResult = {
          localPath,
          hash,
          width: metadata.width || 0,
          height: metadata.height || 0,
        }

        this.downloadedFiles.set(normalizedUrl, result)
        return result
      } catch {
        // File doesn't exist, download it
      }

      // Download image
      await this.logger.log(`Downloading image: ${normalizedUrl}`)
      const response = await fetch(normalizedUrl)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Convert to WebP
      await this.logger.log(`Converting to WebP: ${filename}`)
      const sharpInstance = sharp.default ? sharp.default(buffer) : (sharp as any)(buffer)
      const metadata = await sharpInstance.metadata()

      await sharpInstance.webp({ quality: 90 }).toFile(localPath)

      const result: DownloadResult = {
        localPath,
        hash,
        width: metadata.width || 0,
        height: metadata.height || 0,
      }

      this.downloadedFiles.set(normalizedUrl, result)
      await this.logger.log(`✓ Downloaded and converted: ${filename}`)

      return result
    } catch (error: any) {
      throw new Error(`Failed to download image from ${normalizedUrl}: ${error.message}`)
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

      // Create media document
      const media = await payload.create({
        collection: 'media',
        data: {
          alt: metadata.alt || '',
          credit: metadata.credit || '',
        },
        file: {
          data: fileBuffer,
          mimetype: 'image/webp',
          name: filename,
          size: fileBuffer.length,
        },
        locale: locale as any,
      })

      await this.logger.log(`✓ Created Media document: ${media.id}`)
      return media.id as string
    } catch (error: any) {
      throw new Error(`Failed to create Media document: ${error.message}`)
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
    if (block.type === 'textbox' && block.data.mediaFiles) {
      for (const mediaFile of block.data.mediaFiles) {
        if (typeof mediaFile === 'string') {
          urls.add(mediaFile)
        } else if (mediaFile.file) {
          const url = buildMediaUrl(mediaFile.file, baseUrl)
          if (url) urls.add(url)
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
