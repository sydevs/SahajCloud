/** Use between API calls, to avoid throttling. */
export async function rateLimitDelay(ms: number): Promise<void> {
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Base delay in milliseconds for exponential backoff (default: 200) */
  baseDelay?: number
  /** Predicate to determine if error is retryable (default: all errors) */
  shouldRetry?: (error: unknown) => boolean
}

/**
 * Delays between retries auto-skip in local development.
 *
 * @throws The last error, once the retries are exhausted.
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

/** Use as the `shouldRetry` predicate for a database operation. */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    // PostgreSQL database locking and connection errors
    msg.includes('database is locked') ||
    msg.includes('failed query') ||
    msg.includes('connection refused') ||
    // Network/connection errors
    msg.includes('fetch failed') ||
    msg.includes('other side closed') ||
    msg.includes('socket closed') ||
    msg.includes('network connection lost')
  )
}
