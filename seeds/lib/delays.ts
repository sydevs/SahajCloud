/**
 * Delay Utilities
 *
 * Centralized delay handling for rate limiting and retries.
 * Automatically adjusts delays based on environment:
 * - Cloudflare Workers: Full delays for API rate limiting
 * - Local development: Delays skipped entirely for faster iteration
 */

import { isCloudflareWorker } from './runtime'

/**
 * Rate limit delay - use between API calls to avoid throttling.
 * Auto-skips in local development for faster iteration.
 *
 * @param ms - Delay in milliseconds (only applied in Workers mode)
 */
export async function rateLimitDelay(ms: number): Promise<void> {
  if (!isCloudflareWorker()) return // Skip entirely in local dev
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/**
 * Options for retry with exponential backoff
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Base delay in milliseconds for exponential backoff (default: 200) */
  baseDelay?: number
  /** Predicate to determine if error is retryable (default: all errors) */
  shouldRetry?: (error: unknown) => boolean
}

/**
 * Execute an operation with exponential backoff retry.
 * Delays between retries auto-skip in local development.
 *
 * @param operation - Async operation to retry
 * @param options - Retry configuration
 * @returns Result of the operation
 * @throws Last error if all retries exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3
  const baseDelay = options?.baseDelay ?? 200
  const shouldRetry = options?.shouldRetry ?? (() => true)

  let lastError: unknown

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      // Don't retry if this is the last attempt or error is not retryable
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error
      }

      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100
      await rateLimitDelay(delay)
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError
}

/**
 * Check if an error is a retryable database or network error.
 * Use as the `shouldRetry` predicate for database operations.
 *
 * @param error - Error to check
 * @returns true if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    // SQLite/D1 database locking errors
    msg.includes('sqlite_busy') ||
    msg.includes('database is locked') ||
    msg.includes('d1_error') ||
    msg.includes('failed query') ||
    // Network/connection errors from miniflare proxy (undici fetch)
    msg.includes('fetch failed') ||
    msg.includes('other side closed') ||
    msg.includes('socket closed') ||
    msg.includes('network connection lost') ||
    msg.includes('und_err_socket')
  )
}
