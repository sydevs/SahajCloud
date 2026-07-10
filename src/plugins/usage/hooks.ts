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

import { APIError } from 'payload'

import { hasValidPreviewSecret } from '@/lib/utilities/previewSecret'
import type { Client } from '@/payload-types'

import { getDbSchema, getPgPool } from './db'
import { extractRequestHost, isHostAllowed, parseAllowedDomains } from './originEnforcement'

const SKIP_VALIDATION = 'skipClientQueryValidation'

/** Shared tracker object for deduplicating usage increments across multiple asTrustedReq calls. */
interface UsageTracker {
  counted: boolean
}

/** Wraps a client request to bypass query-param validation in trusted internal endpoints.
 *
 * Also seeds a shared usage tracker on the original context so multiple asTrustedReq
 * calls within the same request (e.g., in related-* endpoints) all see the same
 * `counted` flag. The tracker reference is copied by the shallow context spread,
 * so all asTrustedReq copies + the original point at the same object.
 * See #546.
 */
export function asTrustedReq(req: PayloadRequest): PayloadRequest {
  // Ensure a real context object exists on the original req, then seed the shared
  // tracker. The tracker reference is copied by the shallow context spread, so all
  // asTrustedReq copies + the original point at the same object.
  req.context ??= {}
  req.context.usageTracker ??= { counted: false }
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
// ORIGIN / REFERER ENFORCEMENT HOOK
// ============================================================================

/**
 * beforeOperation hook enforcing per-client `Origin`/`Referer` allow-listing.
 *
 * Runs for every API-client operation on a usage-wrapped collection (the same
 * seam as `validateClientQueryParamsHook`), so it covers standard client reads
 * and the custom Atlas endpoints (geojson / register) whose internal
 * `payload.find` / `payload.create` calls forward the client `req`. Rules:
 *
 * - Non-client requests (managers, admin UI, server tasks): untouched.
 * - Empty / unset `allowedDomains`: ALLOW any origin (backward-compatible default).
 * - Non-empty `allowedDomains`: the request `Origin` (or `Referer` host) must
 *   match an entry, else 403. Exact host or `*.`-wildcard; see `originEnforcement.ts`.
 * - No `Origin`/`Referer` (server-to-server, cron): ALLOW — the API key is the gate.
 * - Valid live-preview secret: bypass — the same trust signal that unlocks drafts
 *   and skips the select/populate gate.
 * - Internal relationship-population reads (numeric `currentDepth`): skipped; the
 *   already-validated top-level read carries the same origin.
 *
 * Unlike `asTrustedReq`'s `skipClientQueryValidation` flag (a query-shape opt-out),
 * there is deliberately no trusted-req bypass here: origin is a security gate, so
 * forwarded client reads (e.g. register's events lookup) stay enforced against the
 * caller's real origin.
 *
 * On rejection, logs `clientId` + origin + referer at WARN so production denials
 * are debuggable from the application logs.
 */
export const validateClientOriginHook: CollectionBeforeOperationHook = ({ args, req }) => {
  if (req.user?.collection !== 'clients') {
    return
  }

  // Trusted live-preview reads render the whole document from a known frontend —
  // same bypass the select/populate gate uses.
  if (hasValidPreviewSecret(req)) {
    return
  }

  // Internal relationship-population reads reuse the top-level request's origin,
  // which has already passed this check; don't re-evaluate (or double-log) them.
  if (typeof (args as { currentDepth?: unknown }).currentDepth === 'number') {
    return
  }

  const patterns = parseAllowedDomains((req.user as Client).allowedDomains)
  if (patterns.length === 0) {
    return // No allowlist configured → allow all (backward-compatible default).
  }

  const host = extractRequestHost(req)
  if (host === null) {
    return // No Origin/Referer (server-to-server) → allow; API key remains the gate.
  }

  if (isHostAllowed(host, patterns)) {
    return
  }

  req.payload.logger.warn({
    msg: 'Client origin validation rejected: request host not in allowedDomains',
    clientId: req.user.id,
    host,
    origin: req.headers?.get?.('origin') ?? null,
    referer: req.headers?.get?.('referer') ?? null,
  })
  throw new APIError('This origin is not allowed for this API client.', 403)
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Atomic Postgres UPDATE for incrementing usage counters. The `clients` table is
 * schema-qualified because a raw pool query doesn't honor the adapter's schema.
 */
const usageIncrementSql = (schema: string) => `
  UPDATE "${schema}".clients
  SET usage_daily_requests = COALESCE(usage_daily_requests, 0) + 1,
      usage_total_requests = COALESCE(usage_total_requests, 0) + 1,
      usage_last_request_at = $1,
      usage_first_request_at = COALESCE(usage_first_request_at, $2)
  WHERE id = $3
`

/**
 * beforeOperation hook for usage tracking.
 *
 * Counts usage exactly once per top-level client operation, not per document
 * or internal relationship-population read. This prevents N+1 UPDATEs on
 * depth >= 1 reads that populate relationships.
 *
 * Strategy: increment at the beforeOperation seam (before any reads fan out
 * into internal population sub-reads). Skip internal population reads via the
 * numeric `currentDepth` signal that Payload attaches to internal Local API
 * reads — these are implementation details of an already-validated top-level
 * request and should not trigger separate usage tracking.
 *
 * Uses a single atomic Postgres UPDATE for race-free increments. See #559.
 */
export const usageTrackingBeforeOperationHook: CollectionBeforeOperationHook = async ({
  args,
  req,
}) => {
  // Only track for client read operations
  if (req.user?.collection !== 'clients' || !req.user?.id || req.operation !== 'read') {
    return
  }

  // Skip internal relationship-population reads (identified by numeric currentDepth).
  // These are implementation details of the top-level request and should not
  // generate separate usage tracking. Only top-level reads (no currentDepth)
  // should increment usage.
  if (typeof (args as { currentDepth?: unknown }).currentDepth === 'number') {
    return
  }

  try {
    const now = new Date().toISOString()
    const clientId = req.user.id
    const pool = getPgPool(req)

    if (!pool) {
      req.payload.logger.error({ msg: 'Postgres pool not available for usage tracking' })
      return
    }

    await pool.query(usageIncrementSql(getDbSchema(req)), [now, now, clientId])
  } catch (error) {
    // Fail open - don't block API requests if tracking fails
    req.payload.logger.error({
      msg: 'Usage tracking error - failing open',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Deprecated: afterRead hook for usage tracking (replaced by beforeOperation).
 *
 * Kept as a stub for backward compatibility. All usage tracking now happens
 * in beforeOperation to avoid N+1 increments on depth >= 1 reads. See #559.
 *
 * @deprecated Use usageTrackingBeforeOperationHook instead
 */
export const usageTrackingHook: CollectionAfterReadHook = async ({ doc }) => {
  // No-op: usage tracking has moved to beforeOperation
  return doc
}
