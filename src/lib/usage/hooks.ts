/**
 * Usage Plugin Hooks
 *
 * Hooks for rate limiting and usage tracking.
 */

import type { RateLimit } from '@cloudflare/workers-types'
import type { CollectionAfterReadHook, CollectionBeforeOperationHook, PayloadRequest } from 'payload'

import { getCloudflareContext } from '@opennextjs/cloudflare'
import * as Sentry from '@sentry/cloudflare'
import { APIError } from 'payload'
import { z } from 'zod'

import { serverEnv } from '@/lib/env'

import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_PERIOD_SECONDS } from './constants'

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
 * Zod schema for X-User-ID header validation.
 * Valid format: 8-64 alphanumeric characters (including dash and underscore)
 */
const userIdSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9-_]{8,64}$/,
    'Invalid X-User-ID format. Must be 8-64 alphanumeric characters (including dash and underscore).',
  )

// ============================================================================
// RATE LIMIT HOOK
// ============================================================================

/**
 * Core rate limiting logic. Throws APIError on validation failure or rate limit exceeded.
 * Does NOT catch errors - that's handled by the hook wrapper.
 */
async function checkRateLimit(req: PayloadRequest): Promise<void> {
  const { env } = await getCloudflareContext({ async: true })
  const rateLimiter = (env as { API_RATE_LIMITER?: RateLimit }).API_RATE_LIMITER

  // Fail open if binding unavailable
  if (!rateLimiter) {
    req.payload.logger.warn({ msg: 'Rate limiter binding not available' })
    return
  }

  // Extract and validate X-User-ID header
  const rawUserId = req.headers?.get?.('x-user-id') || null
  let userId: string | null = null

  if (rawUserId) {
    const result = userIdSchema.safeParse(rawUserId)
    if (!result.success) {
      throw new APIError(result.error.issues[0].message, 400)
    }
    userId = result.data
  }

  // Check rate limit
  const clientIP = req.headers?.get?.('cf-connecting-ip') || null
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

    throw new APIError(
      `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per ${RATE_LIMIT_PERIOD_SECONDS === 60 ? 'minute' : `${RATE_LIMIT_PERIOD_SECONDS} seconds`}.`,
      429,
    )
  }
}

/**
 * beforeOperation hook for rate limiting API client requests.
 *
 * Only applies to requests from API consumer collections (e.g., clients).
 * Skipped in development since rate limiting requires Cloudflare edge infrastructure.
 */
export const rateLimitHook: CollectionBeforeOperationHook = async ({ req }) => {
  // Only rate limit client requests
  if (req.user?.collection !== 'clients') {
    return
  }

  // Skip in development - rate limiting requires Cloudflare edge
  if (process.env.NODE_ENV !== 'production') {
    return
  }

  try {
    await checkRateLimit(req)
  } catch (error) {
    // Re-throw API errors (validation failures, rate limit exceeded)
    if (error instanceof APIError) {
      throw error
    }

    // Fail open for unexpected errors (Cloudflare binding issues, etc.)
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
 * afterRead hook for usage tracking.
 *
 * Queues a job to increment usage stats for the API consumer.
 */
export const usageTrackingHook: CollectionAfterReadHook = async ({ doc, req }) => {
  // Only track for client requests
  if (req.user?.collection === 'clients' && req.user?.id) {
    await req.payload.jobs.queue({
      task: 'trackUsage',
      input: { apiConsumerId: String(req.user.id) },
    })
  }

  return doc
}
