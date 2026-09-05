/**
 * Usage Plugin Hooks
 *
 * Hooks for rate limiting and usage tracking.
 */
import type { CollectionBeforeOperationHook, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { hasValidPreviewSecret } from '@/lib/utilities/previewSecret'
import type { Client } from '@/payload-types'

import { getPgPool, quotedDbSchema } from './db'
import { extractRequestHost, isHostAllowed, parseAllowedDomains } from './originEnforcement'

const SKIP_VALIDATION = 'skipClientQueryValidation'

/**
 * Wrap a client request to bypass query-param validation, in trusted internal endpoints.
 *
 * This sets the `skipClientQueryValidation` flag, so a forwarded client read
 * (for example in the related-* endpoints) does not have to enumerate every
 * field through `select`. `usageTrackingBeforeOperationHook` counts usage
 * once per top-level operation, keyed off the absence of a numeric
 * `currentDepth`, so no per-request dedup state needs threading through
 * here. See #559.
 */
export function asTrustedReq(req: PayloadRequest): PayloadRequest {
  return { ...req, context: { ...req.context, [SKIP_VALIDATION]: true } }
}

/**
 * The same request, with **no user**: a system write, performed in the
 * caller's transaction, but not on the caller's authority.
 *
 * `overrideAccess: true` skips collection access, but it does not skip
 * `filterOptions`, which Payload validates against `req.user`. So a write
 * that an API client triggers, and that touches a field with an
 * owner-scoped filter (the events `region` picker), gets refused for a
 * caller who would never pass that filter — a 400 on an operation the
 * client was entitled to trigger, but not to perform itself. Stripping the
 * user is what says "this part is ours."
 *
 * `context`, `transactionID`, and `payload` still travel by reference, so
 * the transaction and any per-request memoization are unaffected.
 */
export function asSystemReq(req: PayloadRequest): PayloadRequest {
  return { ...req, user: null } as PayloadRequest
}

/**
 * Whether a request was wrapped by {@link asTrustedReq}. That is, an
 * endpoint's own internal read, forwarding the client's `req`, rather than
 * serving the client's query directly.
 *
 * Honor this in hooks that shape the **client-facing** result of a read, for
 * example `excludeFinishedEvents`, which drops finished events from list
 * feeds. An endpoint doing its own lookup needs the true state, so it can
 * decide for itself — silently narrowing it turns a precise error into a
 * confusing one. Do **not** honor it in security gates. See
 * `validateClientOriginHook`, which deliberately stays enforced for
 * forwarded reads.
 */
export function isTrustedReq(req: PayloadRequest | undefined): boolean {
  return req?.context?.[SKIP_VALIDATION] === true
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
 * A beforeOperation hook slot for API client rate limiting.
 *
 * Rate limiting now lives at the Cloudflare edge, in Rate Limiting Rules in
 * front of the Railway origin, so this hook is intentionally a no-op in the
 * app. It stays as an extension point: if app-level limits become
 * necessary, implement them here — for example a Railway Redis limiter
 * keyed by `buildRateLimitKey`.
 *
 * TODO(railway): finalize the rate-limiter home — Cloudflare edge rules or
 * Redis (#466).
 */
export const rateLimitHook: CollectionBeforeOperationHook = () => {
  // Enforced at the Cloudflare edge. Intentionally a no-op here.
}

// ============================================================================
// QUERY PARAMETER VALIDATION HOOK
// ============================================================================

/**
 * A beforeOperation hook that forces API clients to declare their data needs explicitly.
 *
 * - `select` is required on every client read, so a client cannot pull whole documents.
 * - `populate` is required when the effective `depth > 1`, so a client
 *   cannot auto-populate every relationship.
 *
 * Validation is argument-based, not URL-based. Payload's REST handler
 * parses URL query params (for example `?select[title]=true`) into
 * `args.select` before the hook fires, and internal endpoints that forward
 * `req` to `payload.find(...)` with an explicit `select` also pass the
 * check. This applies only to API client reads. Managers and write
 * operations are untouched.
 *
 * Bracket notation (`?select[field]=true`) is required, because PayloadCMS
 * REST uses `qs-esm` to parse query strings into nested objects.
 * Comma-separated strings (`?select=field1,field2`) parse to a plain
 * string, and fail the `typeof === 'object'` check below. See
 * `docs/rules/api-clients.md` for the full format contract, and
 * `tests/int/client-query-validation.int.spec.ts` for REST-format coverage.
 *
 * On rejection, this logs the offending shape (type, keys, and a short
 * string preview) and the effective depth, at WARN level, so production
 * failures are debuggable from the application logs.
 *
 * Payload also performs internal Local API reads while it populates
 * selected relationship or upload fields. Those reads carry a numeric
 * `currentDepth`. They are implementation details of the already-validated
 * top-level request, and must not be rejected for lacking their own REST
 * `select` parameter.
 *
 * Live-preview reads are also exempt. A request carrying the valid
 * `SAHAJCLOUD_PREVIEW_SECRET` header (see `hasValidPreviewSecret`) renders
 * the whole document, so forcing it to enumerate `select` and `populate` is
 * meaningless, and breaks the admin live preview.
 */
export const validateClientQueryParamsHook: CollectionBeforeOperationHook = ({
  args,
  operation,
  req,
}) => {
  if (operation !== 'read' || req.user?.collection !== 'clients') {
    return
  }

  // A trusted internal endpoint that forwards the client req to
  // payload.find(...) can opt out by setting this context flag. It shapes
  // its own response, and should not have to enumerate every field through
  // `select` on every internal call.
  if (req.context?.[SKIP_VALIDATION] === true) {
    return
  }

  // A trusted live-preview read (with a valid preview secret) renders the
  // whole document, and must not be forced to enumerate select or populate.
  // This is the same trust signal that already unlocks drafts in
  // createAccessConfig.
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
 * Enforce a client's `Origin`/`Referer` allowlist. Throws `APIError(403)`
 * when the request host is not on it. This is the single source of the
 * rule. Both {@link validateClientOriginHook} (collection reads and
 * writes) and endpoints that touch no collection at all
 * (`GET /api/atlas/seo`) call it. Rules:
 *
 * - Non-client requests (managers, admin UI, server tasks): untouched.
 * - Empty or unset `allowedDomains`: ALLOW any origin (the backward-compatible default).
 * - Non-empty `allowedDomains`: the request `Origin` (or the `Referer`
 *   host) must match an entry, else 403. Exact host, or a `*.` wildcard.
 *   See `originEnforcement.ts`.
 * - No `Origin` or `Referer` (server-to-server, cron): ALLOW. The API key
 *   is the gate.
 * - A valid live-preview secret: bypass. This is the same trust signal
 *   that unlocks drafts and skips the select/populate gate.
 *
 * Unlike `asTrustedReq`'s `skipClientQueryValidation` flag, a query-shape
 * opt-out, there is deliberately no trusted-req bypass here. Origin is a
 * security gate, so a forwarded client read (for example register's events
 * lookup) stays enforced against the caller's real origin.
 *
 * On rejection, this logs `clientId`, origin, and referer at WARN, so
 * production denials are debuggable from the application logs.
 *
 * @throws {APIError} 403 when the caller is a client whose allowlist
 *   excludes the request host.
 */
export function assertClientOriginAllowed(req: PayloadRequest): void {
  if (req.user?.collection !== 'clients') {
    return
  }

  // A trusted live-preview read renders the whole document from a known
  // frontend. This is the same bypass the select/populate gate uses.
  if (hasValidPreviewSecret(req)) {
    return
  }

  const patterns = parseAllowedDomains((req.user as Client).allowedDomains)
  if (patterns.length === 0) {
    return // No allowlist configured. Allow all (the backward-compatible default).
  }

  const host = extractRequestHost(req)
  if (host === null) {
    return // No Origin or Referer (server-to-server). Allow — the API key remains the gate.
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

/**
 * A beforeOperation hook that enforces per-client `Origin`/`Referer` allow-listing.
 *
 * This runs for every API-client operation on a usage-wrapped collection,
 * the same seam as `validateClientQueryParamsHook`. So it covers standard
 * client reads, and the custom Atlas endpoints (geojson and register) whose
 * internal `payload.find` and `payload.create` calls forward the client
 * `req`. The rule itself lives in {@link assertClientOriginAllowed}. This
 * hook adds the one operation-shaped exemption:
 *
 * - Internal relationship-population reads (with a numeric `currentDepth`)
 *   are skipped. The already-validated top-level read carries the same
 *   origin, so re-evaluating would only double-log.
 */
export const validateClientOriginHook: CollectionBeforeOperationHook = ({ args, req }) => {
  if (typeof (args as { currentDepth?: unknown }).currentDepth === 'number') {
    return
  }

  assertClientOriginAllowed(req)
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * An atomic Postgres UPDATE that increments usage counters. The `clients`
 * table is schema-qualified, because a raw pool query does not honor the
 * adapter's schema.
 */
const usageIncrementSql = (quotedSchema: string) => `
  UPDATE ${quotedSchema}.clients
  SET usage_daily_requests = COALESCE(usage_daily_requests, 0) + 1,
      usage_total_requests = COALESCE(usage_total_requests, 0) + 1,
      usage_last_request_at = $1,
      usage_first_request_at = COALESCE(usage_first_request_at, $2)
  WHERE id = $3
`

/**
 * A beforeOperation hook for usage tracking.
 *
 * This counts usage exactly once per top-level client operation, not per
 * document or internal relationship-population read. That prevents N+1
 * UPDATEs on reads at depth 1 or more that populate relationships.
 *
 * Strategy: increment at the beforeOperation seam, before any read fans out
 * into internal population sub-reads. Skip an internal population read
 * through the numeric `currentDepth` signal that Payload attaches to
 * internal Local API reads. These are implementation details of an
 * already-validated top-level request, and should not trigger separate
 * usage tracking.
 *
 * This uses a single atomic Postgres UPDATE, for race-free increments. See #559.
 */
export const usageTrackingBeforeOperationHook: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  // Only track for client read operations
  if (req.user?.collection !== 'clients' || !req.user?.id || operation !== 'read') {
    return
  }

  // Skip internal relationship-population reads, identified by a numeric
  // currentDepth. These are implementation details of the top-level
  // request, and should not generate separate usage tracking. Only a
  // top-level read, with no currentDepth, should increment usage.
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

    await pool.query(usageIncrementSql(quotedDbSchema(req)), [now, now, clientId])
  } catch (error) {
    // Fail open. Do not block API requests when tracking fails.
    req.payload.logger.error({
      msg: 'Usage tracking error - failing open',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
