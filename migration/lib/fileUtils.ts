/**
 * File Utilities
 *
 * Common file download, caching, and manipulation utilities
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import type { Logger } from './logger'

export interface DownloadOptions {
  maxRetries?: number
  retryDelay?: number
}

export class FileUtils {
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  /**
   * Check if a file exists and has content
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath)
      return stats.size > 0
    } catch {
      return false
    }
  }

  /**
   * Get MIME type from filename extension
   */
  getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/aac',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

  /**
   * Download file using fetch (alternative method)
   */
  async downloadFileFetch(url: string, destPath: string): Promise<void> {
    if (await this.fileExists(destPath)) {
      return
    }

    await fs.mkdir(path.dirname(destPath), { recursive: true })

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    await fs.writeFile(destPath, Buffer.from(buffer))
  }

  /**
   * Ensure directory exists
   */
  async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
  }

  /**
   * Clear directory contents
   */
  async clearDir(dirPath: string): Promise<void> {
    await fs.rm(dirPath, { recursive: true, force: true })
    await fs.mkdir(dirPath, { recursive: true })
  }

  /**
   * Safe operation wrapper with error handling
   */
  async safeOperation<T>(
    operation: () => Promise<T>,
    errorContext: string,
  ): Promise<T | null> {
    try {
      return await operation()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger.error(`${errorContext}: ${message}`)
      return null
    }
  }
}
