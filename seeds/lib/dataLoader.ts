import { promises as fs } from 'fs'
import * as path from 'path'

import { safeBufferFrom } from './runtime'

export interface DataSource {
  localPath: string
  /**
   * Pre-supplied raw file contents. When set, bypasses filesystem read.
   * Used by API routes to upload file contents in the request body.
   */
  inlineContent?: string
}

export interface AssetOptions {
  /** Local cache path (used in local dev, optional) */
  cachePath?: string
}

// --- Data file loading ---

export async function loadDataFile(source: DataSource): Promise<string> {
  if (source.inlineContent !== undefined) {
    return source.inlineContent
  }

  return fs.readFile(source.localPath, 'utf-8')
}

export async function loadJsonData<T>(source: DataSource): Promise<T> {
  const content = await loadDataFile(source)
  return JSON.parse(content) as T
}

// --- Asset fetching ---

export async function fetchAsset(url: string, options?: AssetOptions): Promise<Buffer> {
  if (options?.cachePath) {
    const cached = await readCache(options.cachePath)
    if (cached) {
      return cached
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`)
    }
    const buffer = safeBufferFrom(await response.arrayBuffer())
    await writeCache(options.cachePath, buffer)
    return buffer
  }

  // No cache path: stream directly
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return safeBufferFrom(await response.arrayBuffer())
}

// --- Cache utilities ---

export async function cacheExists(cachePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(cachePath)
    return stats.size > 0
  } catch {
    return false
  }
}

export async function readCache(cachePath: string): Promise<Buffer | null> {
  try {
    const stats = await fs.stat(cachePath)
    if (stats.size > 0) {
      return fs.readFile(cachePath)
    }
  } catch {
    // File does not exist
  }
  return null
}

export async function writeCache(cachePath: string, content: Buffer | string): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, content)
}

/** Decoded as UTF-8. */
export async function readCacheText(cachePath: string): Promise<string | null> {
  const buffer = await readCache(cachePath)
  return buffer ? buffer.toString('utf-8') : null
}
