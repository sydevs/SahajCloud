import type { Payload } from 'payload'
import type { MediaUploadResult } from '../types'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import chalk from 'chalk'

export class MediaTransfer {
  private tempDir: string
  private downloadedFiles: Map<string, string> = new Map()

  constructor(
    private payload: Payload,
    private mediaBaseUrl: string
  ) {
    this.tempDir = path.join(os.tmpdir(), 'payload-migration-media')
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.tempDir, { recursive: true })
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true })
    } catch (error) {
      console.error('Failed to cleanup temp directory:', error)
    }
  }

  async transferFile(
    sourceUrl: string,
    collection: string,
    metadata?: Record<string, any>
  ): Promise<MediaUploadResult | null> {
    try {
      // Construct full URL if relative
      const fullUrl = sourceUrl.startsWith('http')
        ? sourceUrl
        : `${this.mediaBaseUrl}/${sourceUrl}`.replace(/\/+/g, '/')

      // Check if already downloaded
      let localPath = this.downloadedFiles.get(fullUrl)
      
      if (!localPath) {
        localPath = await this.downloadFile(fullUrl)
        this.downloadedFiles.set(fullUrl, localPath)
      }

      // Upload to Payload
      const result = await this.uploadToPayload(localPath, collection, metadata)
      return result
    } catch (error) {
      console.error(chalk.red(`Failed to transfer ${sourceUrl}:`), error)
      return null
    }
  }

  private async downloadFile(url: string): Promise<string> {
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const buffer = await response.arrayBuffer()
    const filename = this.extractFilename(url)
    const localPath = path.join(this.tempDir, filename)
    
    await fs.writeFile(localPath, Buffer.from(buffer))
    return localPath
  }

  private extractFilename(url: string): string {
    const urlPath = new URL(url).pathname
    const filename = path.basename(urlPath)
    
    // Ensure unique filename
    const timestamp = Date.now()
    const ext = path.extname(filename)
    const name = path.basename(filename, ext)
    
    return `${name}_${timestamp}${ext}`
  }

  private async uploadToPayload(
    filePath: string,
    collection: string,
    metadata?: Record<string, any>
  ): Promise<MediaUploadResult> {
    const fileBuffer = await fs.readFile(filePath)
    const filename = path.basename(filePath)
    const mimeType = this.getMimeType(filename)

    // Create FormData-like structure for Payload
    const fileData = {
      data: fileBuffer,
      mimetype: mimeType,
      name: filename,
      size: fileBuffer.length,
    }

    // Use Payload's local API to create the upload
    const result = await this.payload.create({
      collection: collection as any,
      data: {
        ...metadata,
        _file: fileData,
      },
      filePath,
    })

    return {
      id: result.id as string,
      url: result.url as string,
      filename: result.filename as string,
      mimeType: result.mimeType as string,
      filesize: result.filesize as number,
    }
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase()
    
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.mp3': 'audio/mpeg',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    }

    return mimeTypes[ext] || 'application/octet-stream'
  }

  async transferMultiple(
    files: Array<{ url: string; collection: string; metadata?: Record<string, any> }>,
    concurrency: number = 3
  ): Promise<MediaUploadResult[]> {
    const results: MediaUploadResult[] = []
    const chunks = this.chunkArray(files, concurrency)

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(file => 
          this.transferFile(file.url, file.collection, file.metadata)
        )
      )
      
      results.push(...chunkResults.filter((r): r is MediaUploadResult => r !== null))
    }

    return results
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  getTransferredCount(): number {
    return this.downloadedFiles.size
  }

  getTransferredBytes(): number {
    let totalBytes = 0
    
    for (const localPath of this.downloadedFiles.values()) {
      try {
        const stats = fs.statSync(localPath)
        totalBytes += stats.size
      } catch {
        // File might have been cleaned up
      }
    }
    
    return totalBytes
  }
}