/**
 * Reporting a presented-and-rejected credential, from either denial path.
 *
 * Two things deny a request. Payload's root `afterError` hook sees everything
 * that **throws**. `requireActiveClient` denies by **returning** a 403, so that
 * hook never runs for it and fifteen custom endpoints — `/api/atlas/seo` and
 * `/api/atlas/sitemap` among them — reported nothing at all (#743).
 *
 * Both report the same facts, so the facts are built once, here. A second copy
 * of the tag names or the fingerprint shape would split one Sentry issue in two,
 * which is the failure #734 exists to undo.
 *
 * ⚠ **Nothing here may emit the credential, or any substring of it.** The only
 * value derived from the key is `classifyAuthAttempt`'s truncated SHA-256.
 *
 * Why the signal exists and what it still cannot see: `docs/architecture.md`.
 */
import type { PayloadRequest } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { deploymentEnvironment } from '@/lib/env/deploymentEnvironment'

import { classifyAuthAttempt, type AuthAttempt } from './authAttempt'

/**
 * The one string both denial paths log and capture.
 *
 * ⚠ **One spelling, on purpose.** Prefixing it per call site would split the
 * Railway log query the same way two fingerprints split a Sentry issue. `source`
 * below says which path denied.
 */
export const CREDENTIAL_REJECTED_MESSAGE = 'API credential presented and rejected'

/** Which denial path saw it. Payload's error hook, or the endpoint guard. */
export type RejectionSource = 'sentryPlugin' | 'requireActiveClient'

/** A request whose `Authorization` header authenticated nobody, and its caller. */
export interface RejectedCredential {
  attempt: AuthAttempt
  /**
   * ⚠ **Trust these only as far as the edge.** Cloudflare sets
   * `CF-Connecting-IP`, but a caller reaching the Railway origin directly sets
   * both headers to whatever it likes. The key fingerprint is what actually
   * names an integration.
   */
  userAgent?: string
  ip?: string
}

/**
 * The rejection facts for a request, or `null` when the credential is not what
 * was wrong with it — no header at all, or a caller who did authenticate.
 *
 * Reads every field defensively: a denial must survive a request stub that
 * carries no `headers` and no `payload`.
 */
export const detectRejectedCredential = (req: PayloadRequest): RejectedCredential | null => {
  const attempt = classifyAuthAttempt(
    req.headers?.get?.('authorization'),
    Boolean(req.user),
    // `hasOwn`, not `in`: a header naming `toString` must not read as a real
    // collection off the prototype chain.
    (slug) => Object.hasOwn(req.payload?.collections ?? {}, slug),
  )
  if (attempt.outcome !== 'rejected') return null

  // Read `cf-connecting-ip` the same way `verifyTurnstileOrFail` does.
  return {
    attempt,
    userAgent: req.headers?.get?.('user-agent') ?? undefined,
    ip: req.headers?.get?.('cf-connecting-ip') ?? undefined,
  }
}

/**
 * The Sentry tags every rejected-credential report carries.
 *
 * Tags, not extras, despite the fingerprint's cardinality: naming WHICH
 * integration is broken is the point, and only a tag is searchable.
 */
export const rejectedCredentialTags = ({
  attempt,
}: RejectedCredential): Record<string, string | undefined> => ({
  auth_outcome: attempt.outcome,
  auth_collection: attempt.authCollection,
  auth_scheme: attempt.authScheme,
  key_fingerprint: attempt.keyFingerprint,
})

/**
 * Group by the collection, never by the key fingerprint: one broken integration
 * must not open one Sentry issue per key it presents. `classifyAuthAttempt` has
 * already checked the slug against the real collection list, so this stays
 * bounded. The `key_fingerprint` tag segments within the group.
 */
export const rejectedCredentialFingerprint = (
  { attempt }: RejectedCredential,
  status: number,
): string[] => ['credential-rejected', String(status), attempt.authCollection ?? 'unknown']

/**
 * Mirror the denial to the application log at WARN, so it stays diagnosable
 * from Railway without opening Sentry — the shape `assertClientOriginAllowed`
 * uses.
 */
export const logRejectedCredential = (
  req: PayloadRequest,
  rejected: RejectedCredential,
  { status, source }: { status: number; source: RejectionSource },
): void => {
  req.payload?.logger?.warn({
    msg: CREDENTIAL_REJECTED_MESSAGE,
    source,
    status,
    url: req.url,
    ...rejected.attempt,
    userAgent: rejected.userAgent,
    ip: rejected.ip,
  })
}

/**
 * Report a denial that never throws, so no `afterError` hook will.
 *
 * Safe to call on **every** denial: it returns at once unless a credential was
 * both presented and refused, so an anonymous 403 produces no new signal.
 *
 * ⚠ **Never throws.** A telemetry failure must not turn a caller's 403 into a
 * 500, and this runs on the request's denial path rather than its error path.
 *
 * ⚠ **Accepted risk, inherited from #734 and wider here.** One junk
 * `Authorization` header buys one `error` event and one WARN line, and these
 * endpoints are public. Grouping stays bounded by the collection check, so the
 * cost is event quota and log volume, never one Sentry issue per value invented.
 * Cloudflare's edge rate limiting is what bounds the request rate. Mute the
 * noise with a Sentry rule on `auth_outcome`, never by dropping the level — the
 * level is the signal.
 *
 * ⚠ **Not gated on `NEXT_PUBLIC_SENTRY_DSN`**, unlike `sentryPlugin`, which
 * returns the config untouched without one. `Sentry.captureMessage` is a no-op
 * on an uninitialised SDK, and the WARN line is the half a local run can see.
 */
export const reportRejectedCredential = (
  req: PayloadRequest,
  { status = 403 }: { status?: number } = {},
): void => {
  try {
    const rejected = detectRejectedCredential(req)
    if (!rejected) return

    // Logged before the capture: it is the signal that needs no DSN, no
    // network, and no initialised SDK.
    logRejectedCredential(req, rejected, { status, source: 'requireActiveClient' })

    Sentry.withScope((scope) => {
      scope.setLevel('error')
      Object.entries({
        environment: deploymentEnvironment(),
        ...rejectedCredentialTags(rejected),
      }).forEach(([key, value]) => {
        if (value) scope.setTag(key, value)
      })
      scope.setExtra('status', status)
      scope.setExtra('url', req.url)
      scope.setExtra('userAgent', rejected.userAgent)
      // ⚠ **The IP belongs on `user.ip_address`, never in an `extra`.**
      // `sendDefaultPii: false` and the project's "Prevent Storing of IP
      // Addresses" setting both act on that field alone; an `extra` is opaque
      // context no scrubber reaches.
      if (rejected.ip) scope.setUser({ ip_address: rejected.ip })
      scope.setFingerprint(rejectedCredentialFingerprint(rejected, status))
      Sentry.captureMessage(CREDENTIAL_REJECTED_MESSAGE, 'error')
    })
  } catch {
    // Deliberately silent. The caller is mid-denial and has no way to handle
    // this, and a logger that just failed cannot report its own failure.
  }
}
