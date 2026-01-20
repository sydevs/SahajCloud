/**
 * Usage Plugin Hooks
 *
 * Hook factories for rate limiting and usage tracking.
 */

import type { ConsumerConfig } from './types'
import type { RateLimit } from '@cloudflare/workers-types'
import type {
  CollectionAfterReadHook,
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
  PayloadRequest,
} from 'payload'

import { getCloudflareContext } from '@opennextjs/cloudflare'
import * as Sentry from '@sentry/cloudflare'

import { serverEnv } from '@/lib/env'

import { RateLimitExceededError, RateLimitValidationError } from './types'

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Builds a composite key for rate limiting.
 *
 * The key uniquely identifies a user based on:
 * - Client ID (API key owner)
 * - IP address (from CF-Connecting-IP header)
 * - User ID (self-reported via X-User-ID header)
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

  const isValid = /^[a-zA-Z0-9-_]{8,64}$/.test(userId)
  if (!isValid) {
    throw new RateLimitValidationError(
      'Invalid X-User-ID format. Must be 8-64 alphanumeric characters (including dash and underscore).',
    )
  }

  return userId
}

/**
 * Checks rate limit for the current request.
 *
 * @param req - Payload request object
 * @param consumerCollections - List of consumer collection slugs
 * @returns true if allowed, throws if rate limited or validation fails
 */
async function checkRateLimit(req: PayloadRequest, consumerCollections: string[]): Promise<boolean> {
  // Only rate limit API consumer requests (not managers)
  if (!req.user?.collection || !consumerCollections.includes(req.user.collection)) {
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
 * @param consumers - Consumer configurations
 * @returns beforeOperation hook function
 */
export function createRateLimitHook(consumers: ConsumerConfig[]): CollectionBeforeOperationHook {
  const consumerCollections = consumers.map((c) => c.collection)

  return async ({ req }) => {
    await checkRateLimit(req, consumerCollections)
  }
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Creates an afterRead hook for usage tracking.
 * Queues a job to increment usage stats for the consumer.
 *
 * @param consumers - Consumer configurations
 * @returns afterRead hook function
 */
export function createUsageTrackingHook(consumers: ConsumerConfig[]): CollectionAfterReadHook {
  const consumerCollections = consumers.map((c) => c.collection)

  return async ({ doc, req }) => {
    // Only track usage for consumer collection requests (e.g., clients)
    if (req.user?.collection && consumerCollections.includes(req.user.collection) && req.user?.id) {
      // Note: Cast task slug since plugin-registered tasks aren't in generated types
      await req.payload.jobs.queue({
        task: 'trackUsage' as 'inline',
        input: {
          consumerId: String(req.user.id),
          consumerCollection: req.user.collection,
        },
      })
    }

    return doc
  }
}

// ============================================================================
// CONSUMER COLLECTION HOOKS
// ============================================================================

/**
 * Creates a beforeChange hook for initializing usage stats.
 * Only applies to consumer collections on create operation.
 *
 * @param config - Consumer configuration
 * @returns beforeChange hook function
 */
export function createInitStatsHook(config: ConsumerConfig): CollectionBeforeChangeHook {
  const { statsFieldPath = 'usage' } = config

  return async ({ data, operation }) => {
    // Initialize usage stats on creation
    if (operation === 'create') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dataAny = data as any
      if (!dataAny[statsFieldPath]) {
        dataAny[statsFieldPath] = {
          dailyRequests: 0,
          peakDailyRequests: 0,
          lastRequestAt: null,
        }
      }
    }

    return data
  }
}
