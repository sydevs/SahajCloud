import type { JSONSchema4 } from 'json-schema'

import type { HttpsSahajcloudDevSchemasClientCanonicalVerificationJson } from '@/payload-types'

import { CANONICAL_DOMAIN_PATTERN, ROUTING_MODES } from './canonical'

/**
 * The `canonical.verification` contract — what the CMS itself has confirmed
 * about the embed an operator nominated, and the ladder that takes a repeatedly
 * broken one out of service.
 *
 * Pure and side-effect free: the JSON Schema types + validates the column, and
 * {@link nextVerificationState} is the whole state machine. Nothing here loads a
 * page, reads a request, or touches Payload — so the three-strikes rule, the
 * `inconclusive` exemption and the backoff are unit-testable on their own.
 *
 * **Why the server attests rather than the widget** (#633 follow-up): the report
 * endpoint is reachable by anyone holding a published key from an allowed
 * origin. If a public canonical URL were shaped by what a client *reported*, a
 * forged report could reshape it. So a report only ever nominates a candidate;
 * `verified` below — written solely by the verification job from what it
 * observed on the live page — is what a canonical URL may be built from.
 */

/** `$id` / `fileMatch` key Payload names the generated type from. */
export const CANONICAL_VERIFICATION_SCHEMA_URI =
  'https://sahajcloud.dev/schemas/client-canonical-verification.json'

/** Definitive failures — the embed is genuinely not working. These count. */
export const VERIFICATION_FAILURE_REASONS = ['dns', 'http', 'marker-absent'] as const
export type VerificationFailureReason = (typeof VERIFICATION_FAILURE_REASONS)[number]

/**
 * We learned nothing. These must **never** count toward {@link CANONICAL_FAILURE_LIMIT}.
 *
 * Our Cloudflare token lapsing, the browser provider erroring, or a customer's
 * bot protection refusing a headless load are all failures of *our* ability to
 * observe — not evidence the embed is broken. Counting them would auto-disable
 * working canonicals and change live public URLs for no reason.
 */
export const VERIFICATION_INCONCLUSIVE_REASONS = [
  'not-configured',
  'provider-error',
  'quota',
  'bot-challenge',
] as const
export type VerificationInconclusiveReason = (typeof VERIFICATION_INCONCLUSIVE_REASONS)[number]

/**
 * The stored `canonical.verification` column, straight off the generated type.
 *
 * The chain is one-directional and worth stating, because it is easy to read the
 * wrong way round: the const arrays above are spliced into
 * {@link canonicalVerificationJsonSchema} below, Payload generates
 * `HttpsSahajcloudDevSchemasClientCanonicalVerificationJson` from that schema,
 * and these three aliases derive from the generated type. So the arrays are the
 * single source and this file cannot drift from the column (#671).
 *
 * `verified` is null until the first success — the only thing a canonical URL
 * may be built from. `failureCount` is consecutive *definitive* failures, reset
 * to 0 by any success.
 */
export type CanonicalVerification = HttpsSahajcloudDevSchemasClientCanonicalVerificationJson

/** What the verifier observed on the live page. Job-written, never typed by hand. */
export type VerifiedEmbed = NonNullable<CanonicalVerification['verified']>

/** One attempt, newest first in {@link CanonicalVerification.attempts}. */
export type VerificationAttempt = CanonicalVerification['attempts'][number]

/** Consecutive definitive failures before canonical ownership is switched off. */
export const CANONICAL_FAILURE_LIMIT = 3

/** How many attempts are retained. The log shares a row — it cannot grow forever. */
export const MAX_VERIFICATION_ATTEMPTS = 10

/** Normal re-check interval once an embed is verified. */
export const VERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Retry sooner when we learned nothing — the fault is likely ours and transient. */
export const VERIFY_INCONCLUSIVE_RETRY_MS = 60 * 60 * 1000

const domainSchema: JSONSchema4 = {
  type: 'string',
  pattern: CANONICAL_DOMAIN_PATTERN.source,
  minLength: 1,
}

/**
 * JSON Schema for the column. Payload generates the TS type from this **and**
 * compiles it to a validator that runs on write.
 *
 * The `domain` pattern is the same bare-host rule the admin field used to
 * enforce with `canonicalDomainValidate`. It moved here because the host is now
 * job-written rather than typed — the guard belongs where the write happens.
 */
export const canonicalVerificationJsonSchema: JSONSchema4 = {
  $id: CANONICAL_VERIFICATION_SCHEMA_URI,
  type: 'object',
  additionalProperties: false,
  required: ['verified', 'failureCount', 'attempts'],
  properties: {
    verified: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['domain', 'mount', 'routing', 'widgetVersion', 'at'],
      properties: {
        domain: domainSchema,
        mount: { type: 'string' },
        routing: { enum: [...ROUTING_MODES] },
        widgetVersion: { type: 'number' },
        at: { type: 'string' },
      },
    },
    failureCount: { type: 'number', minimum: 0 },
    attempts: {
      type: 'array',
      // Deliberately no `maxItems`: json-schema-to-typescript renders a bounded
      // array as an exploded tuple union (one variant per length), which adds
      // ~200 lines to payload-types.ts for no safety we don't already have.
      // `nextVerificationState` is what trims the ring.
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['at', 'status'],
        properties: {
          at: { type: 'string' },
          status: { enum: ['verified', 'failed', 'inconclusive'] },
          reason: {
            enum: [...VERIFICATION_FAILURE_REASONS, ...VERIFICATION_INCONCLUSIVE_REASONS],
          },
        },
      },
    },
  },
}

/** What one verification run concluded. */
export type VerificationResult =
  | { status: 'verified'; embed: VerifiedEmbed }
  | { status: 'failed'; reason: VerificationFailureReason; detail?: string }
  | { status: 'inconclusive'; reason: VerificationInconclusiveReason; detail?: string }

/** The state a run produces, plus the two decisions its caller has to act on. */
export interface VerificationTransition {
  verification: CanonicalVerification
  /** When to look again. */
  nextVerifyAt: string
  /** True when this run exhausted the failure budget — disable and notify. */
  disable: boolean
}

export const EMPTY_VERIFICATION: CanonicalVerification = {
  verified: null,
  failureCount: 0,
  attempts: [],
}

/**
 * Fold one run's result into the stored state.
 *
 * The whole ladder in one pure function:
 *
 * - **verified** — record the snapshot, reset the counter, look again tomorrow.
 * - **failed** — increment. On the {@link CANONICAL_FAILURE_LIMIT}th consecutive
 *   failure, report `disable`. Backs off geometrically so a site that is down
 *   for a week isn't hit daily on the way there.
 * - **inconclusive** — logged, but the counter and the last good snapshot are
 *   left exactly as they were; retry in an hour.
 *
 * `verified` is deliberately **not** cleared on failure. It is the last thing we
 * actually confirmed, and keeping it lets the admin panel say what is now broken
 * rather than going blank at the moment that matters most.
 */
export function nextVerificationState(args: {
  current: CanonicalVerification | null | undefined
  result: VerificationResult
  now: Date
}): VerificationTransition {
  const { current, result, now } = args
  const previous = current ?? EMPTY_VERIFICATION
  const at = now.toISOString()

  const attempt: VerificationAttempt = {
    at,
    status: result.status,
    ...(result.status === 'verified' ? {} : { reason: result.reason }),
  }
  const attempts = [attempt, ...previous.attempts].slice(0, MAX_VERIFICATION_ATTEMPTS)

  if (result.status === 'inconclusive') {
    return {
      verification: { ...previous, attempts },
      nextVerifyAt: new Date(now.getTime() + VERIFY_INCONCLUSIVE_RETRY_MS).toISOString(),
      disable: false,
    }
  }

  if (result.status === 'verified') {
    return {
      verification: { verified: result.embed, failureCount: 0, attempts },
      nextVerifyAt: new Date(now.getTime() + VERIFY_INTERVAL_MS).toISOString(),
      disable: false,
    }
  }

  const failureCount = previous.failureCount + 1
  // Back off 1×, 2×, 4× the normal interval as failures accumulate, so a site
  // that has been down for days isn't probed on the same cadence as a healthy one.
  const backoff = VERIFY_INTERVAL_MS * 2 ** Math.min(failureCount - 1, 3)

  return {
    verification: { ...previous, failureCount, attempts },
    nextVerifyAt: new Date(now.getTime() + backoff).toISOString(),
    disable: failureCount >= CANONICAL_FAILURE_LIMIT,
  }
}

/**
 * Canonical URLs are built by `@/lib/atlas/canonicalUrl` — `buildCanonicalUrl`
 * over a `canonicalTargetForHost(verified)` target.
 *
 * There used to be a second builder here, and the two disagreed in a way that
 * mattered: this one emitted the Atlas path with its leading slash stripped and
 * the rest percent-encoded (`?atlas=events%2F12345`). The widget guards that
 * parameter with `safeLoaderPath`, which requires a leading `/` and rejects a
 * bare `relative/path` outright — so every query-routed URL of that shape was
 * refused and the widget silently fell back to the embed's default route.
 *
 * One builder, pinned to `atlas-url-contract.json`, is the fix. Nothing may
 * compose a canonical URL by hand.
 */

/**
 * Split a mount key back into the host and the page path.
 *
 * The key is `origin + pathname` (`https://sahajayoga.nl/?p=123`), so the URL parser does the
 * work — `host` keeps a port if there is one, and `search` preserves the WordPress permalink the
 * report contract allows through. Shared because the picker renders from it and the verifier
 * builds its `VerifiedEmbed` from it; they must agree.
 */
export function splitMountKey(key: string): { domain: string; mount: string } | null {
  try {
    const url = new URL(key)
    return { domain: url.host, mount: `${url.pathname}${url.search}` }
  } catch {
    return null
  }
}
