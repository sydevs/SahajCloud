/**
 * Rate Limiting Module
 *
 * Implements per-user API rate limiting using Cloudflare Workers Rate Limiting Binding.
 * This prevents the "noisy neighbor" problem where one abusive user can exhaust
 * rate limits for all other users sharing the same API key.
 *
 * Rate Limit: 500 requests per 60 seconds per unique (Client + IP + User ID) key
 *
 * @see https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */

import type { RateLimit } from '@cloudflare/workers-types'
import type { CollectionBeforeOperationHook, PayloadRequest } from 'payload'

import { getCloudflareContext } from '@opennextjs/cloudflare'
import * as Sentry from '@sentry/cloudflare'

import { serverEnv } from '@/lib/env'

/**
 * Builds a composite key for rate limiting.
 *
 * The key uniquely identifies a user based on:
 * - Client ID (API key owner)
 * - IP address (from CF-Connecting-IP header)
 * - User ID (self-reported via X-User-ID header)
 *
 * @param clientId - The authenticated API client's ID
 * @param ip - Client IP address (null if not available)
 * @param userId - Self-reported user ID from X-User-ID header (null if not provided)
 * @returns Composite rate limit key
 */
export function buildRateLimitKey(
  clientId: string | number,
  ip: string | null,
  userId: string | null,
): string {
  return `user:${clientId}:${ip || 'no-ip'}:${userId || 'no-user-id'}`
}

/**
 * Validates the X-User-ID header format.
 *
 * Valid format: 8-64 alphanumeric characters (including dash and underscore)
 * This balances security (minimum length) with flexibility (common ID formats).
 *
 * @param userId - The raw X-User-ID header value
 * @returns Validated user ID or null if not provided
 * @throws Error if user ID format is invalid
 */
export function validateUserId(userId: string | null): string | null {
  if (!userId) return null

  const isValid = /^[a-zA-Z0-9-_]{8,64}$/.test(userId)
  if (!isValid) {
    throw new RateLimitValidationError(
      'Invalid X-User-ID format. Must be 8-64 alphanumeric characters (including dash and underscore).',
    )
  }

  return userId
}

/**
 * Custom error class for rate limit validation failures.
 * Returns 400 Bad Request for invalid X-User-ID format.
 */
export class RateLimitValidationError extends Error {
  statusCode = 400
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitValidationError'
  }
}

/**
 * Custom error class for rate limit exceeded.
 * Returns 429 Too Many Requests with Retry-After header.
 *
 * Note: User ID is intentionally NOT included in the error message for privacy.
 */
export class RateLimitExceededError extends Error {
  statusCode = 429
  retryAfter = 60
  constructor() {
    super('Rate limit exceeded. Maximum 500 requests per minute.')
    this.name = 'RateLimitExceededError'
  }
}

/**
 * Checks rate limit for the current request.
 *
 * Flow:
 * 1. Only applies to API client requests (not managers/admin)
 * 2. Disabled in development environment
 * 3. Validates X-User-ID format if provided
 * 4. Builds composite key and checks against rate limiter
 * 5. Logs to Sentry and Pino on rate limit hits
 * 6. Fails open on errors (allows request through)
 *
 * @param req - Payload request object
 * @returns true if allowed, throws if rate limited or validation fails
 */
export async function checkRateLimit(req: PayloadRequest): Promise<boolean> {
  // Only rate limit API client requests (not managers)
  if (req.user?.collection !== 'clients') {
    return true
  }

  // Disable in development - rate limiting is edge infrastructure
  if (process.env.NODE_ENV !== 'production') {
    req.payload.logger.debug({
      msg: 'Rate limiting disabled in development',
      clientId: req.user.id,
    })
    return true
  }

  try {
    // Get Cloudflare context with rate limiter binding
    const { env } = await getCloudflareContext({ async: true })

    // Extract headers
    const clientIP = req.headers?.get?.('cf-connecting-ip') || null
    const rawUserId = req.headers?.get?.('x-user-id') || null

    // Validate X-User-ID format (throws on invalid)
    const userId = validateUserId(rawUserId)

    // Build composite rate limit key
    const key = buildRateLimitKey(req.user.id, clientIP, userId)

    // Type assertion for rate limiter binding (runtime validation via fail-open pattern)
    const rateLimiter = (env as { API_RATE_LIMITER?: RateLimit }).API_RATE_LIMITER

    // Check rate limit (fail open if binding unavailable)
    if (!rateLimiter) {
      req.payload.logger.warn({
        msg: 'Rate limiter binding not available - failing open',
        clientId: req.user.id,
      })
      return true
    }

    const { success } = await rateLimiter.limit({ key })

    if (!success) {
      // Log to Sentry (warning level - this is expected behavior for abuse)
      if (serverEnv.NEXT_PUBLIC_SENTRY_DSN) {
        Sentry.withScope((scope) => {
          scope.setTag('clientId', String(req.user!.id))
          scope.setTag('hasUserId', String(!!userId))
          scope.setExtra('ip', clientIP || 'unknown')
          scope.setExtra('path', req.url || 'unknown')
          scope.setLevel('warning')
          Sentry.captureMessage('API rate limit exceeded')
        })
      }

      // Log to Pino for debugging
      req.payload.logger.warn({
        msg: 'Rate limit exceeded',
        clientId: req.user.id,
        userId: userId || 'none',
        ip: clientIP || 'unknown',
        path: req.url,
      })

      throw new RateLimitExceededError()
    }

    return true
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof RateLimitValidationError || error instanceof RateLimitExceededError) {
      throw error
    }

    // Fail open for unexpected errors (better to allow than block incorrectly)
    req.payload.logger.error({
      msg: 'Rate limiting error - failing open',
      error: error instanceof Error ? error.message : String(error),
      clientId: req.user.id,
    })

    return true
  }
}

/**
 * Creates a beforeOperation hook for rate limiting.
 *
 * Usage:
 * ```typescript
 * import { createRateLimitHook } from '@/lib/rateLimiting'
 *
 * export const MyCollection: CollectionConfig = {
 *   slug: 'my-collection',
 *   hooks: {
 *     beforeOperation: [createRateLimitHook()],
 *   },
 * }
 * ```
 *
 * @returns beforeOperation hook function
 */
export function createRateLimitHook(): CollectionBeforeOperationHook {
  return async ({ req }) => {
    await checkRateLimit(req)
  }
}
