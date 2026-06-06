/**
 * Usage Plugin Hooks
 *
 * Hooks for rate limiting and usage tracking.
 */
import type {
  CollectionAfterReadHook,
  CollectionBeforeOperationHook,
  PayloadRequest,
} from 'payload'
import type { Pool } from 'pg'

import { APIError } from 'payload'

import { hasValidPreviewSecret } from '@/lib/utilities/previewSecret'

const SKIP_VALIDATION = 'skipClientQueryValidation'

/** Wraps a client request to bypass query-param validation in trusted internal endpoints. */
export function asTrustedReq(req: PayloadRequest): PayloadRequest {
  return { ...req, context: { ...req.context, [SKIP_VALIDATION]: true } }
}

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

// ============================================================================
// RATE LIMIT HOOK
// ============================================================================

/**
 * beforeOperation hook slot for API client rate limiting.
 *
 * Rate limiting now lives at the Cloudflare edge (Rate Limiting Rules in front
 * of the Railway origin), so this hook is intentionally a no-op in the app. It's
 * kept as an extension point: if app-level limits become necessary, implement
 * them here (e.g. a Railway Redis limiter keyed by `buildRateLimitKey`).
 *
 * TODO(railway): finalize the rate-limiter home — Cloudflare edge rules vs Redis (#466).
 */
export const rateLimitHook: CollectionBeforeOperationHook = () => {
  // Enforced at the Cloudflare edge; intentionally a no-op here.
}

// ============================================================================
// QUERY PARAMETER VALIDATION HOOK
// ============================================================================

/**
 * beforeOperation hook that forces API clients to declare their data needs explicitly.
 *
 * - `select` is required on every client read, so they can't pull whole documents.
 * - `populate` is required when effective `depth > 1`, so they can't auto-populate
 *   every relationship.
 *
 * Validation is argument-based, not URL-based: Payload's REST handler parses URL
 * query params (e.g., `?select[title]=true`) into `args.select` before the hook
 * fires, and internal endpoints that forward `req` to `payload.find(...)` with
 * an explicit `select` also pass the check. Only applies to API client reads;
 * managers and write operations are untouched.
 *
 * Bracket notation (`?select[field]=true`) is required because PayloadCMS REST
 * uses `qs-esm` to parse query strings into nested objects. Comma-separated
 * strings (`?select=field1,field2`) parse to a plain string and fail the
 * `typeof === 'object'` check below. See `.claude/rules/api-clients.md` for the
 * full format contract and `tests/int/client-query-validation.int.spec.ts` for
 * REST-format coverage.
 *
 * On rejection, logs the offending shape (type + keys + short string preview)
 * and effective depth at WARN level so production failures are debuggable from
 * the application logs.
 *
 * Payload also performs internal Local API reads while populating selected
 * relationship/upload fields. Those reads carry a numeric `currentDepth`; they
 * are implementation details of the already-validated top-level request and
 * must not be rejected for lacking their own REST `select` parameter.
 *
 * Live-preview reads are also exempt: a request carrying the valid
 * `SAHAJCLOUD_PREVIEW_SECRET` header (see `hasValidPreviewSecret`) renders the
 * whole document, so forcing it to enumerate `select`/`populate` is meaningless
 * and breaks the admin live preview.
 */
export const validateClientQueryParamsHook: CollectionBeforeOperationHook = ({
  args,
  operation,
  req,
}) => {
  if (operation !== 'read' || req.user?.collection !== 'clients') {
    return
  }

  // Trusted internal endpoints that forward client req to payload.find(...) can
  // opt out by setting this context flag — they shape their own response and
  // shouldn't have to enumerate every field via `select` on every internal call.
  if (req.context?.[SKIP_VALIDATION] === true) {
    return
  }

  // Trusted live-preview reads (valid preview secret) render the whole document
  // and must not be forced to enumerate select/populate. Same trust signal that
  // already unlocks drafts in createAccessConfig.
  if (hasValidPreviewSecret(req)) {
    return
  }

  const findArgs = args as {
    currentDepth?: unknown
    select?: unknown
    populate?: unknown
    depth?: unknown
  }

  if (typeof findArgs.currentDepth === 'number') {
    return
  }

  const hasSelect =
    findArgs.select != null &&
    typeof findArgs.select === 'object' &&
    Object.keys(findArgs.select as Record<string, unknown>).length > 0
  const hasPopulate =
    findArgs.populate != null &&
    typeof findArgs.populate === 'object' &&
    Object.keys(findArgs.populate as Record<string, unknown>).length > 0
  const effectiveDepth =
    typeof findArgs.depth === 'number' ? findArgs.depth : req.payload.config.defaultDepth

  if (!hasSelect) {
    req.payload.logger.warn({
      msg: 'Client query validation rejected: select missing or wrong shape',
      clientId: req.user?.id,
      selectType: typeof findArgs.select,
      selectKeys: describeKeys(findArgs.select),
      selectPreview: describeStringPreview(findArgs.select),
    })
    throw new APIError(
      'The "select" query parameter is required for API clients. Specify which fields you need in the response.',
      400,
    )
  }

  if (effectiveDepth > 1 && !hasPopulate) {
    req.payload.logger.warn({
      msg: 'Client query validation rejected: populate missing or wrong shape at depth > 1',
      clientId: req.user?.id,
      depth: findArgs.depth,
      effectiveDepth,
      populateType: typeof findArgs.populate,
      populateKeys: describeKeys(findArgs.populate),
      populatePreview: describeStringPreview(findArgs.populate),
    })
    throw new APIError(
      `The "populate" query parameter is required when depth > 1. Specify which relationships to populate at depth ${effectiveDepth}, or pass depth=1 to disable nested relationship traversal.`,
      400,
    )
  }
}

/** Returns top-level keys of an object, or null for non-objects. Diagnostic-only. */
function describeKeys(value: unknown): string[] | null {
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
  }
  return null
}

/** Returns a 100-char preview of a string value, or null for non-strings. Diagnostic-only. */
function describeStringPreview(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.slice(0, 100)
  }
  return null
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Atomic Postgres UPDATE for incrementing usage counters.
 */
const USAGE_INCREMENT_SQL = `
  UPDATE clients
  SET usage_daily_requests = COALESCE(usage_daily_requests, 0) + 1,
      usage_total_requests = COALESCE(usage_total_requests, 0) + 1,
      usage_last_request_at = $1,
      usage_first_request_at = COALESCE(usage_first_request_at, $2)
  WHERE id = $3
`

/**
 * Get the underlying pg Pool from Payload's Postgres adapter. The pool isn't on
 * the public BaseDatabaseAdapter type, so a narrow cast is needed.
 */
function getPgPool(req: PayloadRequest): Pool | null {
  return (req.payload.db as unknown as { pool?: Pool }).pool ?? null
}

/**
 * afterRead hook for usage tracking.
 *
 * Uses a single atomic Postgres UPDATE for race-free increments in every
 * environment (replaces the former D1-vs-better-sqlite3 fork).
 */
export const usageTrackingHook: CollectionAfterReadHook = async ({ doc, req }) => {
  // Only track for client requests
  if (req.user?.collection !== 'clients' || !req.user?.id) {
    return doc
  }

  try {
    const now = new Date().toISOString()
    const clientId = req.user.id
    const pool = getPgPool(req)

    if (!pool) {
      req.payload.logger.error({ msg: 'Postgres pool not available for usage tracking' })
      return doc
    }

    await pool.query(USAGE_INCREMENT_SQL, [now, now, clientId])
  } catch (error) {
    // Fail open - don't block API requests if tracking fails
    req.payload.logger.error({
      msg: 'Usage tracking error - failing open',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return doc
}
