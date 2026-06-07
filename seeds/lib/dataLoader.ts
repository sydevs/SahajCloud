/**
 * Data Loader
 *
 * Loads bundled data files from the filesystem with caching support.
 */

import { promises as fs } from 'fs'
import * as path from 'path'

import { safeBufferFrom } from './runtime'

/**
 * Data source configuration for loading bundled data files
 */
export interface DataSource {
  /** Local filesystem path (required) */
  localPath: string
  /**
   * Pre-supplied raw file contents. When set, bypasses filesystem read.
   * Used by API routes to upload file contents in the request body.
   */
  inlineContent?: string
}

/**
 * Options for fetching assets
 */
export interface AssetOptions {
  /** Local cache path (used in local dev, optional) */
  cachePath?: string
}

// ============================================================================
// DATA FILE LOADING
// ============================================================================

/**
 * Load a data file (JSON, etc.) from the filesystem.
 *
 * @param source - Data source configuration
 * @returns File contents as string
 */
export async function loadDataFile(source: DataSource): Promise<string> {
  if (source.inlineContent !== undefined) {
    return source.inlineContent
  }

  return fs.readFile(source.localPath, 'utf-8')
}

/**
 * Load and parse a JSON data file with dual-mode support.
 *
 * @param source - Data source configuration
 * @returns Parsed JSON data
 */
export async function loadJsonData<T>(source: DataSource): Promise<T> {
  const content = await loadDataFile(source)
  return JSON.parse(content) as T
}

// ============================================================================
// ASSET FETCHING
// ============================================================================

/**
 * Fetch an asset (image, audio, etc.) with optional disk caching.
 *
 * @param url - Asset URL to fetch
 * @param options - Fetch options including optional cache path
 * @returns Buffer containing asset data
 */
export async function fetchAsset(url: string, options?: AssetOptions): Promise<Buffer> {
  // Use cache if available
  if (options?.cachePath) {
    // Check if cached file exists
    const cached = await readCache(options.cachePath)
    if (cached) {
      return cached
    }

    // Download and cache
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

// ============================================================================
// CACHE UTILITIES
// ============================================================================

/**
 * Check if a local cache file exists and has content.
 *
 * @param cachePath - Path to check
 * @returns true if file exists with content, false otherwise
 */
export async function cacheExists(cachePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(cachePath)
    return stats.size > 0
  } catch {
    return false
  }
}

/**
 * Read from local cache file.
 *
 * @param cachePath - Path to read from
 * @returns Buffer if file exists, null otherwise
 */
export async function readCache(cachePath: string): Promise<Buffer | null> {
  try {
    const stats = await fs.stat(cachePath)
    if (stats.size > 0) {
      return fs.readFile(cachePath)
    }
  } catch {
    // File doesn't exist
  }
  return null
}

/**
 * Write to local cache file.
 *
 * @param cachePath - Path to write to
 * @param content - Content to write (Buffer or string)
 */
export async function writeCache(cachePath: string, content: Buffer | string): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, content)
}

/**
 * Read cache as text (UTF-8 string).
 *
 * @param cachePath - Path to read from
 * @returns String content if file exists, null otherwise
 */
export async function readCacheText(cachePath: string): Promise<string | null> {
  const buffer = await readCache(cachePath)
  return buffer ? buffer.toString('utf-8') : null
}
