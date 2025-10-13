/**
 * File Utilities
 *
 * Common file download, caching, and manipulation utilities
 */

import { promises as fs } from 'fs'
import { createWriteStream } from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
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
   * Download file with retry logic
   */
  async downloadFile(
    url: string,
    destPath: string,
    options: DownloadOptions = {},
  ): Promise<void> {
    const { maxRetries = 3, retryDelay = 1000 } = options

    // Check if file already exists and has content
    if (await this.fileExists(destPath)) {
      return // File already cached
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(destPath), { recursive: true })

    return new Promise((resolve, reject) => {
      let attempts = 0

      const attemptDownload = async () => {
        attempts++
        try {
          const protocol = url.startsWith('https') ? https : http
          const file = createWriteStream(destPath)

          protocol
            .get(url, (response) => {
              if (response.statusCode === 200) {
                response.pipe(file)
                file.on('finish', () => {
                  file.close()
                  resolve()
                })
              } else {
                file.close()
                fs.unlink(destPath).catch(() => {})
                throw new Error(`HTTP ${response.statusCode}`)
              }
            })
            .on('error', (err) => {
              file.close()
              fs.unlink(destPath).catch(() => {})
              throw err
            })
        } catch (err) {
          if (attempts < maxRetries) {
            await this.logger.warn(
              `Download attempt ${attempts} failed, retrying... (${url})`,
            )
            setTimeout(attemptDownload, retryDelay * Math.pow(2, attempts - 1))
          } else {
            reject(new Error(`Failed to download after ${maxRetries} attempts: ${err}`))
          }
        }
      }

      attemptDownload()
    })
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
