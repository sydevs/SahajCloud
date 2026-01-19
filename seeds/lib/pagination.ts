/**
 * Pagination Types and Utilities
 *
 * Shared types for multi-step seed script execution with pagination.
 * Used to avoid Cloudflare D1 rate limits by splitting work across
 * multiple HTTP requests.
 */

import { isCloudflareWorker } from './runtime'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for paginated import execution
 */
export interface PaginationOptions {
  /** Starting index for pagination */
  offset: number
  /** Maximum items to process in this batch */
  limit: number
  /** Optional collection filter for multi-collection scripts */
  collection?: string
}

/**
 * Current pagination state for reporting
 */
export interface PaginationState {
  /** Number of items processed in this batch */
  processedCount: number
  /** Whether more items remain after this batch */
  hasMore: boolean
  /** Starting index for next batch */
  nextOffset: number
}

/**
 * Metadata for a single collection within a script
 */
export interface CollectionMetadata {
  /** Collection slug */
  slug: string
  /** Estimated total items (hardcoded from expectedCounts) */
  totalItems: number
  /** Whether this collection requires pagination */
  requiresPagination: boolean
  /** Collections that must be imported before this one */
  dependencies: string[]
  /** Field used for upsert natural key lookups */
  naturalKey: string
  /** Whether this collection involves file uploads (reduces batch size) */
  hasFileUploads?: boolean
  /** Override batch size for this collection (takes precedence over hasFileUploads) */
  batchSize?: number
}

/**
 * Metadata for an entire script
 */
export interface ScriptMetadata {
  /** Collections in dependency order */
  collections: CollectionMetadata[]
  /** Total estimated items across all collections */
  totalItems: number
  /** Whether any collection in this script requires pagination */
  requiresPagination: boolean
  /** Current execution environment */
  environment: 'local' | 'workers'
  /** Recommended batch size for this environment */
  recommendedBatchSize: number
}

/**
 * Pagination info included in completion events
 */
export interface PaginationResult {
  /** Starting index of this batch */
  offset: number
  /** Limit used for this batch */
  limit: number
  /** Number of items actually processed */
  processedCount: number
  /** Whether more items remain */
  hasMore: boolean
  /** Starting index for next batch */
  nextOffset: number
  /** Collection that was processed (for multi-collection scripts) */
  collection?: string
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get default batch size based on environment and upload requirements
 *
 * @param hasFileUploads - Whether collection involves file uploads
 * @returns Recommended batch size
 */
export function getDefaultBatchSize(hasFileUploads: boolean = false): number {
  if (hasFileUploads) return 10

  return isCloudflareWorker() ? 25 : 100
}

/**
 * Get current execution environment
 */
export function getEnvironment(): 'local' | 'workers' {
  return isCloudflareWorker() ? 'workers' : 'local'
}

/**
 * Calculate pagination state from items array
 *
 * @param totalItems - Total items in the array
 * @param offset - Current offset
 * @param limit - Current limit
 * @param processedCount - Number actually processed
 * @returns Pagination state
 */
export function calculatePaginationState(
  totalItems: number,
  offset: number,
  limit: number,
  processedCount: number,
): PaginationState {
  return {
    processedCount,
    hasMore: offset + limit < totalItems,
    nextOffset: offset + limit,
  }
}

/**
 * Create initial pagination state (no items processed yet)
 */
export function createInitialPaginationState(): PaginationState {
  return {
    processedCount: 0,
    hasMore: false,
    nextOffset: 0,
  }
}
