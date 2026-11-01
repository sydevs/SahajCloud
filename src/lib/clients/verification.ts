import type { ClientCanonicalVerification } from '@/payload-types'

/**
 * The `canonical.verification` contract — what the CMS itself has confirmed
 * about the embed an operator nominated, and the ladder that takes a repeatedly
 * broken one out of service.
 *
 * Pure and side-effect free: {@link nextVerificationState} is the whole state
 * machine, and the column's JSON Schema — built from the const arrays below —
 * sits at its field in `Clients.ts`. Nothing here loads a page, reads a request,
 * or touches Payload, so the three-strikes rule, the `inconclusive` exemption
 * and the backoff are unit-testable on their own.
 *
 * ⚠ **Keep this module free of heavy runtime imports.** `CanonicalEmbedPicker`
 * is a `'use client'` component and value-imports {@link splitMountKey} from
 * here, so a top-level import lands in an admin browser chunk. That is why the
 * `jsonSchema` call moved to `Clients.ts` — declaring it here would ship `zod`
 * to the browser to describe a shape only the server validates.
 *
 * **Why the server attests rather than the widget** (#633 follow-up): the report
 * endpoint is reachable by anyone holding a published key from an allowed
 * origin. If a public canonical URL were shaped by what a client *reported*, a
 * forged report could reshape it. So a report only ever nominates a candidate;
 * `verified` below — written solely by the verification job from what it
 * observed on the live page — is what a canonical URL may be built from.
 */

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
 * What each post-install SEO check looks at (#1055).
 *
 * Every one is a thing a volunteer can get wrong at a step the Install tab
 * names, and nothing else — a check whose failure names no step to redo is a
 * red light with no action behind it, which is worse than no light.
 *
 * - `title` — the rendered `<title>` is the one the endpoint answered. Fails
 *   when the router is not calling us, or is calling us and discarding `head`.
 * - `canonical` — the rendered canonical is the endpoint's, or the page itself
 *   where the endpoint answered none. Fails the same way, one field over.
 * - `json-ld` — a `ld+json` block is present at all.
 * - `body` — the crawlable children are present. Fails when the text element is
 *   missing, misnamed, or collapsed before a crawler sees it.
 * - `sitemap` — a sitemap the site publishes lists the sampled page. Fails when
 *   the site was never republished after the router was added.
 */
export const SEO_CHECK_IDS = ['title', 'canonical', 'json-ld', 'body', 'sitemap'] as const
export type SeoCheckId = (typeof SEO_CHECK_IDS)[number]

/**
 * How one check came out.
 *
 * ⚠ **`skipped` is not `fail`, and conflating them is the whole hazard here.**
 * A page we could not fetch, a client with no sampled region, a locale with no
 * copy — none is evidence the install is wrong, and all three are common on a
 * site mid-setup. Only `fail` is ever shown as a problem or emailed, which is
 * the same split `inconclusive` makes for the mount ladder above.
 */
export const SEO_CHECK_STATUSES = ['pass', 'fail', 'skipped'] as const
export type SeoCheckStatus = (typeof SEO_CHECK_STATUSES)[number]

/**
 * The stored `canonical.verification` column, straight off the generated type.
 *
 * The chain is one-directional and worth stating, because it is easy to read the
 * wrong way round: the const arrays above are spliced into
 * `canonicalVerificationFieldSchema` in `Clients.ts`, Payload generates
 * `ClientCanonicalVerification` from that schema's `title`, and these three
 * aliases derive from the generated type. So the arrays are the single source
 * and this file cannot drift from the column (#671).
 *
 * `verified` is null until the first success — the only thing a canonical URL
 * may be built from. `failureCount` is consecutive *definitive* failures, reset
 * to 0 by any success.
 */
export type CanonicalVerification = ClientCanonicalVerification

/** What the verifier observed on the live page. Job-written, never typed by hand. */
export type VerifiedEmbed = NonNullable<CanonicalVerification['verified']>

/**
 * The stored SEO-check snapshot, off the generated type like its siblings.
 *
 * `null` until the first run. Its own writer is {@link nextSeoCheckState}.
 */
export type SeoCheckSnapshot = NonNullable<CanonicalVerification['seo']>

/** One check's outcome on one page. */
export type SeoCheckResult = SeoCheckSnapshot['results'][number]

/** One attempt, newest first in {@link CanonicalVerification.attempts}. */
export type VerificationAttempt = CanonicalVerification['attempts'][number]

/** Consecutive definitive failures before canonical ownership is switched off. */
export const CANONICAL_FAILURE_LIMIT = 3

/**
 * Consecutive negative probes before a client on `path` is returned to `query`.
 *
 * **Its own constant and its own counter, never `failureCount`.** That one
 * becomes `disable` — canonical ownership switched off, plus an email to the
 * service's manager. A routing negative means the embed is *present and
 * publishing*, just in the uglier `?atlas=` shape, so it must never reach it.
 */
export const ROUTING_PROBE_FAILURE_LIMIT = 3

/** How many attempts are retained. The log shares a row — it cannot grow forever. */
export const MAX_VERIFICATION_ATTEMPTS = 10

/** Normal re-check interval once an embed is verified. */
export const VERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Retry sooner when we learned nothing — the fault is likely ours and transient. */
export const VERIFY_INCONCLUSIVE_RETRY_MS = 60 * 60 * 1000

/**
 * What one routing probe concluded.
 *
 * The same three-way split as {@link VerificationResult}, for the same reason:
 * `negative` is evidence about the host's server, `inconclusive` means we could
 * not look and must change nothing.
 */
export interface RoutingProbeResult {
  status: 'positive' | 'negative' | 'inconclusive'
  detail?: string
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
      // Spread `previous` first: `routingProbe` is a sibling this function does not
      // own, and a success must not clear the routing verdict beside it.
      verification: { ...previous, verified: result.embed, failureCount: 0, attempts },
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
 * Fold one probe's result into the stored state, and hand back the whole
 * verification so a caller persists one object.
 *
 * **Asymmetric on purpose, because the failures are asymmetric.** A wrong
 * `path` breaks every deep link and puts 404s in the sitemap. A wrong `query`
 * only produces uglier URLs that still work. So:
 *
 * - **positive** — promote at once, and reset the failed-attempt count.
 * - **negative** — count a failed attempt, and demote only on the
 *   {@link ROUTING_PROBE_FAILURE_LIMIT}th in a row. The count is capped there, so
 *   a host that has been gone for a month does not accumulate forever.
 * - **inconclusive** — change nothing at all, exactly as the mount ladder does.
 */
export function nextRoutingProbeState(args: {
  current: CanonicalVerification | null | undefined
  result: RoutingProbeResult
  now: Date
}): CanonicalVerification {
  const { current, result, now } = args
  const previous = current ?? EMPTY_VERIFICATION
  if (result.status === 'inconclusive') return previous

  const at = now.toISOString()
  if (result.status === 'positive') {
    return { ...previous, routingProbe: { at, verdict: 'path', failedAttempts: 0 } }
  }

  const failedAttempts = Math.min(
    (previous.routingProbe?.failedAttempts ?? 0) + 1,
    ROUTING_PROBE_FAILURE_LIMIT,
  )
  const verdict =
    failedAttempts >= ROUTING_PROBE_FAILURE_LIMIT
      ? 'query'
      : (previous.routingProbe?.verdict ?? 'query')
  return { ...previous, routingProbe: { at, verdict, failedAttempts } }
}

/**
 * A failure's identity, for telling a new one from one already reported.
 *
 * The page **and** the check, because the same check failing on the root and on
 * a region are two different things to fix.
 */
export function seoFailureKey(result: Pick<SeoCheckResult, 'route' | 'check'>): string {
  return `${result.route}#${result.check}`
}

/**
 * Fold one SEO-check run into the stored state, and say which failures are new.
 *
 * ⚠ **This never touches `failureCount`, and must not.** That counter becomes
 * `disable` — canonical ownership switched off and the public URLs withdrawn —
 * and an SEO check failing means the embed is *present and publishing*, with one
 * of its `<head>` fields wrong. Withdrawing a working site's URLs over a missing
 * `<title>` would be the same category error `routingProbe` keeps its own
 * counter to avoid (#644).
 *
 * **"One email per new failure" needs no second column.** The previous snapshot
 * *is* the record of what has already been reported: a failure whose key was
 * failing last time has been mentioned, and one that was passing or absent has
 * not. So a site that stays broken is mailed once, and a site that breaks again
 * after a fix is mailed again — which is the behaviour anyone would want and the
 * one a `notified` list drifts away from.
 */
export function nextSeoCheckState(args: {
  current: CanonicalVerification | null | undefined
  results: SeoCheckResult[]
  now: Date
}): { verification: CanonicalVerification; newFailures: SeoCheckResult[] } {
  const { current, results, now } = args
  const previous = current ?? EMPTY_VERIFICATION

  const failedBefore = new Set(
    (previous.seo?.results ?? [])
      .filter((result) => result.status === 'fail')
      .map((result) => seoFailureKey(result)),
  )
  const newFailures = results.filter(
    (result) => result.status === 'fail' && !failedBefore.has(seoFailureKey(result)),
  )

  return {
    // Spread `previous` first: `verified`, `failureCount` and `routingProbe` are
    // siblings this function does not own.
    verification: { ...previous, seo: { at: now.toISOString(), results } },
    newFailures,
  }
}

/**
 * **How to read the routing verdict:** `verification?.routingProbe?.verdict ??
 * 'query'`, at the call site. There is deliberately no accessor wrapping it.
 *
 * `path` only where the probe has seen the host serve our atlas under the
 * mount's own subtree; `query` otherwise, which is what nearly every client
 * publishes today and is a perfectly good canonical (see `canonicalUrl.ts`).
 *
 * **There is no second answer to disagree with it.** `verified.routing` — the
 * readiness marker's copy of the widget's own script parameter — is no longer
 * written at all, so the record carries the observation and nothing else. The
 * widget's report is still kept as a report, per mount, in `embedMetadata`.
 * (#644)
 *
 * The default belongs to the read path: the `canonical.routing` field's
 * `afterRead` hook (`Clients.ts`) is what the widget reads, and it applies it
 * once. The remaining sites hold a verification object they are about to
 * write, or have just written, and never read through Payload at all.
 *
 * Canonical URLs are built by `@/lib/atlas/canonicalUrl` — `buildCanonicalUrl`
 * over a `canonicalTargetForHost(verified, routing)` target. The routing
 * argument is separate and required precisely so that
 * `canonicalTargetForHost(verified)`, which would shape a URL from the widget's
 * self-report, no longer compiles (#644).
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
