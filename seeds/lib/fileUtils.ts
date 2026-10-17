import type { Logger } from './logger'

import { promises as fs } from 'fs'
import * as path from 'path'

import { safeBufferFrom } from './runtime'

export interface DownloadOptions {
  maxRetries?: number
  retryDelay?: number
}

export class FileUtils {
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  /** Check if a file exists and has content */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath)
      return stats.size > 0
    } catch {
      return false
    }
  }

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
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

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
    await fs.writeFile(destPath, safeBufferFrom(buffer))
  }

  async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
  }

  async clearDir(dirPath: string): Promise<void> {
    await fs.rm(dirPath, { recursive: true, force: true })
    await fs.mkdir(dirPath, { recursive: true })
  }

  async safeOperation<T>(operation: () => Promise<T>, errorContext: string): Promise<T | null> {
    try {
      return await operation()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger.error(`${errorContext}: ${message}`)
      return null
    }
  }

  /** Caches to disk, for faster iteration. */
  async downloadFile(url: string, cachePath?: string): Promise<Buffer> {
    if (cachePath) {
      if (await this.fileExists(cachePath)) {
        await this.logger.info(`  Using cached: ${path.basename(cachePath)}`)
        return fs.readFile(cachePath)
      }

      await fs.mkdir(path.dirname(cachePath), { recursive: true })
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status}`)
      }
      const buffer = safeBufferFrom(await response.arrayBuffer())
      await fs.writeFile(cachePath, buffer)
      return buffer
    }

    // No cache path: stream directly
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.status}`)
    }
    return safeBufferFrom(await response.arrayBuffer())
  }

  async downloadAsFileData(
    url: string,
    filename: string,
    cachePath?: string,
  ): Promise<{ data: Buffer; name: string; size: number; mimetype: string }> {
    const buffer = await this.downloadFile(url, cachePath)
    return {
      data: buffer,
      name: filename,
      size: buffer.length,
      mimetype: this.getMimeType(filename),
    }
  }
}
