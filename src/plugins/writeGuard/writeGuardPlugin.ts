import type { WriteGuardOperationPolicy, WriteGuardPolicy } from './policies'
import type { CollectionBeforeValidateHook, CollectionSlug, Config, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import type { AntiSpamFailure } from '@/lib/antiSpam/antiSpamGuard'
import {
  checkEmailAllowed,
  checkNoUrls,
  verifyTurnstileOrFail,
} from '@/lib/antiSpam/antiSpamGuard'
import { proposalLeaves } from '@/lib/antiSpam/proposalLeaves'


import { DEFAULT_WRITE_GUARD_POLICIES } from './policies'

/**
 * Write Guard Plugin
 *
 * Project-wide anti-spam enforcement for the public write surface: every
 * collection write **by an API client** runs the per-collection policy checks
 * (Turnstile header, URL-in-text scan, email format + disposable-domain list)
 * in a `beforeValidate` hook — before field validation, before any hook does
 * real work. Endpoints don't re-implement the guard; they inherit it from the
 * collection seam, the same way origin enforcement rides on the usage plugin.
 *
 * Who is guarded — exactly `req.user.collection === 'clients'`:
 *
 * - Managers/admins are trusted authors; their writes are never scanned.
 * - System writes (jobs, seeds, the accept op, test fixtures) run with no user
 *   or a manager `req` and pass untouched.
 * - An internal write that **forwards the client `req`** (`prepareUserSubmission`'s
 *   `users` upsert, on a `user-submissions` create) is deliberately guarded:
 *   that's the client's content, whatever code path carried it.
 *
 * Escape hatch: `req.context.skipWriteGuard` — for an internal write that
 * forwards a client `req` but writes system-authored data (e.g. a sync hook
 * updating a counter on another collection). Same pattern as `skipVerifyHook`.
 *
 * Failures throw `APIError(message, status, { code, field }, isPublic: true)`,
 * so the built-in REST endpoints and custom handlers alike surface the message
 * and machine code (`captcha_failed`, `urls_not_allowed`, `disposable_email`,
 * …). `field` names the input that tripped a per-field check, and is absent
 * from the captcha's verdict, which is about the request. A `derivedScan`
 * column names the leaf it found, having no listed path to name (#948).
 *
 * ⚠ **`prepareUserSubmission` raises these same codes** for the pairs no path
 * here can scan selectively, and carries the same `field`. One endpoint, one
 * error shape — a client reading `errors[0].data` must not have to know which
 * of the two refused it.
 */

/** Read a (possibly dotted) path off the incoming data. */
function valueAtPath(data: Record<string, unknown>, path: string): unknown {
  let current: unknown = data
  for (const segment of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/** Collect every string leaf of a value (strings pass through; objects/arrays are walked). */
function stringLeaves(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value)
  else if (Array.isArray(value)) for (const item of value) stringLeaves(item, into)
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) stringLeaves(item, into)
  return into
}

function throwFailure(failure: AntiSpamFailure): never {
  throw new APIError(
    failure.message,
    failure.status,
    { code: failure.code, field: failure.field },
    true,
  )
}

/**
 * The string leaves of `derivedScan`'s column, classified against the target
 * collection's live config.
 *
 * A collection with no config to read — a bare test harness — derives nothing
 * and scans nothing, the way `validateProposal` lets Accept be the gate rather
 * than refusing every submission.
 */
function derivedLeaves(
  derived: NonNullable<WriteGuardOperationPolicy['derivedScan']>,
  data: Record<string, unknown>,
  req: PayloadRequest,
) {
  const fields = req.payload?.collections?.[derived.collection]?.config?.flattenedFields
  if (!fields?.length) return { urlScan: {}, emails: {} }
  return proposalLeaves(valueAtPath(data, derived.path), fields, derived.path)
}

async function runPolicy(
  policy: WriteGuardOperationPolicy,
  data: Record<string, unknown>,
  req: PayloadRequest,
): Promise<void> {
  const derived = policy.derivedScan && derivedLeaves(policy.derivedScan, data, req)

  // Cheap checks first; the captcha (a network call) goes last so obviously
  // bad content never costs a siteverify round-trip.
  for (const field of policy.urlScanFields ?? []) {
    const leaves = stringLeaves(valueAtPath(data, field))
    const result = checkNoUrls(
      Object.fromEntries(leaves.map((leaf, i) => [`${field}${i ? `#${i}` : ''}`, leaf])),
    )
    if (!result.ok) throwFailure({ ...result, field })
  }

  // ⚠ The leaf's own path is the refusal's `field` here, where a listed path
  // above overrides it: a derived scan has no listed path to name, and the
  // column it found is the input the sender can act on.
  if (derived) {
    const result = checkNoUrls(derived.urlScan)
    if (!result.ok) throwFailure(result)
  }

  for (const field of policy.emailFields ?? []) {
    const value = valueAtPath(data, field)
    if (typeof value !== 'string' && value != null) continue
    const result = checkEmailAllowed(value as string | null | undefined, field)
    if (!result.ok) throwFailure(result)
  }

  for (const [field, value] of Object.entries(derived?.emails ?? {})) {
    const result = checkEmailAllowed(value, field)
    if (!result.ok) throwFailure(result)
  }

  if (policy.turnstile) {
    const token = req.headers?.get?.('x-turnstile-token')
    const result = await verifyTurnstileOrFail(req, token)
    if (!result.ok) throwFailure(result)
  }
}

/** The `beforeValidate` hook enforcing one collection's policy. */
export function writeGuardBeforeValidate(policy: WriteGuardPolicy): CollectionBeforeValidateHook {
  return async ({ data, operation, req }) => {
    if (operation !== 'create' && operation !== 'update') return data
    const operationPolicy = policy[operation]
    if (!operationPolicy) return data
    if (req.user?.collection !== 'clients') return data
    if (req.context?.skipWriteGuard) return data

    await runPolicy(operationPolicy, (data ?? {}) as Record<string, unknown>, req)
    return data
  }
}

/**
 * Wire the policy map into the matching collections. Collections without a
 * policy are untouched — the access plugin already denies clients every write
 * this map doesn't deliberately open.
 */
export function writeGuardPlugin(
  options: {
    enabled?: boolean
    policies?: Partial<Record<CollectionSlug, WriteGuardPolicy>>
  } = {},
): (config: Config) => Config {
  const { enabled = true, policies = DEFAULT_WRITE_GUARD_POLICIES } = options

  if (!enabled) return (config: Config) => config

  return (config: Config): Config => ({
    ...config,
    collections: config.collections?.map((collection) => {
      const policy = policies[collection.slug as CollectionSlug]
      if (!policy) return collection
      return {
        ...collection,
        hooks: {
          ...collection.hooks,
          beforeValidate: [
            writeGuardBeforeValidate(policy),
            ...(collection.hooks?.beforeValidate || []),
          ],
        },
      }
    }),
  })
}
