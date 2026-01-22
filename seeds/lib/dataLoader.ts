/**
 * Data Loader
 *
 * Centralized data loading with dual-mode support:
 * - Local development: Read from filesystem with caching
 * - Cloudflare Workers: Fetch from URL (no filesystem access)
 *
 * This module abstracts away isCloudflareWorker() checks from import scripts.
 */

import { promises as fs } from 'fs'
import * as path from 'path'

import { isCloudflareWorker, safeBufferFrom } from './runtime'

/**
 * Data source configuration for loading bundled data files
 */
export interface DataSource {
  /** Local filesystem path (used in local dev) */
  localPath: string
  /** Remote URL for Workers mode (e.g., GitHub raw URL) */
  workerUrl: string
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
 * Load a data file (JSON, etc.) with dual-mode support.
 * - Local dev: Read from filesystem
 * - Workers: Fetch from remote URL
 *
 * @param source - Data source configuration
 * @returns File contents as string
 */
export async function loadDataFile(source: DataSource): Promise<string> {
  if (isCloudflareWorker()) {
    const response = await fetch(source.workerUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source.workerUrl}: ${response.status}`)
    }
    return response.text()
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
 * Fetch an asset (image, audio, etc.) with dual-mode support.
 * - Workers: Always streams directly (no caching)
 * - Local dev: Uses disk cache if cachePath provided
 *
 * @param url - Asset URL to fetch
 * @param options - Fetch options including optional cache path
 * @returns Buffer containing asset data
 */
export async function fetchAsset(url: string, options?: AssetOptions): Promise<Buffer> {
  // Workers mode: always stream directly
  if (isCloudflareWorker()) {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`)
    }
    return safeBufferFrom(await response.arrayBuffer())
  }

  // Local dev: use cache if available
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
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeCache(options.cachePath, buffer)
    return buffer
  }

  // No cache path: stream directly
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

// ============================================================================
// CACHE UTILITIES
// ============================================================================

/**
 * Check if a local cache file exists and has content.
 * Always returns false in Workers mode (no filesystem access).
 *
 * @param cachePath - Path to check
 * @returns true if file exists with content, false otherwise
 */
export async function cacheExists(cachePath: string): Promise<boolean> {
  if (isCloudflareWorker()) return false
  try {
    const stats = await fs.stat(cachePath)
    return stats.size > 0
  } catch {
    return false
  }
}

/**
 * Read from local cache file.
 * Returns null in Workers mode (no filesystem access).
 *
 * @param cachePath - Path to read from
 * @returns Buffer if file exists, null otherwise
 */
export async function readCache(cachePath: string): Promise<Buffer | null> {
  if (isCloudflareWorker()) return null
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
 * No-op in Workers mode (no filesystem access).
 *
 * @param cachePath - Path to write to
 * @param content - Content to write (Buffer or string)
 */
export async function writeCache(cachePath: string, content: Buffer | string): Promise<void> {
  if (isCloudflareWorker()) return
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, content)
}

/**
 * Read cache as text (UTF-8 string).
 * Returns null in Workers mode.
 *
 * @param cachePath - Path to read from
 * @returns String content if file exists, null otherwise
 */
export async function readCacheText(cachePath: string): Promise<string | null> {
  const buffer = await readCache(cachePath)
  return buffer ? buffer.toString('utf-8') : null
}
