/**
 * Usage Plugin Hooks
 *
 * Hook factories for rate limiting and usage tracking.
 */

import type { RateLimit } from '@cloudflare/workers-types'
import type { CollectionAfterReadHook, CollectionBeforeOperationHook, PayloadRequest } from 'payload'

import { getCloudflareContext } from '@opennextjs/cloudflare'
import * as Sentry from '@sentry/cloudflare'

import { serverEnv } from '@/lib/env'

import { CONSUMER_COLLECTIONS, RateLimitExceededError, RateLimitValidationError } from './types'

// ============================================================================
// RATE LIMITING UTILITIES
// ============================================================================

/**
 * Builds a composite key for rate limiting.
 *
 * Key format: `user:{clientId}:{ip}:{userId}`
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
 */
export function validateUserId(userId: string | null): string | null {
  if (!userId) return null

  if (!/^[a-zA-Z0-9-_]{8,64}$/.test(userId)) {
    throw new RateLimitValidationError(
      'Invalid X-User-ID format. Must be 8-64 alphanumeric characters (including dash and underscore).',
    )
  }

  return userId
}

// ============================================================================
// RATE LIMIT HOOK
// ============================================================================

/**
 * Creates a beforeOperation hook for rate limiting API consumer requests.
 *
 * Only applies to requests from consumer collections (e.g., clients).
 * Skipped in development since rate limiting requires Cloudflare edge infrastructure.
 */
export function createRateLimitHook(): CollectionBeforeOperationHook {
  return async ({ req }) => {
    // Only rate limit consumer requests
    if (!req.user?.collection || !CONSUMER_COLLECTIONS.includes(req.user.collection)) {
      return
    }

    // Skip in development - rate limiting requires Cloudflare edge
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    await checkRateLimit(req)
  }
}

/**
 * Checks rate limit for the current request using Cloudflare Workers Rate Limiting.
 */
async function checkRateLimit(req: PayloadRequest): Promise<void> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    const rateLimiter = (env as { API_RATE_LIMITER?: RateLimit }).API_RATE_LIMITER

    // Fail open if binding unavailable
    if (!rateLimiter) {
      req.payload.logger.warn({ msg: 'Rate limiter binding not available' })
      return
    }

    // Extract and validate headers
    const clientIP = req.headers?.get?.('cf-connecting-ip') || null
    const userId = validateUserId(req.headers?.get?.('x-user-id') || null)

    // Check rate limit
    const key = buildRateLimitKey(req.user!.id, clientIP, userId)
    const { success } = await rateLimiter.limit({ key })

    if (!success) {
      // Log to Sentry and Pino
      if (serverEnv.NEXT_PUBLIC_SENTRY_DSN) {
        Sentry.withScope((scope) => {
          scope.setTag('clientId', String(req.user!.id))
          scope.setLevel('warning')
          Sentry.captureMessage('API rate limit exceeded')
        })
      }

      req.payload.logger.warn({
        msg: 'Rate limit exceeded',
        clientId: req.user!.id,
        userId: userId || 'none',
      })

      throw new RateLimitExceededError()
    }
  } catch (error) {
    // Re-throw custom errors
    if (error instanceof RateLimitValidationError || error instanceof RateLimitExceededError) {
      throw error
    }

    // Fail open for unexpected errors
    req.payload.logger.error({
      msg: 'Rate limiting error - failing open',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// ============================================================================
// USAGE TRACKING HOOK
// ============================================================================

/**
 * Creates an afterRead hook for usage tracking.
 *
 * Queues a job to increment usage stats for the consumer.
 */
export function createUsageTrackingHook(): CollectionAfterReadHook {
  return async ({ doc, req }) => {
    // Only track for consumer requests
    if (req.user?.collection && CONSUMER_COLLECTIONS.includes(req.user.collection) && req.user?.id) {
      await req.payload.jobs.queue({
        task: 'trackUsage' as 'inline',
        input: { consumerId: String(req.user.id) },
      })
    }

    return doc
  }
}
